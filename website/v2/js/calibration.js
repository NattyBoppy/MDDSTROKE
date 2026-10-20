/*
  calibration.js: turns a raw flex reading (0..4095) into a bend (0 = straight, 1 = full fist).
  ------------------------------------------------------------------------------------------
  Per finger we store two numbers: the reading when STRAIGHT and when FULLY BENT.
    bend = (straight - raw) / (straight - bent)      then clamped to 0..1
  This works whichever way the sensor goes. On our wiring (3V3 -> flex -> pin -> 47k -> GND)
  bending LOWERS the reading, so "straight" is the bigger number. If a sensor is wired the
  other way round, "bent" is simply the bigger number and the same formula still works.

  Until a finger is calibrated we guess from the lowest and highest readings seen so far.
  Saved in this browser (localStorage). Can be exported / imported as a JSON file.
*/
import { FINGERS } from './protocol.js';

const MIN_SPREAD = 40;   // readings must differ by at least this much before a guess is trusted

// localStorage can be blocked (private window, strict settings). Never let that crash the page.
const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
};

export class Calibration {
  /**
   * @param key       localStorage key (the demo uses its own key so it never overwrites the real one)
   * @param defaults  optional starting values, e.g. { straight: 3200, bent: 2200 } for every finger
   */
  constructor(key, defaults = null) {
    this.key = key;
    this.defaults = defaults;
    this.fingers = {};
    this.bendRaises = false;    // only used for guessing: true if a sensor reads HIGHER when bent
    this.load();
    this.resetSeen();
  }

  load() {
    const saved = store.get(this.key);
    for (const f of FINGERS) {
      const s = saved && saved[f];
      this.fingers[f] = {
        straight: isNum(s && s.straight) ? s.straight : (this.defaults ? this.defaults.straight : null),
        bent: isNum(s && s.bent) ? s.bent : (this.defaults ? this.defaults.bent : null),
      };
    }
  }

  save() { return store.set(this.key, this.fingers); }

  resetSeen() { this.seen = Object.fromEntries(FINGERS.map(f => [f, { min: Infinity, max: -Infinity }])); }

  // Call this with every new raw reading, so the "guess" range keeps learning.
  observe(finger, raw) {
    const s = this.seen[finger];
    if (raw < s.min) s.min = raw;
    if (raw > s.max) s.max = raw;
  }

  isCalibrated(finger) {
    const c = this.fingers[finger];
    return isNum(c.straight) && isNum(c.bent) && Math.abs(c.straight - c.bent) >= 1;
  }

  /** raw reading -> bend 0..1, or null if we cannot tell yet. */
  bend(finger, raw) {
    if (!isNum(raw)) return null;
    let straight, bent;
    if (this.isCalibrated(finger)) {
      ({ straight, bent } = this.fingers[finger]);
    } else {
      const s = this.seen[finger];
      if (!(s.max - s.min >= MIN_SPREAD)) return 0;            // not enough movement seen yet: show straight
      straight = this.bendRaises ? s.min : s.max;
      bent = this.bendRaises ? s.max : s.min;
    }
    return clamp01((straight - raw) / (straight - bent));
  }

  setStraight(finger, raw) { this.fingers[finger].straight = Math.round(raw); return this.save(); }
  setBent(finger, raw) { this.fingers[finger].bent = Math.round(raw); return this.save(); }

  clear() {
    for (const f of FINGERS) this.fingers[f] = { straight: this.defaults ? this.defaults.straight : null, bent: this.defaults ? this.defaults.bent : null };
    this.resetSeen();
    this.save();
  }

  // A short description for the UI, e.g. "straight 3210 · bent 2250" or "not calibrated".
  describe(finger) {
    const c = this.fingers[finger];
    if (this.isCalibrated(finger)) return `straight ${c.straight} · bent ${c.bent}`;
    const parts = [];
    if (isNum(c.straight)) parts.push(`straight ${c.straight}`);
    if (isNum(c.bent)) parts.push(`bent ${c.bent}`);
    return parts.length ? parts.join(' · ') + ' (need both)' : 'not calibrated';
  }

  /** The text of a .json file with the calibration in it. */
  toJSON() {
    return JSON.stringify({ app: 'exohand-v2', kind: 'flex-calibration', version: 1, savedAt: new Date().toISOString(), fingers: this.fingers }, null, 2);
  }

  /** Reads a .json file's text. Throws an Error with a friendly message if it is not a calibration file. */
  fromJSON(text) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
    const f = data && (data.fingers || data);
    if (!f || typeof f !== 'object') throw new Error('That file has no finger calibration in it.');
    let count = 0;
    const next = {};
    for (const name of FINGERS) {
      const c = f[name] || {};
      next[name] = { straight: isNum(c.straight) ? c.straight : null, bent: isNum(c.bent) ? c.bent : null };
      if (next[name].straight !== null || next[name].bent !== null) count++;
    }
    if (!count) throw new Error('That file has no straight / bent numbers in it.');
    this.fingers = next;
    this.save();
    return count;
  }
}

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function clamp01(v) { return Math.min(1, Math.max(0, v)); }
