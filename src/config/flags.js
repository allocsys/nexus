// ==========================================================
// 0. Diagnostic / debug switches (DEBUG FLAGS)
// Flip any of these to false to silence that logger. Each one is otherwise
// independent — none of them depend on another being on. See the matching
// newXStats()/logXStats() functions further down for what each one records.
// ==========================================================
// Accumulates synchronous time spent in known hot-path operations, per
// connection, and logs a one-line summary when the connection closes.
// Overhead is a handful of performance.now() calls per chunk — safe to
// leave on briefly to find the real CPU sink, remove once done.
const CPU_PROFILE = true;
// Backpressure diagnostics. Independent of CPU_PROFILE — this stays on/off
// on its own switch so it isn't tied to the CPU-profiling cleanup being done
// separately. Purpose: find out whether UPSTREAM_BACKPRESSURE_BYTES (256KB)
// is actually being hit in real traffic before touching the threshold or the
// bundler further. Overhead: a few counter increments and one Math.max per
// enqueue/wait — no new allocations on the hot path.
const BACKPRESSURE_DIAG = true;
// Downstream/read-side diagnostics. The backpressure-diag logs above showed
// writerWrite (upload) is only ~6-9% of measured time; byobRead (reading
// from the remote socket) is 90%+. This instruments the *download* side
// (connectStreams' read loop, waitForBackpressure) to find out whether that
// byobRead time is genuinely remote-network-bound, or whether client-side WS
// backpressure (waitForBackpressure polling ws.bufferedAmount) is eating
// time that byobReadMs doesn't currently capture (the timer in
// connectStreams starts AFTER waitForBackpressure returns). Independent
// switch, on its own flag — not tied to CPU_PROFILE or BACKPRESSURE_DIAG.
const DOWNSTREAM_DIAG = true;
// Inter-message-gap diagnostics. A real upload (Telegram video,
// 149.154.167.91) showed wallMs=31136ms but sum of every currently-measured
// bucket (byobRead 5143ms + writerWrite 5ms + backpressure wait 0ms) was
// only ~5.1s — leaving ~26s of the connection's lifetime unaccounted for.
// None of the other diagnostics measure the gap BETWEEN incoming WebSocket
// 'message' events from the client — byobRead only measures reads FROM the
// remote destination, not idle time waiting for the NEXT chunk from the
// user's device. If the client is sending in trickles (phone-side chunking /
// limited mobile upload bandwidth), the Worker is correctly idle and none of
// the diagnostics above would show it. This measures that gap directly, at
// the earliest possible point (top of the 'message' listener, before
// pushToChain/wsChain), so it isn't itself distorted by queue/backpressure
// delay downstream of it. Independent switch, own flag.
const MSG_GAP_DIAG = true;
// Mid-connection heartbeat log. All four diagnostics above only log at
// connection close (setOffline) — fine for normal errors, but useless
// against a Cloudflare CPU-time-limit kill, which terminates execution
// abruptly mid-run with no chance for any close-time logging to fire. That
// left a genuine "Worker exceeded CPU time limit" event with zero
// diagnostic trail: no cpu-profile, no addr, nothing to point at.
// This logs a snapshot every HEARTBEAT_LOG_EVERY_N_MSGS processed messages
// (message-count-based rather than wall-clock/setInterval-based, since a
// CPU-bound synchronous stall wouldn't let a timer callback run anyway —
// counting on the message-processing boundaries that already happen gives
// a checkpoint that fires even if the connection dies before ever closing
// normally). Same on/off switch pattern as the others; safe to turn off
// once whatever's tripping the CPU limit is caught.
const HEARTBEAT_DIAG = true;
const HEARTBEAT_LOG_EVERY_N_MSGS = 250;
// Analytics Engine (AE) logging. Master switch — flip to false to stop all
// writeDataPoint calls (open/close/pool-failure) without touching the
// env.ANALYTICS binding itself. Independent of the console.log diagnostics
// above; this is the queryable-via-SQL side of logging (see handleLogs()).
const ANALYTICS_DIAG = true;
// Must match the "dataset" name under [[analytics_engine_datasets]] in wrangler.toml.
const AE_DATASET = 'nexus_logs';
// Event-type strings written to blob1 of every AE data point. Centralized
// here so handleLogs()'s VALID_TYPES/SQL filters and the writeDataPoint call
// sites can never drift out of sync with each other.
const AE_EVENT_OPEN = 'open';
const AE_EVENT_CLOSE = 'close';
const AE_EVENT_POOL_FAILURE = 'pool-failure';
const AE_VALID_TYPES = new Set([AE_EVENT_OPEN, AE_EVENT_CLOSE, AE_EVENT_POOL_FAILURE]);
export {
  CPU_PROFILE, BACKPRESSURE_DIAG, DOWNSTREAM_DIAG, MSG_GAP_DIAG,
  HEARTBEAT_DIAG, HEARTBEAT_LOG_EVERY_N_MSGS, ANALYTICS_DIAG,
  AE_DATASET, AE_EVENT_OPEN, AE_EVENT_CLOSE, AE_EVENT_POOL_FAILURE, AE_VALID_TYPES,
};
