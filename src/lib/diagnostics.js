import { CPU_PROFILE, BACKPRESSURE_DIAG, DOWNSTREAM_DIAG, MSG_GAP_DIAG, HEARTBEAT_DIAG } from '../config/flags.js';
import { UPSTREAM_BACKPRESSURE_BYTES } from '../config/constants.js';

function newCpuStats() {
  return {
    bundleCopyMs: 0, bundleCopyN: 0,
    flushCopyMs: 0, flushCopyN: 0,
    writerWriteMs: 0, writerWriteN: 0,
    byobReadMs: 0, byobReadN: 0,
    sendMs: 0, sendN: 0,
    msgHandleMs: 0, msgHandleN: 0,
    bytesUp: 0, bytesDown: 0,
  };
}
function logCpuStats(stats, connId, username, addr) {
  if (!CPU_PROFILE || !stats) return;
  const totalMs = (stats.bundleCopyMs + stats.flushCopyMs + stats.writerWriteMs + stats.byobReadMs + stats.sendMs + stats.msgHandleMs).toFixed(2);
  console.log(`[cpu-profile] conn=${connId || '?'} user=${username || '?'} addr=${addr || '?'} up=${stats.bytesUp}B down=${stats.bytesDown}B ` +
    `total=${totalMs}ms | bundleCopy=${stats.bundleCopyMs.toFixed(2)}ms(${stats.bundleCopyN}) ` +
    `flushCopy=${stats.flushCopyMs.toFixed(2)}ms(${stats.flushCopyN}) ` +
    `writerWrite=${stats.writerWriteMs.toFixed(2)}ms(${stats.writerWriteN}) ` +
    `byobRead=${stats.byobReadMs.toFixed(2)}ms(${stats.byobReadN}) ` +
    `send=${stats.sendMs.toFixed(2)}ms(${stats.sendN}) ` +
    `msgHandle=${stats.msgHandleMs.toFixed(2)}ms(${stats.msgHandleN})`);
}
// ---------------------------------------------------------------------------

// --- Backpressure diagnostics (see BACKPRESSURE_DIAG flag near the top of the file) ---
function newBackpressureStats() {
  return {
    highWaterBytes: 0,   // largest queuedBytes ever seen for this connection
    waitsImmediate: 0,   // awaitBacklogBelow calls that didn't need to wait
    waitsBlocked: 0,     // awaitBacklogBelow calls that actually waited
    waitsTimedOut: 0,    // of the blocked waits, how many hit the 5s timeout
  };
}
function logBackpressureStats(stats, connId, username, addr) {
  if (!BACKPRESSURE_DIAG || !stats) return;
  console.log(`[backpressure-diag] conn=${connId || '?'} user=${username || '?'} addr=${addr || '?'} ` +
    `highWater=${stats.highWaterBytes}B (threshold=${UPSTREAM_BACKPRESSURE_BYTES}B) ` +
    `waitsImmediate=${stats.waitsImmediate} waitsBlocked=${stats.waitsBlocked} waitsTimedOut=${stats.waitsTimedOut}`);
}
// ---------------------------------------------------------------------------

// --- Downstream/read-side diagnostics (see DOWNSTREAM_DIAG flag near the top of the file) ---
// Fixes an earlier wallMs bug (always 0.00 —
// it was only written in connectStreams' finally block, but the log fires
// from setOffline on the client WS close, which usually happens first/
// independently, so the stat was read before it was ever set). Now
// timestamp-based: startedAtMs is set once at connectStreams entry, and
// wallMs is computed as "now minus startedAtMs" at whatever point the log
// actually fires, regardless of connectStreams' own lifecycle state.
// Also adds maxSingleReadMs/readCount alongside the existing byobRead sum
// (in cpuStats) so we can tell "many small stalls" (sum high, max low)
// apart from "one long idle gap on an otherwise idle persistent socket"
// (max high, sum ~= max, low count) — the latter is likely benign for a
// long-lived Telegram-style connection, not a bug.
function newDownstreamStats() {
  return {
    startedAtMs: null,         // performance.now() timestamp when connectStreams began
    wsBackpressureWaitMs: 0,   // time spent inside waitForBackpressure's polling loop (client WS congested)
    wsBackpressureWaitN: 0,    // number of times waitForBackpressure actually had to poll (not the fast-path skip)
    maxSingleReadMs: 0,        // longest individual reader.read() call observed
    readCount: 0,              // number of reader.read() calls observed
  };
}
function logDownstreamStats(stats, connId, username, addr) {
  if (!DOWNSTREAM_DIAG || !stats) return;
  const wallMs = stats.startedAtMs != null ? performance.now() - stats.startedAtMs : 0;
  console.log(`[downstream-diag] conn=${connId || '?'} user=${username || '?'} addr=${addr || '?'} ` +
    `wallMs=${wallMs.toFixed(2)} ` +
    `wsBackpressureWait=${stats.wsBackpressureWaitMs.toFixed(2)}ms(${stats.wsBackpressureWaitN}) ` +
    `maxSingleRead=${stats.maxSingleReadMs.toFixed(2)}ms readCount=${stats.readCount}`);
}
// ---------------------------------------------------------------------------

// --- Inter-message-gap diagnostics (see MSG_GAP_DIAG flag near the top of the file) ---
function newMsgGapStats() {
  return {
    lastMsgAtMs: null,  // performance.now() timestamp of the previous message event
    sumMs: 0,           // total time spent waiting between successive message events
    maxMs: 0,           // largest single gap between two successive message events
    count: 0,           // number of gaps measured (message events after the first)
  };
}
function logMsgGapStats(stats, connId, username, addr) {
  if (!MSG_GAP_DIAG || !stats) return;
  console.log(`[msg-gap-diag] conn=${connId || '?'} user=${username || '?'} addr=${addr || '?'} ` +
    `gapSum=${stats.sumMs.toFixed(2)}ms maxGap=${stats.maxMs.toFixed(2)}ms gapCount=${stats.count}`);
}
// ---------------------------------------------------------------------------

// --- Mid-connection heartbeat (see HEARTBEAT_DIAG flag near the top of the file) ---
// Unlike the four diagnostics above, this doesn't wait for connection close —
// it's called directly from processWsMessage every HEARTBEAT_LOG_EVERY_N_MSGS
// messages, so it has a chance to fire even if the connection is later killed
// by the runtime (CPU-time-limit terminations happen before any close-time
// logging can run). connStartMs is captured once when the connection begins.
function logHeartbeat(connId, username, addr, msgCount, bytesUp, connStartMs) {
  if (!HEARTBEAT_DIAG) return;
  const wallMs = connStartMs != null ? performance.now() - connStartMs : 0;
  console.log(`[heartbeat] conn=${connId || '?'} user=${username || '?'} addr=${addr || '?'} ` +
    `msgCount=${msgCount} bytesUp=${bytesUp}B wallMs=${wallMs.toFixed(2)}`);
}
export {
  newCpuStats, logCpuStats, newBackpressureStats, logBackpressureStats,
  newDownstreamStats, logDownstreamStats, newMsgGapStats, logMsgGapStats, logHeartbeat,
};
