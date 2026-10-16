import { convertToUint8Array } from '../lib/bytes.js';
import { closeSocketQuietly } from '../lib/socket.js';
import { CPU_PROFILE, DOWNSTREAM_DIAG } from '../config/flags.js';
import {
  DOWNSTREAM_GRAIN_BYTES, DOWNSTREAM_GRAIN_TAIL_THRESHOLD, DOWNSTREAM_GRAIN_SILENT_MS,
} from '../config/constants.js';

function createDownstreamSender(webSocket, headerData = null, cpuStats = null) {
  const packetCap = DOWNSTREAM_GRAIN_BYTES;
  const tailBytes = DOWNSTREAM_GRAIN_TAIL_THRESHOLD;
  const lowWaterBytes = Math.max(4096, tailBytes << 3);
  let header = headerData;
  let pendingBuffer = new Uint8Array(packetCap);
  let pendingBytes = 0;
  let flushTimer = null;
  let microtaskQueued = false;
  let generation = 0;
  let scheduledGeneration = 0;
  let waitRounds = 0;
  let flushPromise = null;

  const sendRawChunk = async (chunk) => {
    if (webSocket.readyState !== WebSocket.OPEN) throw new Error('ws.readyState is not open');
    const _t0 = CPU_PROFILE ? performance.now() : 0;
    webSocket.send(chunk);
    if (CPU_PROFILE && cpuStats) { cpuStats.sendMs += performance.now() - _t0; cpuStats.sendN++; cpuStats.bytesDown += chunk.byteLength || 0; }
  };

  const attachResponseHeader = (chunk) => {
    if (!header) return chunk;
    const merged = new Uint8Array(header.length + chunk.byteLength);
    merged.set(header, 0);
    merged.set(chunk, header.length);
    header = null;
    return merged;
  };

  const flush = async () => {
    while (flushPromise) await flushPromise;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    microtaskQueued = false;
    if (!pendingBytes) return;
    // No .slice() copy here: pendingBuffer is reassigned to a brand-new
    // buffer on the next line, synchronously, before any await runs. Nothing
    // can write into the old buffer after this point, so the subarray view
    // stays stable for the async send below — this saves a full memcopy on
    // every flush (up to once per DOWNSTREAM_GRAIN_BYTES).
    const output = pendingBuffer.subarray(0, pendingBytes);
    pendingBuffer = new Uint8Array(packetCap);
    pendingBytes = 0;
    waitRounds = 0;
    flushPromise = sendRawChunk(output).finally(() => { flushPromise = null; });
    return flushPromise;
  };

  const scheduleFlush = () => {
    if (flushTimer || microtaskQueued) return;
    microtaskQueued = true;
    scheduledGeneration = generation;
    queueMicrotask(() => {
      microtaskQueued = false;
      if (!pendingBytes || flushTimer) return;
      if (packetCap - pendingBytes < tailBytes) {
        flush().catch(() => closeSocketQuietly(webSocket));
        return;
      }
      flushTimer = setTimeout(() => {
        flushTimer = null;
        if (!pendingBytes) return;
        if (packetCap - pendingBytes < tailBytes) {
          flush().catch(() => closeSocketQuietly(webSocket));
          return;
        }
        // No coalescing delay — flush immediately for best latency.
        flush().catch(() => closeSocketQuietly(webSocket));
      }, Math.max(DOWNSTREAM_GRAIN_SILENT_MS, 1));
    });
  };

  return {
    async sendDirect(data) {
      let chunk = convertToUint8Array(data);
      if (!chunk.byteLength) return;
      chunk = attachResponseHeader(chunk);
      await sendRawChunk(chunk);
    },
    async send(data) {
      let chunk = convertToUint8Array(data);
      if (!chunk.byteLength) return;
      chunk = attachResponseHeader(chunk);
      let offset = 0;
      const totalBytes = chunk.byteLength;
      while (offset < totalBytes) {
        if (!pendingBytes && totalBytes - offset >= packetCap) {
          const sendBytes = Math.min(packetCap, totalBytes - offset);
          const view = offset || sendBytes !== totalBytes ? chunk.subarray(offset, offset + sendBytes) : chunk;
          await sendRawChunk(view);
          offset += sendBytes;
          continue;
        }
        const copyBytes = Math.min(packetCap - pendingBytes, totalBytes - offset);
        const _t0 = CPU_PROFILE ? performance.now() : 0;
        pendingBuffer.set(chunk.subarray(offset, offset + copyBytes), pendingBytes);
        if (CPU_PROFILE && cpuStats) { cpuStats.flushCopyMs += performance.now() - _t0; cpuStats.flushCopyN++; }
        pendingBytes += copyBytes;
        offset += copyBytes;
        generation++;
        if (pendingBytes === packetCap || packetCap - pendingBytes < tailBytes) await flush();
        else scheduleFlush();
      }
    },
    flush
  };
}

async function waitForBackpressure(ws, dsStats = null) {
  // Fast path: skip the async loop entirely when there's no backpressure.
  // This avoids a Promise allocation on every read iteration under normal load.
  if (typeof ws.bufferedAmount !== 'number' || ws.bufferedAmount <= 512 * 1024) return;
  const _t0 = DOWNSTREAM_DIAG ? performance.now() : 0;
  do {
    await new Promise(r => setTimeout(r, 50));
  } while (ws.bufferedAmount > 512 * 1024);
  if (DOWNSTREAM_DIAG && dsStats) {
    dsStats.wsBackpressureWaitMs += performance.now() - _t0;
    dsStats.wsBackpressureWaitN++;
  }
}
export { createDownstreamSender, waitForBackpressure };
