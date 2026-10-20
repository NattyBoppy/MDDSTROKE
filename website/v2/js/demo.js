/*
  demo.js: a pretend device, so the site can be tried with no hardware.
  ----------------------------------------------------------------------
  It behaves like the real board: every 20 ms it sends text lines
  (F, M and E, or D in "index sensor only" mode) through the SAME parser
  the real USB / Bluetooth data goes through. It even starts with an
  ESP32-style boot message and cuts lines into random chunks, to prove
  the parser copes.

  The sliders on the page set where each pretend finger is.
  It understands the same three commands as the firmware: o (open), c (close), s (stop).
*/
import { checkCommand } from './protocol.js';

// Raw readings the pretend sensors give. Like our wiring: bending LOWERS the number.
export const DEMO_RAW = { straight: 3200, bent: 2200 };

// Pretend servo range, like SAFE_MIN / SAFE_MAX in finger_xiao_safe. Display only.
const SERVO_CLOSED = 60, SERVO_OPEN = 110;
const MOTOR_SPEED = 0.6;          // fraction of the full range per second

export class DemoDevice {
  constructor({ onText, onSliders }) {
    this.onText = onText;           // where the pretend text lines go (into the LineBuffer)
    this.onSliders = onSliders;     // tells the page to move the sliders when the motor moves them
    this.bend = [0.35, 0.25, 0.3, 0.35, 0.4];   // thumb, index, middle, ring, little (0 straight .. 1 fist)
    this.state = 'IDLE';
    this.indexOnly = false;         // true = send old v1 "D," lines (one sensor on the index)
    this.resist = false;            // true = pretend the finger fights the motor -> BLOCKED
    this.auto = false;
    this.autoTimer = null;
    this.timer = null;
    this.t0 = 0;
    this.emg = 25;
  }

  start() {
    this.t0 = performance.now();
    this.last = this.t0;
    // a fake ESP32 boot message: the page must ignore it
    this.onText('ESP-ROM:esp32s3-20210327\r\nrst:0x1 (POWERON),boot:0x8 (SPI_FAST_FLASH_BOOT)\r\nentry 0x403c98d4\r\n');
    this.timer = setInterval(() => this.tick(), 20);
  }

  stop() {
    clearInterval(this.timer); this.timer = null;
    this.setAuto(false);
  }

  get running() { return this.timer !== null; }

  // Slider moved by the user (open = 0..100 % open).
  setFinger(i, openPct) {
    if (this.state === 'OPENING' || this.state === 'CLOSING') return;   // motor is in charge right now
    this.bend[i] = 1 - openPct / 100;
  }

  send(ch) {
    checkCommand(ch);
    if (ch === 'o') this.state = 'OPENING';
    if (ch === 'c') this.state = 'CLOSING';
    if (ch === 's') { this.state = 'PAUSED'; this.setAuto(false); }
  }

  // Auto cycle: open, wait, close, wait, repeat.
  setAuto(on) {
    this.auto = on;
    clearTimeout(this.autoTimer);
    if (!on) return;
    const step = () => {
      if (!this.auto) return;
      const next = this.state === 'OPEN' || this.state === 'OPENING' ? 'c' : 'o';
      this.send(next);
      this.autoTimer = setTimeout(step, 3200);
    };
    step();
  }

  tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const t = (now - this.t0) / 1000;

    // pretend motor: moves all fingers together
    if (this.state === 'OPENING' || this.state === 'CLOSING') {
      const dir = this.state === 'OPENING' ? -1 : 1;
      let done = true;
      for (let i = 0; i < 5; i++) {
        // fingers move at slightly different speeds, like a real whiffletree
        const speed = MOTOR_SPEED * (0.85 + 0.06 * i);
        this.bend[i] = clamp01(this.bend[i] + dir * speed * dt);
        if (dir < 0 ? this.bend[i] > 0.02 : this.bend[i] < 0.95) done = false;
      }
      if (this.resist && this.state === 'OPENING' && avg(this.bend) < 0.55) this.state = 'BLOCKED';
      else if (done) this.state = this.state === 'OPENING' ? 'OPEN' : 'CLOSED';
      this.onSliders(this.bend.map(b => Math.round((1 - b) * 100)));
    }

    // pretend sensor readings, with a little noise
    const raw = this.bend.map(b => Math.round(DEMO_RAW.straight - b * (DEMO_RAW.straight - DEMO_RAW.bent) + (Math.random() - 0.5) * 12));
    const fingers4 = avg(this.bend.slice(1));
    const servo1 = Math.round(SERVO_CLOSED + (SERVO_OPEN - SERVO_CLOSED) * (1 - fingers4));
    const servo2 = Math.round(SERVO_CLOSED + (SERVO_OPEN - SERVO_CLOSED) * (1 - this.bend[0]));

    // pretend EMG: quiet at rest, a burst while the "patient" tries to open
    const trying = this.state === 'OPENING' || this.state === 'BLOCKED';
    const target = trying ? 170 + 30 * Math.sin(t * 9) : 25;
    this.emg += (target - this.emg) * 0.15 + (Math.random() - 0.5) * 10;
    const ext = Math.max(0, this.emg);
    const flx = Math.max(0, 18 + (Math.random() - 0.5) * 8 + (this.state === 'CLOSING' ? 40 : 0));
    const on = ext > 100 ? 1 : 0;

    let text = '';
    if (this.indexOnly) text += `D,${raw[1]},${servo1},${this.state}\n`;
    else text += `F,${raw.join(',')}\nM,${servo1},${servo2},${this.state}\n`;
    text += `E,${ext.toFixed(1)},${flx.toFixed(1)},${on}\n`;

    // deliver in random pieces, like Bluetooth and USB do
    const cut = Math.floor(Math.random() * text.length);
    this.onText(text.slice(0, cut));
    this.onText(text.slice(cut));
  }
}

function clamp01(v) { return Math.min(1, Math.max(0, v)); }
function avg(a) { return a.reduce((s, v) => s + v, 0) / a.length; }
