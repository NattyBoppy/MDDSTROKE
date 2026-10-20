/*
  protocol.js: understands the text lines the device sends.
  ----------------------------------------------------------
  The device sends one line of text every 20-50 ms (see CLAUDE.md):

    D,<flex_raw>,<servo_deg>,<state>              v1 format, one finger (= index)
    F,<thumb>,<index>,<middle>,<ring>,<little>    raw flex 0..4095, -1 = no sensor fitted
    M,<servo1_deg>,<servo2_deg>,<state>           motors
    E,<extensor_mV>,<flexor_mV>,<on 0|1>          EMG envelope + trigger

  Anything else (ESP32 boot messages, half lines, typos) is IGNORED, never an error.
  This file has no browser code in it, so it can be tested with plain Node:
      node website/v2/tests/protocol.test.mjs
*/

// Finger order used everywhere in v2 (same order as the F line).
export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'little'];

// Device states the firmware can report.
export const STATES = ['CLOSED', 'OPENING', 'OPEN', 'CLOSING', 'PAUSED', 'IDLE', 'BLOCKED'];

// The ONLY commands the website is allowed to send. The firmware owns the motor limits.
export const COMMANDS = { open: 'o', close: 'c', stop: 's' };
const ALLOWED = new Set(Object.values(COMMANDS));

/** Returns the command character if it is allowed (o, c or s), otherwise throws. */
export function checkCommand(ch) {
  if (!ALLOWED.has(ch)) throw new Error(`Blocked: the website may only send o, c or s (tried "${ch}")`);
  return ch;
}

// A whole number, optionally negative. Nothing else allowed (no "12abc", no "1.5").
const INT = /^-?\d{1,6}$/;
const toInt = s => (INT.test(s) ? parseInt(s, 10) : null);
// EMG millivolts may have decimals.
const NUM = /^-?\d{1,6}(\.\d{1,4})?$/;
const toNum = s => (NUM.test(s) ? parseFloat(s) : null);

const flexOk = v => v === -1 || (v >= 0 && v <= 4095);

/**
 * Turns one line of text into an object, or returns null if the line is not understood.
 *   parseLine('F,-1,2310,-1,-1,-1')  ->  { type:'F', flex:[null,2310,null,null,null] }
 * Missing sensors (-1) become null.
 */
export function parseLine(line) {
  if (typeof line !== 'string') return null;
  const parts = line.trim().split(',').map(p => p.trim());
  const kind = parts[0];

  if (kind === 'D') {
    // v1 single finger. The state is optional (old sketches sometimes left it out).
    if (parts.length < 3 || parts.length > 4) return null;
    const raw = toInt(parts[1]), servo = toInt(parts[2]);
    if (raw === null || servo === null || !flexOk(raw)) return null;
    const state = parts[3] ? cleanState(parts[3]) : '';
    if (state === null) return null;
    return { type: 'D', raw: raw === -1 ? null : raw, servo, state };
  }

  if (kind === 'F') {
    if (parts.length !== 6) return null;
    const flex = parts.slice(1).map(toInt);
    if (flex.some(v => v === null || !flexOk(v))) return null;
    return { type: 'F', flex: flex.map(v => (v === -1 ? null : v)) };
  }

  if (kind === 'M') {
    if (parts.length < 3 || parts.length > 4) return null;
    const s1 = toInt(parts[1]), s2 = toInt(parts[2]);
    if (s1 === null || s2 === null) return null;
    const state = parts[3] ? cleanState(parts[3]) : '';
    if (state === null) return null;
    return { type: 'M', servo1: s1, servo2: s2, state };
  }

  if (kind === 'E') {
    if (parts.length !== 4) return null;
    const ext = toNum(parts[1]), flx = toNum(parts[2]);
    if (ext === null || flx === null || (parts[3] !== '0' && parts[3] !== '1')) return null;
    return { type: 'E', extensor: ext, flexor: flx, on: parts[3] === '1' };
  }

  return null;
}

// Accepts a known state word (any case). Unknown words make the whole line invalid.
function cleanState(s) {
  const up = s.toUpperCase();
  return STATES.includes(up) ? up : null;
}

/**
 * LineBuffer: USB and Bluetooth deliver text in random-sized chunks.
 * A line can arrive in two halves ("F,12" then "00,-1,...\n").
 * Push every chunk in; complete lines come out through the callback.
 */
export class LineBuffer {
  constructor(onLine) {
    this.onLine = onLine;     // called with each complete line (a string)
    this.rest = '';           // the unfinished part of the last chunk
    this.maxLength = 200;     // a real line is ~30 characters; longer = junk
  }

  push(chunk) {
    if (typeof chunk !== 'string' || chunk === '') return;
    this.rest += chunk;
    // Lines can end in \n, \r\n or just \r (all three appear in the wild).
    const pieces = this.rest.split(/\r\n|\n|\r/);
    this.rest = pieces.pop();                     // last piece has no line end yet
    if (this.rest.length > this.maxLength) this.rest = '';   // never grow forever
    for (const p of pieces) {
      const line = p.trim();
      if (line) this.onLine(line);
    }
  }

  clear() { this.rest = ''; }
}
