/*
  main.js: connects all the parts of website v2.
  ------------------------------------------------
  data in  (USB / Bluetooth / demo)  ->  LineBuffer + parseLine (protocol.js)
           ->  calibration (raw -> bend)  ->  3D hand (hand.js), finger cards, charts
  buttons  ->  only ever "o", "c" or "s" to the device. STOP and the Space key send "s".
*/
import { FINGERS, COMMANDS, LineBuffer, parseLine } from './protocol.js';
import { HandView } from './hand.js';
import { Calibration } from './calibration.js';
import { LiveChart } from './charts.js';
import { DemoDevice, DEMO_RAW } from './demo.js';
import { SerialConnection, usbSupported } from './serial.js';
import { BleConnection, bleSupported } from './ble.js';

const $ = id => document.getElementById(id);
const LABEL = { thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', little: 'Little' };
const STALE_MS = 1500;          // a finger with no reading for this long counts as "no sensor"

/* ---------------- saved settings (theme, hand side, skin, ...) ---------------- */
const SETTINGS_KEY = 'exohand-v2-settings';
const settings = Object.assign({ side: 'right', skin: 0, follow: 'index', threshold: 100, theme: '', bendRaises: false },
  readJSON(SETTINGS_KEY));
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* blocked: fine */ } }
function readJSON(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }

/* ---------------- live state ---------------- */
const S = {
  mode: 'none',                       // 'none' | 'usb' | 'ble' | 'demo'
  conn: null,                         // the open USB or Bluetooth connection
  raw: [null, null, null, null, null],// last raw flex reading per finger
  rawAt: [0, 0, 0, 0, 0],             // when it arrived (ms)
  shown: [0, 0, 0, 0, 0],             // bend shown for each finger (0..1)
  source: ['', '', '', '', ''],       // 'sensor' | 'slider' | 'index'
  servo1: null, servo2: null, servoAt: 0,
  state: '',
  emg: { ext: null, flex: null, on: false, at: 0 },
  lines: 0, ignored: 0, lastGoodAt: 0, lastAnyAt: 0,
  log: [],
  recording: false, rec: [], recStart: 0,
};

/* ---------------- calibration (the demo uses its own, so it never touches the real one) ---------------- */
const calReal = new Calibration('exohand-v2-cal');
const calDemo = new Calibration('exohand-v2-cal-demo', DEMO_RAW);
calReal.bendRaises = calDemo.bendRaises = settings.bendRaises;
const cal = () => (S.mode === 'demo' ? calDemo : calReal);

/* ---------------- incoming lines ---------------- */
const buffer = new LineBuffer(handleLine);

function handleLine(line) {
  const msg = parseLine(line);
  logLine(line, !!msg);
  S.lastAnyAt = performance.now();
  if (!msg) { S.ignored++; return; }
  S.lines++;
  const now = performance.now();
  S.lastGoodAt = now;

  if (msg.type === 'D') {                      // v1: one sensor = index finger
    setRaw(1, msg.raw, now);
    S.servo1 = msg.servo; S.servoAt = now;
    if (msg.state) S.state = msg.state;
  } else if (msg.type === 'F') {
    msg.flex.forEach((raw, i) => setRaw(i, raw, now));
  } else if (msg.type === 'M') {
    S.servo1 = msg.servo1; S.servo2 = msg.servo2; S.servoAt = now;
    if (msg.state) S.state = msg.state;
  } else if (msg.type === 'E') {
    S.emg = { ext: msg.extensor, flex: msg.flexor, on: msg.on, at: now };
  }
}

function setRaw(i, raw, now) {
  if (raw == null) return;                     // -1 = no sensor: leave it as "no data"
  S.raw[i] = raw;
  S.rawAt[i] = now;
  cal().observe(FINGERS[i], raw);
}

const fresh = (at, now) => at > 0 && now - at < STALE_MS;          // did this arrive recently?
const hasSensor = (i, now) => S.raw[i] != null && fresh(S.rawAt[i], now);

function logLine(line, ok) {
  S.log.push((ok ? '  ' : '✗ ') + line.slice(0, 80));
  if (S.log.length > 14) S.log.shift();
}

/* ---------------- sending commands (only o / c / s) ---------------- */
async function send(ch) {
  try {
    if (S.conn) await S.conn.send(ch);
    else if (S.mode === 'demo') demo.send(ch);
    else { setStatus('Not connected, so nothing was sent. Connect by USB or Bluetooth, or start the demo.', 'warn'); return false; }
    return true;
  } catch (err) {
    setStatus('Could not send to the device: ' + (err && err.message ? err.message : 'unknown error'), 'bad');
    return false;
  }
}

function stopNow() {
  const b = $('cmdStop');
  b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
  demo.setAuto(false); updateAutoButton();
  send(COMMANDS.stop).then(ok => { if (ok) setStatus('STOP sent.', 'ok'); });
}

/* ---------------- connecting ---------------- */
function setStatus(msg, kind = '') { const el = $('status'); el.textContent = msg; el.className = 'status ' + kind; }

function setMode(mode) {
  S.mode = mode;
  const pill = $('connPill');
  pill.dataset.kind = mode;
  pill.textContent = { none: 'Not connected', usb: 'Connected by USB', ble: 'Connected by Bluetooth', demo: 'Demo' }[mode];
  const busy = mode !== 'none';
  $('btnUsb').disabled = busy; $('btnBle').disabled = busy;
  $('btnDisc').hidden = !(mode === 'usb' || mode === 'ble');
  $('btnDemo').textContent = mode === 'demo' ? 'Stop demo' : 'Demo (no hardware)';
  $('btnDemo').disabled = mode === 'usb' || mode === 'ble';
  $('cmdOpen').disabled = $('cmdClose').disabled = !busy;
  $('btnAuto').disabled = mode !== 'demo';
  $('demoOptions').hidden = mode !== 'demo';
  $('calModeHint').textContent = mode === 'demo'
    ? 'Demo mode uses its own practice calibration. Your real calibration is kept safe.'
    : '';
  updateAutoButton();
  renderCalRows();
}

function resetLive() {
  buffer.clear();
  S.raw = [null, null, null, null, null];
  S.rawAt = [0, 0, 0, 0, 0];
  S.servo1 = S.servo2 = null;
  S.state = '';
  S.emg = { ext: null, flex: null, on: false, at: 0 };
  S.lastGoodAt = 0;
  S.lastAnyAt = 0;
}

async function connect(kind) {
  if (S.mode === 'demo') stopDemo();
  const Conn = kind === 'usb' ? SerialConnection : BleConnection;
  const conn = new Conn({
    onText: text => buffer.push(text),
    onClose: msg => { if (S.conn === conn) { S.conn = null; setMode('none'); setStatus(msg, msg === 'Disconnected.' ? '' : 'warn'); } },
  });
  setStatus(kind === 'usb' ? 'Pick the board in the pop-up…' : 'Pick ExoHand in the pop-up…');
  try {
    await conn.open();
  } catch (err) {
    setStatus(err.message, 'warn');
    return;
  }
  resetLive();
  calReal.resetSeen();
  S.conn = conn;
  S.connectedAt = performance.now();
  setMode(kind);
  setStatus(kind === 'usb' ? 'Connected by USB. Waiting for readings…' : `Connected by Bluetooth to ${conn.name}. Waiting for readings…`, 'ok');
}

async function disconnect() {
  const c = S.conn;
  if (c) await c.close();
}

/* ---------------- demo ---------------- */
const demo = new DemoDevice({
  onText: text => buffer.push(text),
  onSliders: values => values.forEach((v, i) => { sliders[i].value = v; sliderOut[i].textContent = v + '%'; }),
});

function startDemo() {
  if (S.conn) return;
  resetLive();
  calDemo.resetSeen();
  sliders.forEach((s, i) => demo.setFinger(i, +s.value));
  demo.indexOnly = $('demoIndexOnly').checked;
  demo.resist = $('demoResist').checked;
  demo.start();
  setMode('demo');
  setStatus('Demo mode: a pretend device is sending readings. Move the sliders or press Open hand.', 'ok');
}
function stopDemo() {
  demo.stop();
  resetLive();
  setMode('none');
  setStatus('Not connected. Plug the board into this laptop, then press Connect by USB.');
}
function updateAutoButton() { $('btnAuto').textContent = demo.auto ? 'Stop auto open/close' : 'Start auto open/close'; }

/* ---------------- building the finger UI ---------------- */
const sliders = [], sliderOut = [], cards = [];
FINGERS.forEach((f, i) => {
  // finger card
  const li = document.createElement('li');
  li.className = 'finger-card';
  li.style.setProperty('--fc', `var(--c-${f})`);
  li.innerHTML = `<div class="name"><span>${LABEL[f]}</span><span class="src"></span></div>
    <div class="pct">–<small>% open</small></div><div class="deg">–</div><div class="joints">&nbsp;</div>`;
  $('fingerCards').append(li);
  cards.push({ src: li.querySelector('.src'), pct: li.querySelector('.pct'), deg: li.querySelector('.deg'), joints: li.querySelector('.joints') });

  // slider
  const row = document.createElement('div');
  row.className = 'slider-row';
  row.style.setProperty('--fc', `var(--c-${f})`);
  row.innerHTML = `<label for="sl-${f}">${LABEL[f]}</label>
    <input type="range" id="sl-${f}" min="0" max="100" value="${[65, 75, 70, 65, 60][i]}" aria-describedby="out-${f}">
    <output id="out-${f}">${[65, 75, 70, 65, 60][i]}%</output>`;
  $('sliders').append(row);
  const input = row.querySelector('input'), out = row.querySelector('output');
  input.addEventListener('input', () => { out.textContent = input.value + '%'; if (S.mode === 'demo') demo.setFinger(i, +input.value); });
  sliders.push(input); sliderOut.push(out);
});

/* ---------------- calibration UI ---------------- */
function renderCalRows() {
  const body = $('calRows');
  body.innerHTML = '';
  FINGERS.forEach((f, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="fname" style="--fc:var(--c-${f})">${LABEL[f]}</td><td class="num" id="calNow-${f}">–</td>
      <td><button class="secondary" data-cal="straight" data-i="${i}">Straight</button></td>
      <td><button class="secondary" data-cal="bent" data-i="${i}">Bent</button></td>
      <td class="desc">${cal().describe(f)}</td>`;
    body.append(tr);
  });
}
function saveCal(which, indices) {
  const now = performance.now();
  const done = [], skipped = [];
  for (const i of indices) {
    if (!hasSensor(i, now)) { skipped.push(LABEL[FINGERS[i]]); continue; }
    const ok = which === 'straight' ? cal().setStraight(FINGERS[i], S.raw[i]) : cal().setBent(FINGERS[i], S.raw[i]);
    done.push(`${LABEL[FINGERS[i]]} ${S.raw[i]}`);
    if (!ok) skipped.push('(this browser blocks saving: values kept until you close the tab)');
  }
  const el = $('calStatus');
  if (!done.length) { el.textContent = 'No live reading to save. Connect the device (or start the demo) first.'; el.className = 'status warn'; }
  else { el.textContent = `Saved ${which === 'straight' ? 'straight' : 'fully bent'}: ${done.join(', ')}` + (skipped.length ? ` · skipped (no sensor): ${skipped.join(', ')}` : ''); el.className = 'status ok'; }
  renderCalRows();
}
$('calRows').addEventListener('click', e => {
  const b = e.target.closest('button[data-cal]');
  if (b) saveCal(b.dataset.cal, [+b.dataset.i]);
});
$('calAllStraight').onclick = () => saveCal('straight', [0, 1, 2, 3, 4]);
$('calAllBent').onclick = () => saveCal('bent', [0, 1, 2, 3, 4]);
$('calClear').onclick = () => {
  if (!confirm('Clear the saved calibration for all fingers?')) return;
  cal().clear(); renderCalRows();
  $('calStatus').textContent = 'Calibration cleared.'; $('calStatus').className = 'status';
};
$('calExport').onclick = () => download(cal().toJSON(), `exohand-calibration-${stamp()}.json`, 'application/json');
$('btnCalImport').onclick = () => $('calFile').click();
$('calFile').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const n = cal().fromJSON(await file.text());
    $('calStatus').textContent = `Imported calibration for ${n} finger(s).`; $('calStatus').className = 'status ok';
  } catch (err) {
    $('calStatus').textContent = err.message; $('calStatus').className = 'status warn';
  }
  renderCalRows();
};
$('bendRaises').checked = settings.bendRaises;
$('bendRaises').onchange = e => { settings.bendRaises = calReal.bendRaises = calDemo.bendRaises = e.target.checked; saveSettings(); };

/* ---------------- charts ---------------- */
const chartFlex = new LiveChart($('chartFlex'), {
  series: FINGERS.map(f => ({ key: f, label: LABEL[f], color: `--c-${f}` })), min: 0, max: 100, unit: '%', ticks: 4,
});
const chartServo = new LiveChart($('chartServo'), {
  series: [{ key: 's1', label: 'Servo 1 (4 fingers)', color: '--c-servo1' }, { key: 's2', label: 'Servo 2 (thumb)', color: '--c-servo2', dashed: true }],
  min: 0, max: 180, unit: '°', ticks: 2,
});
const chartEmg = new LiveChart($('chartEmg'), {
  series: [{ key: 'ext', label: 'Extensor', color: '--c-emg-ext' }, { key: 'flex', label: 'Flexor', color: '--c-emg-flex' }],
  min: 0, max: 200, auto: true, unit: '', ticks: 2, markerKey: 'on',
});
function legend(el, items) {
  el.innerHTML = items.map(([label, color, dashed]) => `<span class="${dashed ? 'dashed' : ''}" style="--lc:var(${color})">${label}</span>`).join('');
}
legend($('legendFlex'), FINGERS.map(f => [LABEL[f], `--c-${f}`]));
legend($('legendServo'), [['Servo 1 (4 fingers)', '--c-servo1'], ['Servo 2 (thumb)', '--c-servo2', true]]);
legend($('legendEmg'), [['Extensor mV', '--c-emg-ext'], ['Flexor mV', '--c-emg-flex'], ['Threshold', '--danger', true], ['Trigger ON', '--ok']]);
$('emgThreshold').value = settings.threshold;
chartEmg.threshold = settings.threshold;
$('emgThreshold').oninput = e => {
  const v = parseFloat(e.target.value);
  if (Number.isFinite(v) && v >= 0) { chartEmg.threshold = settings.threshold = v; saveSettings(); }
};

/* ---------------- recording (CSV) ---------------- */
$('btnRec').onclick = () => {
  S.recording = !S.recording;
  if (S.recording) { S.rec = []; S.recStart = performance.now(); $('btnCsv').disabled = true; }
  else $('btnCsv').disabled = S.rec.length === 0;
  $('btnRec').textContent = S.recording ? '■ Stop recording' : '● Start recording';
};
$('btnCsv').onclick = () => {
  const head = ['time_s', 'clock', 'mode', 'device_state',
    ...FINGERS.map(f => `${f}_raw`), ...FINGERS.map(f => `${f}_open_pct`), ...FINGERS.map(f => `${f}_bent_deg`),
    ...FINGERS.map(f => `${f}_source`), 'servo1_deg', 'servo2_deg', 'emg_extensor_mV', 'emg_flexor_mV', 'emg_on'];
  const rows = S.rec.map(r => r.join(','));
  download(head.join(',') + '\n' + rows.join('\n') + '\n', `exohand-session-${stamp()}.csv`, 'text/csv');
};
function recordRow(now) {
  const t = ((now - S.recStart) / 1000).toFixed(3);
  const deg = FINGERS.map((f, i) => Math.round(sum(hand.anglesNow(i))));
  S.rec.push([t, new Date().toISOString(), S.mode, S.state || '',
    ...S.raw.map((r, i) => (hasSensor(i, now) ? r : '')),
    ...S.shown.map(b => Math.round((1 - b) * 100)), ...deg, ...S.source,
    S.servo1 ?? '', S.servo2 ?? '', S.emg.ext ?? '', S.emg.flex ?? '', S.emg.at ? (S.emg.on ? 1 : 0) : '']);
}

/* ---------------- the 3D hand ---------------- */
const hand = new HandView($('stage'));
function showModelMsg(msg, warn = false) {
  const el = $('modelMsg');
  el.hidden = !msg; el.textContent = msg || ''; el.className = 'stage-msg' + (warn ? ' warn' : '');
  clearTimeout(showModelMsg.t);
  if (msg && !warn) showModelMsg.t = setTimeout(() => { el.hidden = true; }, 6000);
}
async function loadSide(side) {
  settings.side = side; saveSettings();
  $('sideLeft').setAttribute('aria-pressed', side === 'left');
  $('sideRight').setAttribute('aria-pressed', side === 'right');
  $('loading').hidden = false;
  const res = await hand.loadBuiltIn(side);
  $('loading').hidden = true;
  if (!res.ok) showModelMsg(res.message, true);
  $('btnBuiltIn').hidden = true; $('flipBox').hidden = true;
  hand.setView(hand.view || 'default');
}
$('sideLeft').onclick = () => (hand.custom ? reloadCustomFor('left') : loadSide('left'));
$('sideRight').onclick = () => (hand.custom ? reloadCustomFor('right') : loadSide('right'));
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
function setView(name) {
  hand.setView(name);
  document.querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-pressed', x.dataset.view === name));
}
$('btnResetView').onclick = () => setView('default');
document.querySelectorAll('[data-skin]').forEach(b => b.addEventListener('click', () => setSkin(+b.dataset.skin)));
function setSkin(i) {
  hand.setSkin(i); settings.skin = i; saveSettings();
  document.querySelectorAll('[data-skin]').forEach(x => x.setAttribute('aria-pressed', +x.dataset.skin === i));
}

// "Load your own hand (.glb)"
let customBuffer = null;
$('btnGlb').onclick = () => $('glbFile').click();
$('glbFile').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  customBuffer = await file.arrayBuffer();
  await loadCustom();
};
async function loadCustom() {
  hand.flip = $('flipBend').checked;
  const res = await hand.loadCustom(customBuffer.slice(0));
  if (!res.ok) { showModelMsg(res.message + ' The built-in hand is still shown.', true); return; }
  showModelMsg(res.message || 'Your hand model is loaded. If the fingers bend backwards, tick "Bend the other way".', !!res.message);
  $('btnBuiltIn').hidden = false; $('flipBox').hidden = false;
  hand.setView(hand.view || 'default');
}
async function reloadCustomFor(side) {
  hand.side = settings.side = side; saveSettings();
  $('sideLeft').setAttribute('aria-pressed', side === 'left');
  $('sideRight').setAttribute('aria-pressed', side === 'right');
  await loadCustom();
}
$('flipBend').onchange = () => customBuffer && loadCustom();
$('btnBuiltIn').onclick = () => { customBuffer = null; $('flipBend').checked = false; hand.flip = false; loadSide(settings.side); };

/* ---------------- other buttons ---------------- */
$('btnUsb').onclick = () => connect('usb');
$('btnBle').onclick = () => connect('ble');
$('btnDisc').onclick = disconnect;
$('btnDemo').onclick = () => (S.mode === 'demo' ? stopDemo() : startDemo());
$('btnAuto').onclick = () => { demo.setAuto(!demo.auto); updateAutoButton(); };
$('demoIndexOnly').onchange = e => { demo.indexOnly = e.target.checked; resetLive(); calDemo.resetSeen(); };
$('demoResist').onchange = e => { demo.resist = e.target.checked; };
$('cmdOpen').onclick = () => send(COMMANDS.open);
$('cmdClose').onclick = () => send(COMMANDS.close);
$('cmdStop').onclick = stopNow;
document.querySelectorAll('input[name="follow"]').forEach(r => {
  r.checked = r.value === settings.follow;
  r.onchange = () => { settings.follow = r.value; saveSettings(); };
});

// SPACE = STOP, wherever the focus is. We also block Space's normal "click the focused button".
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); if (!e.repeat) stopNow(); }
}, true);
window.addEventListener('keyup', e => { if (e.code === 'Space' || e.key === ' ') e.preventDefault(); }, true);

// theme button
function applyTheme() {
  if (settings.theme) document.documentElement.dataset.theme = settings.theme;
  else delete document.documentElement.dataset.theme;
  const dark = settings.theme ? settings.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  $('btnTheme').textContent = dark ? 'Light theme' : 'Dark theme';
}
$('btnTheme').onclick = () => {
  const dark = settings.theme ? settings.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  settings.theme = dark ? 'light' : 'dark'; saveSettings(); applyTheme();
};

// browser support message
(function showSupport() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const usb = usbSupported(), ble = bleSupported();
  let msg = `This browser: USB ${usb ? '✅' : '❌'} · Bluetooth ${ble ? '✅' : '❌'}.`;
  if (ios) msg += ' iPhone and iPad cannot use USB or Bluetooth in the browser: use Demo, or open this page in Chrome on a laptop.';
  else if (!usb && !ble) msg += ' Open this page in Chrome or Edge on a laptop to connect the device. Demo mode works here.';
  else if (!usb) msg += ' USB needs Chrome or Edge on a laptop. Bluetooth works here.';
  if (!window.isSecureContext) msg += ' This page is not on https, so USB and Bluetooth are switched off.';
  $('support').textContent = msg;
})();

/* ---------------- every frame ---------------- */
let last = performance.now(), lastChart = 0, lastRec = 0, lastUi = 0;
function frame(now) {
  // keep the loop alive even if one frame goes wrong (the error is still shown in the console)
  requestAnimationFrame(frame);
  try { step(now); } catch (err) { if (!frame.warned) { frame.warned = true; console.error(err); } }
}
function step(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  // 1. decide each finger's bend
  const indexLive = hasSensor(1, now);
  const sliderBend = i => 1 - sliders[i].value / 100;
  const indexBend = indexLive ? cal().bend('index', S.raw[1]) : sliderBend(1);
  FINGERS.forEach((f, i) => {
    let b, src;
    if (hasSensor(i, now)) { b = cal().bend(f, S.raw[i]); src = 'sensor'; }
    else if (i !== 1 && settings.follow === 'index') { b = indexBend; src = 'index'; }
    else { b = sliderBend(i); src = 'slider'; }
    S.shown[i] = b ?? 0;
    S.source[i] = src;
  });
  hand.setBends(S.shown);
  hand.update(dt);

  // 2. text on the page (10 times a second is plenty)
  if (now - lastUi > 100) { lastUi = now; updateUi(now); }

  // 3. charts: one point every 100 ms
  if (now - lastChart > 100) {
    lastChart = now;
    const flexVals = {};
    FINGERS.forEach((f, i) => { flexVals[f] = S.source[i] === 'sensor' ? Math.round((1 - S.shown[i]) * 100) : null; });
    chartFlex.push(now, flexVals);
    const servoFresh = fresh(S.servoAt, now);
    chartServo.push(now, { s1: servoFresh ? S.servo1 : null, s2: servoFresh ? S.servo2 : null });
    const emgFresh = fresh(S.emg.at, now);
    chartEmg.push(now, { ext: emgFresh ? S.emg.ext : null, flex: emgFresh ? S.emg.flex : null }, emgFresh && S.emg.on);
  }
  chartFlex.draw(now); chartServo.draw(now); chartEmg.draw(now);

  // 4. recording: 20 rows a second
  if (S.recording && now - lastRec >= 50) { lastRec = now; recordRow(now); }
}

function updateUi(now) {
  FINGERS.forEach((f, i) => {
    const c = cards[i];
    const angles = hand.anglesNow(i);
    c.pct.innerHTML = `${Math.round((1 - S.shown[i]) * 100)}<small>% open</small>`;
    c.deg.textContent = `${Math.round(sum(angles))}° bent`;
    c.joints.textContent = f === 'thumb'
      ? `CMC ${r(angles[0])} · MCP ${r(angles[1])} · IP ${r(angles[2])}`
      : `MCP ${r(angles[0])} · PIP ${r(angles[1])} · DIP ${r(angles[2])}`;
    c.src.textContent = { sensor: 'sensor', index: 'copies index', slider: 'slider' }[S.source[i]];
    // a finger with a live sensor (outside the demo): slider follows the reading and is locked
    const locked = S.source[i] === 'sensor' && S.mode !== 'demo';
    sliders[i].disabled = locked;
    if (locked) { const v = Math.round((1 - S.shown[i]) * 100); sliders[i].value = v; sliderOut[i].textContent = v + '%'; }
    const now$ = document.getElementById(`calNow-${f}`);
    if (now$) now$.textContent = hasSensor(i, now) ? S.raw[i] : '–';
  });

  // device state + BLOCKED warning
  const badge = $('stateBadge');
  badge.textContent = S.state || '—';
  badge.dataset.state = S.state;
  $('blockedBanner').hidden = S.state !== 'BLOCKED';

  const servoFresh = fresh(S.servoAt, now), emgFresh = fresh(S.emg.at, now);
  $('fServo1').textContent = servoFresh && S.servo1 != null ? S.servo1 + '°' : '–';
  $('fServo2').textContent = servoFresh && S.servo2 != null ? S.servo2 + '°' : '–';
  $('fEmgExt').textContent = emgFresh ? S.emg.ext.toFixed(0) + ' mV' : '–';
  $('fEmgFlex').textContent = emgFresh ? S.emg.flex.toFixed(0) + ' mV' : '–';
  $('fEmgOn').textContent = emgFresh ? (S.emg.on ? 'ON' : 'off') : '–';
  $('fLines').textContent = S.lines;
  $('fIgnored').textContent = S.ignored;
  $('log').textContent = S.log.join('\n');
  $('recInfo').textContent = S.recording ? `Recording: ${S.rec.length} rows` : (S.rec.length ? `${S.rec.length} rows ready` : '');

  // connected but silent?
  if (S.conn) {
    const silent = now - Math.max(S.lastGoodAt, S.connectedAt || 0) > 3000;
    // text IS arriving, but none of it is in our format: almost always the wrong sketch
    const wrongFormat = silent && now - S.lastAnyAt < 2000 && S.lastAnyAt > (S.connectedAt || 0);
    if (wrongFormat && S.linkNote !== 'format') {
      S.linkNote = 'format';
      setStatus('The board is sending text, but not in the ExoHand format (see "Last lines from the device" in section 5). '
        + 'A Serial Plotter sketch like flex_visual_test is probably flashed. Upload flex_devkit_test or multi_flex_devkit instead.', 'warn');
    } else if (silent && !wrongFormat && S.linkNote !== 'silent') {
      S.linkNote = 'silent';
      setStatus('Connected, but nothing is arriving from the board. Check that the right sketch is flashed and press the board\'s RST button.', 'warn');
    } else if (!silent && S.lastGoodAt > S.connectedAt && S.linkNote !== 'live') {
      S.linkNote = 'live';
      setStatus(S.mode === 'usb' ? 'Connected by USB. Readings coming in.' : 'Connected by Bluetooth. Readings coming in.', 'ok');
    }
  } else S.linkNote = '';
}

/* ---------------- helpers ---------------- */
function sum(a) { return a.reduce((s, v) => s + v, 0); }
function r(v) { return Math.round(v) + '°'; }
function stamp() { return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'); }
function download(text, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------------- start ---------------- */
applyTheme();
setMode('none');
setSkin(settings.skin);
loadSide(settings.side).then(() => setView('default'));
requestAnimationFrame(frame);

// for the automated tests (and curious teammates in the browser console)
window.exo = { S, hand, demo, calReal, calDemo, settings };
