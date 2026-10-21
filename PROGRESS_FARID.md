# Progress log (Farid)

Running log of the stroke hand exoskeleton build: what was done, what worked, what failed, what's next.
Newest entry at the top. Teammates: read the **Current status** and **To-do** first.

---

## Current status (21 Oct 2026, 6:30 pm)
| Area | Status |
|---|---|
| Mechanics (printed test finger) | ✅ MG90S + spool v4 + knuckle roller set pulls the printed finger fully straight |
| Mechanics (real hand) | ⚠️ MG90S stalls at ~10–20 % resistance. Stronger motors bought (MG996R, STS3215), not yet tested on a hand |
| Flex sensor | ⚠️ circuit + code work, but the sensor tested only changes 11k → 12k when bent (a good one roughly doubles). Test the other sensors / bending direction. Tinkercad virtual test set up |
| EMG | ✅ **working (1 channel)**: clear spikes on both flexors and extensors. Root cause of 20 Oct failure: ESP32 not making contact in the breadboard; it now sits off the breadboard on female-to-male jumpers |
| Website v1 | ✅ works in demo mode (low-poly hand, USB + Bluetooth, calibration, CSV recording) |
| Website v2 (realistic hand) | ✅ built and tested in demo mode (`website/v2/`). ⏳ not yet tried with a real flex sensor. GitHub Pages needs switching on once (see `website/v2/README.md`) |
| Finger wrap / C-clamp | ⏳ 5 concepts drawn (`docs/concepts/A..E`), team to choose |

## To-do (in order)
1. [x] EMG works (1 channel, 21 Oct). [ ] Optional: run `firmware/emg/emg_redboard_devkit` and screenshot the ON blocks for POC1.
2. [ ] **Flex sensor:** multimeter-test every sensor (flat vs wrapped round a pen, printed side outward, both directions); keep the one that changes most. Use ~16k fixed resistor (3 × 47k side by side). Record straight vs fist readings with `firmware/flex/flex_visual_test`.
3. [x] Website v2 built (21 Oct). [ ] Connect it to the real flex sensor, calibrate, check the finger follows. [ ] Switch on GitHub Pages: Settings → Pages → Source: **GitHub Actions**. [ ] Compile `multi_flex_devkit` in the Arduino IDE.
4. [ ] **MG996R knob test** (`firmware/motors/mg996r_knob_test`) on a real finger: find the "just straight" angle. Backup "finger straight" signal if the flex sensors are weak.
5. [ ] STS3215: test with the Feetech FD software first; photograph the FE-URT-2 header labels before wiring it to the ESP32.
6. [ ] Choose the finger-wrap concept, measure finger sizes, design the clips + back-of-hand hub + table unit.
7. [ ] Join flex + motor: the motor stops when the flex sensor says "straight".
8. [ ] Join EMG + motor: the EMG trigger opens the hand. Later: 2nd channel (DFRobot on flexors, GPIO 2) as a "veto", both shown as % of max effort.

---

## 21 Oct 2026 (lab, 12–6 pm): EMG fixed, flex sensor tests
**EMG: solved ✅**
- ESP self-test (`emg_step_test`, Serial Monitor): green wire to ground and to 3V3 gave **no change (~39)** → pin 1 was not connected.
- Pressing the DevKit hard into the breadboard made the values change → **the DevKit was not making contact in the breadboard**. This was the cause of the whole flat-line problem on 20 Oct.
- Fix: DevKit taken **off the breadboard**, wired with **female-to-male jumpers** (pin 1 → line Y, GND → ground rail).
- Self-test after the fix: ground → **0 mV**, 3V3 → **3152 mV** (the ESP's max reading), line Y → 0–1 mV at rest. ✅
- With fresh pads: **clear spikes and waves** on the Serial Plotter when moving the fingers, on the **flexors (palm side)** and on the **extensors (back of forearm)**, tested one side at a time.
- Lessons: always run the ESP self-test first; keep the ESP off worn breadboard holes; signal pads must not touch (≈2 cm centre to centre); the reference snap on our cable is the one that beeps with the plug's base metal.
- Plan: for now, extensor above its threshold for 0.2 s = "open". Later the flexor channel acts as a veto (co-contraction / spasm), both scaled to % of max effort.

**Flex sensor: circuit works, sensor response too small ⚠️**
- Wiring: 3V3 → flex → GPIO 4 + 47k → GND (ESP off the breadboard, flex on croc clips / standing in a small breadboard). Diagram: `docs/wiring/flex_wiring.png`.
- `flex_devkit_test`: steady reading **~3190–3205** (≈2.5 V at the pin = sensible for a flat ~11–15k sensor), but **no visible change when bent**.
- Multimeter on the sensor alone (no circuit): **~11k flat → ~12k bent**. A healthy flex sensor roughly doubles (e.g. 10k → 20k+). Another sketch showed ~6.3–6.4k with only a few hundred ohms of change when bent.
- Conclusion: the wiring and code are fine; this sensor barely responds. To check: bending direction (printed side on the outside of the curve, bend the middle not the base), other sensors, and a ~16k fixed resistor (3 × 47k side by side) for better sensitivity.
- New sketch `firmware/flex/flex_visual_test`: learns "flat" in 3 s, auto-zooms, shows **bend %** in the Serial Plotter or a text bar in the Serial Monitor (compile-checked against stand-in functions only).
- Virtual tests: Wokwi (ESP32-S3 + slider standing in for the sensor) and **Tinkercad** (Arduino Uno + real flex-sensor part + 47k, code in `firmware/flex/tinkercad_uno_flex`). Tinkercad tip: power the Uno from USB only, not from the virtual power supply.

## 21 Oct 2026: website v2 built (Claude Code)
**What was built**
- `website/v2/`: new dashboard with a **realistic 3D hand** (free MIT WebXR "generic-hand" models, left + right, copied into `assets/models/`).
  - Skin material with sheen, slight clearcoat and a generated skin-texture map; soft studio lighting, soft ground shadow; 3 skin tones.
  - All 5 fingers. Each finger has one "bend" value spread over the knuckles (MCP up to 75–90°, PIP 100°, DIP ≈ 2/3 of PIP). Smoothed (≈80 ms) so noisy sensors don't make it shake.
  - The thumb swings across the front of the fist; the code works this swing out for whatever hand model is loaded.
  - Finger cards: % open, degrees bent, and the angle at each joint.
  - Connect by USB / Bluetooth (ExoHand) / Demo. Browser support message. A finger with no sensor copies the index or follows its slider (a setting).
  - Calibration per finger (Save straight / Save fully bent), saved in the browser, export/import as .json. The demo has its own practice calibration.
  - Big red STOP (Space key too), Open / Close. Only `o`, `c`, `s` are ever sent. BLOCKED shows a red "finger resisting: motor stopped" banner.
  - 30-second charts: flex % open, servo angles, EMG with threshold line and ON bands. Record → Download CSV (20 rows/s).
  - Light + dark theme, all colours are CSS variables. Works at phone width (STOP bar sticks to the bottom).
  - "Load your own hand (.glb)": bones are matched by name; a clear message if it can't be used.
- `firmware/flex/multi_flex_devkit/`: up to 5 flex sensors (index 4, middle 6, ring 7, little 8, thumb 9), `FITTED[5]` switch, sends `F,...` every 20 ms over USB **and** Bluetooth. No motor.
- `website/index.html` (links to v1 and v2) + `.github/workflows/pages.yml` (publishes `website/` to GitHub Pages on every push to main).
- v1 untouched.

**Tests run**
- Protocol parser: 8 unit tests, all pass (valid D/F/M/E lines, 31 garbage/boot-message lines ignored, lines split across chunks, only o/c/s allowed).
- Browser test (headless Chrome, `website/v2/tests/demo.e2e.mjs`): **45/45 checks pass**, e.g.
  - index slider 100 % → 0 %: joints go to MCP 75° / PIP 100° / DIP 67°, and the fingertip moves towards the palm;
  - ESP32 boot lines ignored; Space and STOP → PAUSED; BLOCKED banner; v1 "D," lines drive the index; CSV download; custom .glb loads, a wrong file shows a message;
  - phone width 390 px: no sideways scrolling, STOP visible; no console errors; v1 still loads;
  - with a **pretend USB port and pretend Bluetooth device** (real code paths, fake hardware): calibrate 3000 straight / 2000 bent → reading 2500 shows 50 % open; a line split in two pieces is joined; Open / Space / STOP send exactly `o`, `s`, `s`.
- Screenshots: `docs/screenshots/v2_desktop.png`, `v2_phone.png` (+ `v2_desktop_open.png`, `v2_desktop_dark.png`, `v2_blocked.png`).

**Known issues**
- `multi_flex_devkit.ino` was **not compiled** (no Arduino compiler in the cloud machine). Compile it in the Arduino IDE first.
- Not yet tried with real hardware (USB / Bluetooth need a real board and real Chrome).
- The WebXR hand is realistic in shape but simple in detail (no nails or wrinkles). A better rigged .glb can be loaded with the button.
- The finger and thumb angles are tuned by eye. Change `FIST_ANGLES` / `TUNE` at the top of `website/v2/js/hand.js` if needed.
- The EMG threshold line on the chart is display only (the firmware decides the trigger).

**To-do**
1. [ ] Switch on GitHub Pages (Settings → Pages → Source: GitHub Actions) and open the v2 link.
2. [ ] One flex sensor on GPIO 4 with `flex_devkit_test` → Connect by USB → calibrate → bend: the index should follow.
3. [ ] Then flash `multi_flex_devkit` (index only fitted) and try **Connect by Bluetooth**.
4. [ ] Tune the fist look by eye with a real hand next to the screen.

## 20 Oct 2026: shopping, motor setup, EMG debugging day
**Bought (Kuriosity):** STS3215 servo + FE-URT-2 board, MG996R, flex sensors, DFRobot ECG set, analog EMG board, electrode pads; batteries + resistors afterwards.

**EMG, what we tried**
1. **DFRobot AD8232 heart sensor** on the forearm (XIAO ESP32S3).
   - With unsoldered XIAO headers we got garbage readings (400–900).
   - After fixing that: rest ≈ 300, finger movement ≈ 450. A weak but real response.
   - Pads were too close to the wrist; we moved them 4–5 finger-widths below the elbow.
2. Switched to the **red analog EMG board** + ESP32-S3 DevKit.
   - It needs **±9 V** (two 9 V batteries: #1 red → +VS, #1 black + #2 red → GND, #2 black → −VS).
   - SIG goes through a **1/3 divider** (3 × 47k) because it can reach about 9 V, and the ESP32 pin max is 3.3 V.
3. Multimeter: +VS = +9 V ✅, −VS = −9 V ✅.
4. At first SIG = 0 V even when pushing. Cause: batteries not actually plugged into the board's pins.
5. **Reference snap found by continuity**: the snap that beeps with the plug's long base metal is the reference. On our cable that's the **red** snap, whatever the letters say.
6. With the reference on the elbow bone: **SIG relaxed 0.036 V, pushing fingers open 0.2 V** ✅. First real muscle signal.
7. After connecting the ESP32, every sketch showed a **flat line** (pin_mV about 33–37, no change when moving).
   - Partly display problems: start-up messages and a text line zoomed the plotter out. Fixed in the code.
   - But even zoomed in, the number did not move.

**Suspected causes, still open**
- Pads worn for **3–5 hours in aircon**, peeled and re-stuck several times → gel dried, poor contact.
- **Hairy skin** on the back of the forearm.
- Big ECG pads are too large for the extensor muscle; small EMG electrodes (or a strap with metal studs) are better.
- Ground not shared everywhere (fixed in the new wiring: one ground rail).
- Green wire possibly one hole off from GPIO 1 (check with the ESP self-test).

**Lessons**
- Extensors (back of arm, open the hand) give a much smaller signal than flexors (palm side, fist). That's why YouTube demos use the palm side.
- Amplifying in code doesn't help: it multiplies the noise too. Amplification must happen on the EMG board, before the ESP32. Code can only average out noise.
- The two signal electrodes **must not touch** (about 2 cm centre to centre), or the signal becomes zero.
- Always do the ESP self-test first: green wire to ground → about 0; to 3V3 → about 3300.
- Clean wiring: `docs/wiring/emg_clean_wiring.png`. Simplest test sketch: `firmware/emg/emg_step_test`.

**Motors**
- MG996R knob test and STS3215 knob test sketches written (safe narrow ranges, torque limit 30 % on the STS3215).
- STS3215: test with the Feetech FD software first. Both servos ship with ID 1; change the second one to ID 2.

## 19 Oct 2026: website v1 + flex firmware
- Website v1 (`website/v1/index.html`): three.js hand, Connect by USB (Web Serial) or Bluetooth (ExoHand), demo slider, calibrate straight/bent, open/close/stop buttons, 30 s chart, CSV recording. Tested in demo mode on desktop + phone sizes.
- Firmware for Nano and XIAO (`firmware/flex/`), including `finger_xiao_safe`:
  - SAFE_MIN 60 / SAFE_MAX 110, slow steps
  - flex "straight" stop
  - **BLOCKED** stop if the servo turns 30° but the flex reading barely changes (finger is resisting)
- Handoff notes: `docs/website_v1_handoff.md`.

## Before 19 Oct: mechanics on the printed finger
- **MG90S problem:** the servo stalled or just buzzed.
  - Fixes: easy-tie **spool v4** (two tie holes + knot pockets), **knuckle roller set** (C-clip on the knuckle with a roller = more lever, less friction), STEP_DELAY 5, bench supply fixed 5 V 1 A.
  - Result: the printed finger opens **fully straight** ✅.
- **Back-of-hand MG90S mount** printed. On a real relaxed finger it works, but it **stalls at 10–20 % resistance**. Decided we need a stronger motor + off-hand (table) actuator.
- Parts in `hardware/stl/`, previews in `docs/previews/`. Print upright. 1.75 mm filament pieces are the lock pins.
- Research: SNU Exo-Glove Poly II puts the actuator off the body and runs the tendons through sheaths. That's our model for the table unit.
