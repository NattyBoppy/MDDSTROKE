# Prompt: build website v2 (realistic 3D hand)
Copy everything below the line into Claude Code, opened on this repo.

---

Read `CLAUDE.md`, `PROGRESS_FARID.md` and `website/v1/index.html` first. They explain the project, the safety rules, the pin plan and the device ↔ website protocol.

## Goal
Build **website v2** in `website/v2/`: a live dashboard for our stroke hand exoskeleton that shows a **realistic 3D human hand** (not low-poly). The hand copies the real fingers in real time from the flex sensors, over USB or Bluetooth.
- Keep `website/v1/` untouched as the fallback.
- I'm not a programmer. Explain what you did in plain steps at the end.

## Hard requirements
1. **Static site, no build step.**
   - Plain HTML + CSS + JavaScript ES modules.
   - three.js **0.160.0**, loaded through an importmap from `https://cdn.jsdelivr.net/npm/three@0.160.0/...`, plus its addons (GLTFLoader, OrbitControls, RoomEnvironment).
   - It must work by opening it from any static host (GitHub Pages / Netlify) and on `localhost`.
   - Split the code into readable files with plain-English comments, so teammates can edit them:
     - `index.html`
     - `css/style.css`
     - `js/main.js`
     - `js/hand.js` (model loading, bones, poses)
     - `js/protocol.js` (parsing device lines)
     - `js/serial.js` (Web Serial)
     - `js/ble.js` (Web Bluetooth)
     - `js/calibration.js`
     - `js/charts.js`
     - `js/demo.js`
2. **Realistic hand model**
   - Use the free, MIT-licensed rigged WebXR "generic-hand" models from the npm package `@webxr-input-profiles/assets`: `dist/profiles/generic-hand/left.glb` and `right.glb`.
   - **Copy both .glb files into `website/v2/assets/models/`** so the site doesn't depend on a CDN at runtime. If direct download is blocked, use `npm pack @webxr-input-profiles/assets` and extract them.
   - Add `assets/models/LICENSE.txt` with the MIT licence and the source.
   - Bones follow the WebXR joint names (`wrist`, `thumb-metacarpal`, `thumb-phalanx-proximal`, `thumb-phalanx-distal`, `index-finger-metacarpal`, `index-finger-phalanx-proximal`, `index-finger-phalanx-intermediate`, `index-finger-phalanx-distal`, …, `pinky-finger-…`). Find them by name, not by index.
   - Make it look **real**:
     - `MeshPhysicalMaterial` skin: warm tone, roughness ~0.5, a light `sheen`, slight `clearcoat`.
     - A subtle procedurally generated normal/roughness map (canvas noise) for skin texture.
     - Lighting: `RoomEnvironment` PMREM environment lighting, ACES filmic tone mapping, a soft key light with shadows, and a soft ground shadow.
     - Smooth shading. 3 skin-tone presets.
   - **"Load your own hand (.glb)"** button: lets the user drop in a more realistic rigged hand later.
     - Auto-map bones by name, matching "thumb/index/middle/ring/pinky|little" + segment order.
     - If mapping fails, show a clear message instead of crashing.
   - Left/right hand toggle, palm-up/palm-down camera presets, OrbitControls, reset view.
3. **Finger motion that looks natural**
   - Each finger has one value `bend` from 0 (straight) to 1 (full fist).
   - Spread it over the joints with natural coupling. Starting point (tune by eye): MCP 0–80°, PIP 0–100°, DIP ≈ 2/3 of PIP.
   - Thumb: its own simpler curl.
   - Smooth the motion (critically damped, about 80 ms) so noisy sensors don't make it shake.
   - Show per finger: **% open** and **degrees bent**.
4. **Data in: keep the protocol in CLAUDE.md, backward compatible with v1.**
   - `D,<flex_raw>,<servo_deg>,<state>` drives the **index** finger.
   - `F,<thumb>,<index>,<middle>,<ring>,<little>` drives all five (`-1` = no sensor).
   - `M,<servo1>,<servo2>,<state>` and `E,<ext_mV>,<flex_mV>,<on>` feed the status panel and the charts.
   - **Ignore** unknown or garbage lines, including ESP32 boot messages. Never crash on bad input.
5. **Connections**
   - **Connect by USB** (Web Serial, 115200).
   - **Connect by Bluetooth** (Nordic UART Service, device name `ExoHand`, UUIDs in CLAUDE.md).
   - **Demo mode** with no hardware: a slider per finger, plus an "auto open/close cycle" button.
   - Fingers with no sensor (`-1`, or never received) can either follow their demo slider or "follow index". This is a setting.
   - Show which browsers support USB/Bluetooth (Chrome/Edge desktop; Android Chrome Bluetooth only; iPhone = demo only), and show a friendly message when unsupported.
6. **Calibration, per finger**
   - "Save straight" and "Save fully bent" buttons store the raw values in `localStorage`, wrapped in try/catch.
   - Handle inverted sensors: on our wiring, bending **lowers** the raw value.
   - Export/import the calibration as a JSON file.
7. **Controls and safety**
   - Buttons **Open hand**, **Close hand**, and a big red **STOP**. The STOP button and the **Space** key both send `s`.
   - The site only ever sends `o`, `c`, `s`. Never angles. The firmware owns the motor limits.
   - Show the device state (CLOSED / OPENING / OPEN / CLOSING / PAUSED / BLOCKED). Show BLOCKED in red with "finger resisting: motor stopped".
8. **Charts**
   - Live 30-second charts (lightweight canvas, no heavy library): flex per finger (% open), servo angle, EMG envelope with its threshold and ON markers.
   - **Record / Download CSV** with timestamp + all values.
9. **Design**
   - Clean clinical dashboard: 3D hand on the left/top, panels on the right/bottom.
   - Responsive down to phone width (16 px side margins, no horizontal scroll). Light and dark theme.
   - Large touch targets, readable fonts, clear connection status ("Not connected / Connected by USB / Connected by Bluetooth / Demo").
   - Use CSS variables for colours so I (a UI/UX designer) can restyle easily.
10. **Firmware to match:** add `firmware/flex/multi_flex_devkit/multi_flex_devkit.ino` for the ESP32-S3 DevKit.
    - Reads up to 5 flex sensors: index GPIO 4, middle 6, ring 7, little 8, thumb 9. Each wired 3V3 → flex → pin → 47k → GND.
    - A `const bool FITTED[5]` marks which sensors are connected. Unfitted ones send `-1`.
    - Averaging + light smoothing. Sends an `F,...` line every 20 ms over USB serial **and** BLE NUS (name `ExoHand`).
    - Ignores `o`/`c`/`s` for now: no motor in this sketch.
    - Plain-English header with wiring and Arduino IDE settings (board "ESP32S3 Dev Module", USB-UART port).
11. **Hosting:** add a GitHub Actions workflow that publishes `website/` to **GitHub Pages**, with `website/index.html` linking to v1 and v2.
    - Write the exact clicks I need in GitHub: Settings → Pages → Source: GitHub Actions.

## Testing before you finish
- Serve locally (`npx serve website` or `python -m http.server`). Use Playwright with the preinstalled Chromium to:
  - load v2 in **demo mode**
  - move the sliders
  - check that the fingers bend, and that there are no console errors
  - take desktop + phone screenshots and save them to `docs/screenshots/v2_desktop.png` and `v2_phone.png`
- Unit-test `protocol.js` with sample lines: valid D/F/M/E lines, garbage, boot messages, partial lines split across chunks.
- Check `website/v1` still loads.

## When done
1. Commit in small steps with clear messages, then push to `main`.
2. Update `website/v2/README.md` with plain step-by-step use:
   - flash the firmware
   - close the Arduino Serial Monitor
   - open the site in Chrome
   - Connect by USB
   - calibrate
3. Add today's entry to `PROGRESS_FARID.md`: what was built, what was tested, known issues, to-do.
4. Tell me in plain words:
   - the GitHub Pages link
   - how to test with one flex sensor on GPIO 4 using `firmware/flex/flex_devkit_test` (it already sends `D,` lines)
   - what I should check tomorrow
