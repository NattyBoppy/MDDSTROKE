/*
  Browser test for website v2 in DEMO mode (no hardware needed).
  Run from the repo folder:   node website/v2/tests/demo.e2e.mjs
  Needs Playwright (npm i -g playwright) and a Chromium.

  It starts a small web server for website/, opens v2, starts the demo, moves the sliders,
  checks the 3D fingers really bend (fingertips move towards the palm), presses Open / STOP / Space,
  checks there are no console errors, saves desktop + phone screenshots, and checks v1 still loads.

  If your network blocks cdn.jsdelivr.net, point THREE_LOCAL at an unpacked three@0.160.0 npm package
  (npm pack three@0.160.0 && tar xzf three-0.160.0.tgz) and the test serves three.js from there:
      THREE_LOCAL=/path/to/package node website/v2/tests/demo.e2e.mjs
*/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const websiteDir = path.resolve(here, '../..');
const repoDir = path.resolve(websiteDir, '..');
const shotsDir = path.join(repoDir, 'docs', 'screenshots');

// ---- find Playwright (local install or global) ----
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  const root = execSync('npm root -g').toString().trim();
  ({ chromium } = await import(pathToFileURL(path.join(root, 'playwright', 'index.mjs')).href));
}

// ---- tiny static web server for website/ ----
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.txt': 'text/plain', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(websiteDir, p);
  if (!file.startsWith(websiteDir) || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

// ---- checks ----
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures++; };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function openPage(url, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  if (process.env.THREE_LOCAL) {
    await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', route => {
      const rel = new URL(route.request().url()).pathname.replace('/npm/three@0.160.0/', '');
      route.fulfill({ path: path.join(process.env.THREE_LOCAL, rel), contentType: 'text/javascript' });
    });
  }
  // web fonts are optional (the page falls back to system fonts); skip them so tests work offline
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ body: '', contentType: 'text/css' }));
  await page.goto(url);
  return { page, context, errors: errors };
}

// world position of a bone, by name
const tipY = (page, name) => page.evaluate(n => {
  let out = null;
  window.exo.hand.model.traverse(o => { if (o.name === n) { o.updateWorldMatrix(true, false); out = o.matrixWorld.elements.slice(12, 15); } });
  return out;
}, name);

try {
  // ================= desktop =================
  const { page, context, errors } = await openPage(`${base}/v2/`, { width: 1440, height: 900 });
  await page.waitForFunction(() => window.exo && window.exo.hand.rig, null, { timeout: 20000 });
  check(true, 'v2 loads and the hand model has a rig');
  const rigFingers = await page.evaluate(() => Object.keys(window.exo.hand.rig));
  check(rigFingers.length === 5, `all 5 fingers mapped by bone name (${rigFingers.join(', ')})`);

  await page.click('#btnDemo');
  await page.waitForTimeout(400);
  check((await page.textContent('#connPill')).trim() === 'Demo', 'status pill says Demo');
  const lines = await page.evaluate(() => window.exo.S.lines);
  const ignored = await page.evaluate(() => window.exo.S.ignored);
  check(lines > 5, `demo lines are parsed (${lines} read)`);
  check(ignored >= 3, `ESP32 boot lines were ignored (${ignored} ignored)`);

  // straighten everything, then bend the index fully
  for (const f of ['thumb', 'index', 'middle', 'ring', 'little']) await page.fill(`#sl-${f}`, '100');
  await page.waitForTimeout(700);
  const straightTip = await tipY(page, 'index-finger-tip');
  const straightThumb = await tipY(page, 'thumb-tip');
  const straightPct = await page.evaluate(() => window.exo.S.shown.map(b => Math.round((1 - b) * 100)));
  check(straightPct.every(p => p >= 95), `sliders at 100% → fingers straight (${straightPct.join(', ')} % open)`);
  await page.screenshot({ path: path.join(shotsDir, 'v2_desktop_open.png') });

  await page.fill('#sl-index', '0');
  await page.fill('#sl-thumb', '0');
  await page.waitForTimeout(700);
  const bentTip = await tipY(page, 'index-finger-tip');
  const bentThumb = await tipY(page, 'thumb-tip');
  const idx = await page.evaluate(() => ({ pct: Math.round((1 - window.exo.S.shown[1]) * 100), deg: window.exo.hand.anglesNow(1).map(Math.round) }));
  check(idx.pct <= 5, `index slider at 0% → index reads ${idx.pct}% open`);
  check(idx.deg[0] > 60 && idx.deg[1] > 80, `index joints bent MCP/PIP/DIP = ${idx.deg.join('/')}°`);
  // the hand lies palm down, so a curling fingertip must go DOWN (towards the palm) and back towards the wrist
  check(bentTip[1] < straightTip[1] - 0.15, `index fingertip moved towards the palm (y ${straightTip[1].toFixed(2)} → ${bentTip[1].toFixed(2)})`);
  check(bentTip[2] > straightTip[2] + 0.1, `index fingertip curled back towards the wrist (z ${straightTip[2].toFixed(2)} → ${bentTip[2].toFixed(2)})`);
  check(Math.hypot(bentThumb[0] - straightThumb[0], bentThumb[1] - straightThumb[1], bentThumb[2] - straightThumb[2]) > 0.08, 'thumb tip moved when the thumb slider moved');
  check(bentThumb[1] < straightThumb[1], 'thumb curls towards the palm side');
  const cardText = await page.textContent('#fingerCards li:nth-child(2)');
  check(/% open/.test(cardText) && /° bent/.test(cardText), `finger card shows % open and degrees: "${cardText.replace(/\s+/g, ' ').trim()}"`);

  // a half fist for the main screenshot
  const pose = { thumb: 55, index: 30, middle: 25, ring: 20, little: 15 };
  for (const [f, v] of Object.entries(pose)) await page.fill(`#sl-${f}`, String(v));
  await page.waitForTimeout(3000);   // let the charts fill a little
  await page.screenshot({ path: path.join(shotsDir, 'v2_desktop.png') });

  // motor buttons (demo device understands o / c / s just like the firmware)
  await page.click('#cmdOpen');
  await page.waitForTimeout(300);
  check(['OPENING', 'OPEN'].includes(await page.textContent('#stateBadge')), 'Open hand → device state OPENING');
  await page.mouse.click(5, 5);          // take focus off the buttons
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  check((await page.textContent('#stateBadge')) === 'PAUSED', 'Space key → STOP → state PAUSED');
  await page.click('#cmdClose');
  await page.waitForTimeout(200);
  await page.click('#cmdStop');
  await page.waitForTimeout(200);
  check((await page.textContent('#stateBadge')) === 'PAUSED', 'STOP button → state PAUSED');

  // BLOCKED display
  await page.click('#demoOptions summary');
  await page.check('#demoResist');
  for (const f of ['thumb', 'index', 'middle', 'ring', 'little']) await page.fill(`#sl-${f}`, '0');
  await page.click('#cmdOpen');
  await page.waitForFunction(() => document.getElementById('stateBadge').textContent === 'BLOCKED', null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  check(await page.isVisible('#blockedBanner'), 'BLOCKED shows the red "finger resisting: motor stopped" banner');
  await page.screenshot({ path: path.join(shotsDir, 'v2_blocked.png') });
  await page.keyboard.press('Space');
  await page.uncheck('#demoResist');

  // old v1 "D," lines: only the index has a sensor, the others copy it
  await page.check('#demoIndexOnly');
  await page.fill('#sl-index', '20');
  await page.waitForTimeout(800);
  const src = await page.evaluate(() => window.exo.S.source.slice());
  check(src[1] === 'sensor' && src[2] === 'index', `D-line mode: index = sensor, middle copies index (${src.join(', ')})`);
  await page.check('input[name="follow"][value="slider"]');
  await page.waitForTimeout(200);
  check((await page.evaluate(() => window.exo.S.source[2])) === 'slider', 'setting "use their slider" → middle follows its slider');
  await page.uncheck('#demoIndexOnly');
  await page.check('input[name="follow"][value="index"]');

  // auto cycle runs
  await page.click('#btnAuto');
  await page.waitForTimeout(1500);
  check(['OPENING', 'OPEN', 'CLOSING', 'CLOSED'].includes(await page.textContent('#stateBadge')), 'auto open/close cycle drives the state');
  await page.click('#btnAuto');

  // recording + CSV download
  await page.click('#btnRec');
  await page.waitForTimeout(700);
  await page.click('#btnRec');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8').trim().split('\n');
  check(csv.length > 5 && csv[0].startsWith('time_s,clock,mode') && csv[0].includes('emg_on'), `CSV download has a header + ${csv.length - 1} rows`);

  // calibration save works in demo (uses the demo calibration, not the real one)
  await page.click('#calAllStraight');
  check(/Saved straight/.test(await page.textContent('#calStatus')), 'Save straight (all) in demo mode');
  check((await page.evaluate(() => window.exo.calReal.isCalibrated('index'))) === false, 'real calibration untouched by the demo');

  // "Load your own hand (.glb)": a real rigged hand works, a wrong file gives a clear message
  const models = path.join(websiteDir, 'v2', 'assets', 'models');
  await page.setInputFiles('#glbFile', path.join(models, 'left.glb'));
  await page.waitForFunction(() => window.exo.hand.custom === true, null, { timeout: 10000 }).catch(() => {});
  check(await page.evaluate(() => window.exo.hand.custom && Object.keys(window.exo.hand.rig).length === 5), 'custom .glb loads and its bones are auto-mapped by name');
  check(await page.isVisible('#btnBuiltIn'), '"Use built-in hand" button appears after loading a custom model');
  await page.setInputFiles('#glbFile', path.join(models, 'LICENSE.txt'));
  await page.waitForTimeout(500);
  const msg = await page.textContent('#modelMsg');
  check(/could not be read/.test(msg) && await page.isVisible('#modelMsg'), `a non-model file shows a clear message: "${msg.trim()}"`);
  await page.click('#btnBuiltIn');
  await page.waitForFunction(() => window.exo.hand.custom === false, null, { timeout: 10000 }).catch(() => {});
  check(await page.evaluate(() => !window.exo.hand.custom), 'back to the built-in hand');

  // dark theme screenshot
  await page.click('#btnTheme');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shotsDir, 'v2_desktop_dark.png') });
  await page.click('#btnTheme');

  check(errors.length === 0, `no console errors on desktop${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await context.close();

  // ================= phone =================
  const phone = await openPage(`${base}/v2/`, { width: 390, height: 844 });
  await phone.page.waitForFunction(() => window.exo && window.exo.hand.rig, null, { timeout: 20000 });
  await phone.page.click('#btnDemo');
  for (const [f, v] of Object.entries(pose)) await phone.page.fill(`#sl-${f}`, String(v));
  await phone.page.waitForTimeout(1500);
  const scrollW = await phone.page.evaluate(() => document.documentElement.scrollWidth);
  check(scrollW <= 390, `phone: no horizontal scroll (page width ${scrollW}px)`);
  check(await phone.page.isVisible('#cmdStop'), 'phone: STOP is visible without scrolling');
  await phone.page.evaluate(() => window.scrollTo(0, 0));
  await phone.page.waitForTimeout(300);
  await phone.page.screenshot({ path: path.join(shotsDir, 'v2_phone.png') });
  check(phone.errors.length === 0, `no console errors on phone${phone.errors.length ? ': ' + phone.errors.join(' | ') : ''}`);
  await phone.context.close();

  // ================= fake USB board + fake Bluetooth device =================
  // Real Web Serial / Web Bluetooth need hardware, so we swap in pretend ones that behave the same way.
  // This tests the real serial.js / ble.js code: connect, read lines, calibrate, and what gets SENT.
  const fakeHw = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await fakeHw.addInitScript(() => {
    const enc = new TextEncoder(), dec = new TextDecoder();
    window.__sent = [];
    let ctrl;
    const port = {
      readable: null, writable: null,
      async open() {
        this.readable = new ReadableStream({ start(c) { ctrl = c; } });
        this.writable = new WritableStream({ write(chunk) { window.__sent.push('usb:' + dec.decode(chunk)); } });
      },
      async close() {},
    };
    window.__usb = text => ctrl.enqueue(enc.encode(text));
    Object.defineProperty(navigator, 'serial', { value: { requestPort: async () => port } });

    const listeners = [];
    const tx = { addEventListener: (t, fn) => listeners.push(fn), startNotifications: async () => {} };
    const rx = { writeValueWithoutResponse: async b => { window.__sent.push('ble:' + dec.decode(b)); } };
    const service = { getCharacteristic: async uuid => (uuid.startsWith('6e400003') ? tx : rx) };
    const device = { name: 'ExoHand', addEventListener() {}, gatt: { connected: true, connect: async () => ({ getPrimaryService: async () => service }), disconnect() {} } };
    window.__ble = text => { const b = enc.encode(text); listeners.forEach(fn => fn({ target: { value: new DataView(b.buffer) } })); };
    Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => device } });
  });
  const hw = await fakeHw.newPage();
  const hwErrors = [];
  hw.on('pageerror', e => hwErrors.push(String(e)));
  hw.on('console', m => { if (m.type() === 'error') hwErrors.push(m.text()); });
  if (process.env.THREE_LOCAL) await hw.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', route => route.fulfill({ path: path.join(process.env.THREE_LOCAL, new URL(route.request().url()).pathname.replace('/npm/three@0.160.0/', '')), contentType: 'text/javascript' }));
  await hw.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ body: '', contentType: 'text/css' }));
  await hw.goto(`${base}/v2/`);
  await hw.waitForFunction(() => window.exo && window.exo.hand.rig, null, { timeout: 20000 });

  // --- USB, old v1 board (flex_devkit_test sends D lines) ---
  await hw.click('#btnUsb');
  await hw.waitForTimeout(200);
  check((await hw.textContent('#connPill')).trim() === 'Connected by USB', 'fake USB: pill says Connected by USB');
  const feed = async (fn, text, ms = 150) => { await hw.evaluate(([f, t]) => window[f](t), [fn, text]); await hw.waitForTimeout(ms); };
  await feed('__usb', 'ESP-ROM:esp32s3-20210327\r\nrst:0x1 (POWERON)\r\nD,30', 50);   // boot noise + half a line
  await feed('__usb', '00,0,IDLE\r\n');
  check((await hw.evaluate(() => window.exo.S.raw[1])) === 3000, 'fake USB: a D line split in two pieces still reads 3000');
  await hw.click('#calRows button[data-cal="straight"][data-i="1"]');
  await feed('__usb', 'D,2000,0,IDLE\n');
  await hw.click('#calRows button[data-cal="bent"][data-i="1"]');
  await feed('__usb', 'D,2500,0,IDLE\n', 700);
  const half = await hw.evaluate(() => ({ pct: Math.round((1 - window.exo.S.shown[1]) * 100), src: window.exo.S.source.slice() }));
  check(half.pct === 50 && half.src[1] === 'sensor', `fake USB: calibrated 3000 straight / 2000 bent, reading 2500 → index ${half.pct}% open`);
  check(half.src[2] === 'index', 'fake USB: middle finger (no sensor) copies the index');
  await hw.click('#cmdOpen');
  await hw.mouse.click(5, 5);
  await hw.keyboard.press('Space');
  await hw.click('#cmdStop');
  await hw.waitForTimeout(200);
  const usbSent = await hw.evaluate(() => window.__sent.slice());
  check(JSON.stringify(usbSent) === JSON.stringify(['usb:o', 'usb:s', 'usb:s']), `fake USB: Open, Space, STOP sent exactly ${JSON.stringify(usbSent)}`);
  await feed('__usb', 'M,95,0,BLOCKED\n');
  check(await hw.isVisible('#blockedBanner'), 'fake USB: an M line with BLOCKED shows the red banner');
  await hw.click('#btnDisc');
  await hw.waitForTimeout(300);
  check((await hw.textContent('#connPill')).trim() === 'Not connected', 'fake USB: Disconnect works');

  // --- Bluetooth, new board (multi_flex_devkit sends F lines in 20-byte pieces) ---
  await hw.evaluate(() => { window.__sent.length = 0; });
  await hw.click('#btnBle');
  await hw.waitForTimeout(200);
  check((await hw.textContent('#connPill')).trim() === 'Connected by Bluetooth', 'fake Bluetooth: pill says Connected by Bluetooth');
  const fLine = 'F,-1,2500,-1,-1,-1\n';
  for (let i = 0; i < fLine.length; i += 20) await feed('__ble', fLine.slice(i, i + 20), 10);
  await feed('__ble', 'F,-1,2500,-1,-1,-1\nE,150.5,20,1\n', 700);
  const ble = await hw.evaluate(() => ({ pct: Math.round((1 - window.exo.S.shown[1]) * 100), emg: window.exo.S.emg.on }));
  check(ble.pct === 50 && ble.emg === true, `fake Bluetooth: F + E lines read (index ${ble.pct}% open, EMG on = ${ble.emg})`);
  await hw.click('#cmdClose');
  await hw.click('#cmdStop');
  await hw.waitForTimeout(200);
  const bleSent = await hw.evaluate(() => window.__sent.slice());
  check(JSON.stringify(bleSent) === JSON.stringify(['ble:c', 'ble:s']), `fake Bluetooth: Close, STOP sent exactly ${JSON.stringify(bleSent)}`);
  check(hwErrors.length === 0, `no console errors with fake hardware${hwErrors.length ? ': ' + hwErrors.join(' | ') : ''}`);
  await fakeHw.close();

  // ================= v1 still works =================
  const v1 = await openPage(`${base}/v1/`, { width: 1280, height: 800 });
  await v1.page.waitForSelector('#stage canvas', { timeout: 15000 });
  await v1.page.click('#btnDemo');
  await v1.page.waitForTimeout(500);
  check(await v1.page.isVisible('#demoSlider'), 'v1 still loads and its demo slider appears');
  check(v1.errors.length === 0, `no console errors in v1${v1.errors.length ? ': ' + v1.errors.join(' | ') : ''}`);
  await v1.context.close();

  // ================= landing page =================
  const home = await openPage(`${base}/`, { width: 1000, height: 700 });
  const links = await home.page.$$eval('a', as => as.map(a => a.getAttribute('href')));
  check(links.includes('v1/') && links.includes('v2/'), `website/index.html links to v1 and v2 (${links.join(', ')})`);
  await home.context.close();
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll browser checks passed.');
process.exit(failures ? 1 : 0);
