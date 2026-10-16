import { convertToUint8Array } from '../lib/bytes.js';
import { CPU_PROFILE } from '../config/flags.js';
import {
  UPSTREAM_BUNDLE_TARGET_BYTES, UPSTREAM_QUEUE_MAX_BYTES,
  UPSTREAM_QUEUE_MAX_ITEMS, UPSTREAM_BACKPRESSURE_TIMEOUT_MS,
} from '../config/constants.js';

function createUpstreamQueue({ getWriter, releaseWriter, retryConnect, closeConnection, name = 'UpstreamQueue', cpuStats = null, bpStats = null }) {
  let chunks = [];
  let head = 0;
  let queuedBytes = 0;
  let draining = false;
  let closed = false;
  // Previously: `let bundleBuffer = null;` — a single shared
  // buffer reused on every bundle() call. Theoretical risk: if the
  // underlying socket's write() resolves before the sink has actually
  // finished reading the bytes (rather than copying them synchronously),
  // the next bundle() call could overwrite data still in flight. drain()
  // always awaits writer.write() before calling bundle() again, so this
  // never happens back-to-back — but a ping-pong pair adds a full extra
  // write-cycle of headroom before any one buffer is reused, at the cost
  // of one extra small allocation (two 32KB buffers instead of one).
  let bundleBuffers = [null, null];
  let bundleBufferIdx = 0;
  let idleResolvers = [];
  // Waiter list for awaitBacklogBelow(threshold), used by writeToRemote to
  // apply backpressure once the queue backlog crosses the threshold.
  let backpressureResolvers = [];
  let activeCompletions = null;

  const settleCompletions = (completions, err = null) => {
    if (!completions) return;
    for (const comp of completions) {
      if (comp) {
        if (err) comp.reject(err);
        else comp.resolve();
      }
    }
  };

  const rejectQueued = (err) => {
    for (let i = head; i < chunks.length; i++) {
      const item = chunks[i];
      if (item && item.completions) settleCompletions(item.completions, err);
    }
  };

  const compact = () => {
    if (head > 32 && head * 2 >= chunks.length) {
      chunks = chunks.slice(head);
      head = 0;
    }
  };

  const resolveIdle = () => {
    if (queuedBytes || draining || !idleResolvers.length) return;
    const resolvers = idleResolvers;
    idleResolvers = [];
    for (const resolve of resolvers) resolve();
  };

  // Wakes any awaitBacklogBelow() callers whose threshold the backlog has
  // now dropped to or under.
  const resolveBackpressure = () => {
    if (!backpressureResolvers.length) return;
    const stillWaiting = [];
    for (const waiter of backpressureResolvers) {
      if (queuedBytes <= waiter.threshold) waiter.resolve();
      else stillWaiting.push(waiter);
    }
    backpressureResolvers = stillWaiting;
  };

  const clear = (err = null) => {
    const closeErr = err || (closed ? new Error(`${name}: queue closed`) : null);
    if (closeErr) {
      rejectQueued(closeErr);
      settleCompletions(activeCompletions, closeErr);
      activeCompletions = null;
    }
    chunks = [];
    head = 0;
    queuedBytes = 0;
    resolveIdle();
    resolveBackpressure();
  };

  const shift = () => {
    if (head >= chunks.length) return null;
    const item = chunks[head];
    chunks[head++] = undefined;
    queuedBytes -= item.chunk.byteLength;
    compact();
    resolveBackpressure();
    return item;
  };

  const bundle = () => {
    const first = shift();
    if (!first) return null;
    if (head >= chunks.length || first.chunk.byteLength >= UPSTREAM_BUNDLE_TARGET_BYTES) return first;

    let byteLength = first.chunk.byteLength;
    let end = head;
    let allowRetry = first.allowRetry;
    let completions = first.completions || null;
    while (end < chunks.length) {
      const next = chunks[end];
      const nextLength = byteLength + next.chunk.byteLength;
      if (nextLength > UPSTREAM_BUNDLE_TARGET_BYTES) break;
      byteLength = nextLength;
      allowRetry = allowRetry && next.allowRetry;
      if (next.completions) completions = completions ? completions.concat(next.completions) : next.completions;
      end++;
    }
    if (end === head) return first;

    const _t0 = CPU_PROFILE ? performance.now() : 0;
    const output = (bundleBuffers[bundleBufferIdx] ||= new Uint8Array(UPSTREAM_BUNDLE_TARGET_BYTES));
    bundleBufferIdx = 1 - bundleBufferIdx;
    output.set(first.chunk);
    let offset = first.chunk.byteLength;
    while (head < end) {
      const next = chunks[head];
      chunks[head++] = undefined;
      queuedBytes -= next.chunk.byteLength;
      output.set(next.chunk, offset);
      offset += next.chunk.byteLength;
    }
    compact();
    resolveBackpressure();
    if (CPU_PROFILE && cpuStats) { cpuStats.bundleCopyMs += performance.now() - _t0; cpuStats.bundleCopyN++; }
    return { chunk: output.subarray(0, byteLength), allowRetry, completions };
  };

  const drain = async () => {
    if (draining || closed) return;
    draining = true;
    try {
      for (; ;) {
        if (closed) break;
        const item = bundle();
        if (!item) break;
        let writer = getWriter();
        if (!writer) throw new Error(`${name}: remote writer unavailable`);
        const completions = item.completions || null;
        activeCompletions = completions;
        try {
          try {
            const _t0 = CPU_PROFILE ? performance.now() : 0;
            await writer.write(item.chunk);
            if (CPU_PROFILE && cpuStats) { cpuStats.writerWriteMs += performance.now() - _t0; cpuStats.writerWriteN++; }
          } catch (err) {
            releaseWriter?.();
            if (!item.allowRetry || typeof retryConnect !== 'function') throw err;
            await retryConnect();
            writer = getWriter();
            if (!writer) throw err;
            await writer.write(item.chunk);
          }
          settleCompletions(completions);
        } catch (err) {
          settleCompletions(completions, err);
          throw err;
        } finally {
          if (activeCompletions === completions) activeCompletions = null;
        }
      }
    } catch (err) {
      closed = true;
      clear(err);
      try { closeConnection?.(err); } catch (_) {}
    } finally {
      draining = false;
      if (!closed && head < chunks.length) queueMicrotask(drain);
      else resolveIdle();
    }
  };

  const enqueue = (data, allowRetry = true, waitForFlush = false) => {
    if (closed) return false;
    if (!getWriter()) return false;
    const chunk = convertToUint8Array(data);
    if (!chunk.byteLength) return true;
    const nextBytes = queuedBytes + chunk.byteLength;
    const nextItems = chunks.length - head + 1;
    if (nextBytes > UPSTREAM_QUEUE_MAX_BYTES || nextItems > UPSTREAM_QUEUE_MAX_ITEMS) {
      closed = true;
      const err = Object.assign(new Error(`${name}: upload queue overflow (${nextBytes}B/${nextItems})`), { isQueueOverflow: true });
      clear(err);
      try { closeConnection?.(err); } catch (_) {}
      throw err;
    }
    let completionPromise = null;
    let completions = null;
    if (waitForFlush) {
      completions = [];
      completionPromise = new Promise((resolve, reject) => completions.push({ resolve, reject }));
    }
    chunks.push({ chunk, allowRetry, completions });
    queuedBytes = nextBytes;
    if (bpStats && queuedBytes > bpStats.highWaterBytes) bpStats.highWaterBytes = queuedBytes;
    if (!draining) queueMicrotask(drain);
    return waitForFlush ? completionPromise.then(() => true) : true;
  };

  return {
    writeAndAwait(data, allowRetry = true) { return enqueue(data, allowRetry, true); },
    // enqueueNoWait returns synchronously — same true/false signal
    // writeToRemote's callers already rely on (false = no writer yet /
    // closed) — without waiting for the chunk to actually reach the remote
    // socket.
    enqueueNoWait(data, allowRetry = true) { return enqueue(data, allowRetry, false); },
    // Resolves immediately if backlog is already at/under threshold,
    // otherwise waits for resolveBackpressure() (via shift/bundle/clear) to
    // release it. Takes a timeout: if the backlog hasn't
    // drained below `threshold` within `timeoutMs`, give up waiting and
    // let the caller proceed anyway rather than hang wsChain indefinitely.
    // This trades strict backpressure for connection liveness when drain()
    // is stuck (e.g. a hung writer.write() or a retryConnect() that never
    // settles) — better to let the connection push ahead and rely on the
    // existing hard UPSTREAM_QUEUE_MAX_BYTES/ITEMS overflow guard than to
    // freeze the whole upload side of the connection permanently.
    async awaitBacklogBelow(threshold, timeoutMs = UPSTREAM_BACKPRESSURE_TIMEOUT_MS) {
      if (queuedBytes <= threshold) {
        if (bpStats) bpStats.waitsImmediate++;
        return;
      }
      if (bpStats) bpStats.waitsBlocked++;
      await new Promise(resolve => {
        let settled = false;
        const waiter = {
          threshold,
          resolve: () => {
            if (settled) return;
            settled = true;
            resolve();
          }
        };
        backpressureResolvers.push(waiter);
        if (timeoutMs > 0) {
          setTimeout(() => {
            if (settled) return;
            const idx = backpressureResolvers.indexOf(waiter);
            if (idx !== -1) backpressureResolvers.splice(idx, 1);
            if (bpStats) bpStats.waitsTimedOut++;
            waiter.resolve();
          }, timeoutMs);
        }
      });
    },
    async awaitEmpty() {
      if (!queuedBytes && !draining) return;
      await new Promise(resolve => idleResolvers.push(resolve));
    },
    clear() { closed = true; clear(); }
  };
}
export { createUpstreamQueue };
