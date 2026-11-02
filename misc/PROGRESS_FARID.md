# Progress log (Farid)

Running log of the stroke hand exoskeleton build: what was done, what worked, what failed, what's next.
Newest entry at the top. Teammates: read the **Current status** and **To-do** first.

---

## Current status (23 Oct 2026, 5 pm)
| Area | Status |
|---|---|
| Mechanics (printed test finger) | ✅ MG90S + spool v4 + knuckle roller set pulls the printed finger fully straight |
| Mechanics (real hand) | ⚠️ MG90S stalls at ~10–20 % resistance. Stronger motors bought (MG996R, STS3215), not yet tested on a hand |
| Flex sensor | ⚠️ **working on the Arduino Uno + 5-LED bar graph**, but weak: only ~20 points of 1023 on a normal 10k divider. With the Uno's 1.1 V "zoom" (100k from 5V to A0, flex A0 → GND) it moves ~60–80 points. Readings creep/drift, so it is good for straight / half / fully bent, not smooth steps. Works in ONE bend direction only |
| EMG | ✅ **working (1 channel)**: clear spikes on both flexors and extensors. Root cause of 20 Oct failure: ESP32 not making contact in the breadboard; it now sits off the breadboard on female-to-male jumpers |
| Website v1 | ✅ works in demo mode (low-poly hand, USB + Bluetooth, calibration, CSV recording) |
| Website v2 (realistic hand) | ✅ built and tested in demo mode (`website/v2/`). ⏳ not yet tried with a real flex sensor. GitHub Pages needs switching on once (see `website/v2/README.md`) |
| Finger wrap / C-clamp | ✅ **v8 designed** (`hardware/stl/finger_clamps_v8`): 3 TPU clamps per finger, sized to a real hand + 3 mm foam, press-stud elastic strap, U-loop line, flex sensor slot. ⏳ not yet printed |
| Motor layout | ✅ compared on-hand (A) vs table-top unit (B) in `docs/design/hand_unit_layout.html`. **B chosen for V1.** ⚠️ one MG996R for 4 fingers may be too weak (≈ 6 N per finger), needs a force test |

## To-do (in order)
1. [x] EMG works (1 channel, 21 Oct). [ ] Optional: run `firmware/emg/emg_redboard_devkit` and screenshot the ON blocks for POC1.
2. [x] Flex sensor responds (22 Oct, Uno + LEDs). [ ] Try the other flex sensors for a stronger one (aim: 100+ points change). [ ] Tape the sensor along a finger (working side as tested) and record straight vs fist readings. [ ] Consider buying genuine Spectra Symbol 4.5" sensors.
3. [x] Website v2 built (21 Oct). [ ] Connect it to the real flex sensor, calibrate, check the finger follows. [ ] Switch on GitHub Pages: Settings → Pages → Source: **GitHub Actions**. [ ] Compile `multi_flex_devkit` in the Arduino IDE.
4. [ ] **MG996R knob test** (`firmware/motors/mg996r_knob_test`) on a real finger: find the "just straight" angle. Backup "finger straight" signal if the flex sensors are weak.
5. [ ] STS3215: test with the Feetech FD software first; photograph the FE-URT-2 header labels before wiring it to the ESP32.
6. [x] Finger clamps designed (v8, 23 Oct), finger widths measured. [ ] Print one middle-finger set in TPU 95A and test-fit with foam. [ ] Measure segment lengths (knuckle crease to crease) so the clamp lengths and strap holes fit. [ ] Design the back-of-hand plate (flex sensor clamps, balance bar, sheath stop) + the table unit box.
6b. [ ] **Force test**: luggage scale on one finger of the test hand, pull needed to open it. Compare with ≈ 6 N per finger (one MG996R, 120°, 22 mm spool). [ ] Check if our MG996R turns 180° with a 500–2500 µs pulse range.
7. [ ] Join flex + motor: the motor stops when the flex sensor says "straight".
8. [ ] Join EMG + motor: the EMG trigger opens the hand. Later: 2nd channel (DFRobot on flexors, GPIO 2) as a "veto", both shown as % of max effort.

---

## 2 Nov 2026 (part 2): HC-05 Bluetooth sketch
- New sketch `arduino_ide_code/uno_emg_mg996r_hc05_2nov`: the 29 Oct code + `SoftwareSerial` HC-05 on D10 (RX) / D11 (TX), 9600. Prints the smoothed EMG to USB and Bluetooth.
- HC-05 paired with the MacBook: shows up as the port `cu.HC-05`. Website run locally (`python3 -m http.server 8000` in `website/`, open `/v2/`); it loads with no errors.
- Website: new **Connect HC-05 (Bluetooth)** button (Web Serial, always 9600, also lists Bluetooth SPP devices). Pill "Connected by HC-05", HC-05-specific error messages, and Open / Close / STOP warn that this sketch doesn't listen. Tested with a pretend HC-05 in the browser: opened at 9600, 40/40 numbers plotted, no console errors. Protocol tests 9/9. New HC-05 checks added to `tests/demo.e2e.mjs` (not run: Playwright not installed).
- Real HC-05 test (Mac): first no data at all (RXD/TXD wiring), fixed → 567 lines in 12 s (EMG ≈ 20 at rest). Then the link kept dropping after a while in Chrome, while the Arduino IDE plotter kept going. Watching the Mac showed the Bluetooth link dropping **while Chrome still held the port open**, so Chrome never noticed.
- Fix: the website now reconnects the HC-05 by itself: no data for 3.5 s (or a read error) → close the port and reopen it, retrying every 2 s until it works or Disconnect is pressed. The status shows how many times it dropped. STOP during a reconnect says nothing was sent. Tested with a pretend HC-05 that goes silent and fails its first reopen: reconnected, readings carried on (200 → 435), Disconnect mid-reconnect stops the retries. Checks added to `tests/demo.e2e.mjs`.
- To do: confirm on the real HC-05 in Chrome. If it drops often, look at the power (servo on the Uno's 5V) and loose HC-05 wires.
- Watch: `SoftwareSerial` pauses interrupts while sending, so the servo may twitch during a move. No D2 E-stop in this sketch. D10 / D11 clash with the planned SD pins.

## 2 Nov 2026: upgrade plan with parts on hand (README "Planned next" A)
- Parts on hand: HC-05 Bluetooth, DS3231 real-time clock, YwRobot microSD module + 16 GB card, Adafruit 2.8" TFT cap-touch shield (ILI9341 + FT6206 + own microSD slot).
- Plan written in the README: HC-05 on D1 (one-way, 1k/2k divider) → laptop COM port → website Serial plotter at 9600; DS3231 on A4/A5; SD on D10–D13; one CSV per session with date/time.
- Screen parked for the ESP32-S3: as a shield it covers the Uno, uses D9 (servo) and D10, and fills the Uno's memory.
- Nothing wired or tested yet. To-do: HC-05 test → clock → SD log → combined sketch. Servo on its own supply before adding these.

## 1 Nov 2026 (part 2): E-stop design, website serial plotter, misc/ folder
- Moved `firmware/`, `hardware/`, `docs/` and `CLAUDE.md` into `misc/` (a tiny top-level `CLAUDE.md` loads `misc/CLAUDE.md`).
- Added `design/29oct_back_of_palm_device_holder.3mf` (Base hand 2, Servo Holder, Servo Gear, Idler Gear, spool, Spool Clip) + plate picture.
- **Emergency stop designed:** latching NC button in the servo +5 V wire, D2 sense with 10k to GND. Wiring + parts list in `wiring/`, both pictures updated. New sketch `arduino_ide_code/uno_emg_mg996r_estop_1nov` (syntax-checked only, not tested on hardware).
- **Website: Serial plotter + monitor** (like the Arduino IDE) and a USB speed setting, so the Uno's EMG (9600 baud) shows live in Chrome.
- Tests: protocol 9/9, browser 50/50, no broken links.
- README "Planned next": ESP32 as wireless link (BLE easy, Wi-Fi needs a plan), EMG min/max thresholds, build the E-stop, wireless plotter.

## 1 Nov 2026: 29 Oct setup documented, new folders (branch `1st-november`)
- **Working setup (29 Oct):** analog EMG sensor (2 × 9 V) → Arduino Uno R3 (A0) → D9 → MG996R in the hand holder → 3-gear train + spool → nylon line → 4 finger casings (no thumb). Laptop USB powers the Uno and the servo.
- New folders: `wiring/` (system overview + breadboard wiring PNGs), `arduino_ide_code/` (29 Oct working code, unchanged), `biomechanics_calculation/` (PDF), `design/` (prototype photo, `3d_printed/` index + middle hinged full-ring v3 STLs, design pages), `website/` (site + screenshots + build prompt).
- README and CLAUDE.md rewritten for the current setup: no flex sensor, ESP32 or balance bar yet.
- To check: servo on USB power (MG996R up to ~2.5 A vs ~0.5 A from USB); EMG SIG must stay under 5 V on A0; the code uses the full 0–180°.

## 1 Nov 2026: repo tidy-up (Claude Code)
- Clean branch made from `main`, then reorganised:
  - `PROGRESS_FARID.md` → `misc/`; `SAFETY.md` → `docs/`.
  - Website v1 removed (still in git history). `website/index.html` now forwards to v2.
  - `docs/wiring`, `docs/concepts`, `docs/prompts` and the v1 handoff → `docs/old/`.
  - 3D parts grouped by the date they were added: `hardware/2026-10-21/` (spool v4, hand mount, knuckle set) and `hardware/2026-10-23/` (finger clamps v8), each with its own `cad_scripts/`.
  - README rewritten: one motor, 4 fingers, no thumb (diagram drawn in Mermaid, editable as text). `CLAUDE.md` updated to match.
- Tests: protocol 8/8, browser 45/45, no broken links.
- Found: the repo had been switched to Private, which takes GitHub Pages offline (404). Make it Public again to bring the site back.

## 23 Oct 2026: finger clamps v1 → v8, motor layout A vs B (with Claude)
**What changed**
- New finger interface: `hardware/stl/finger_clamps_v8/` (12 STLs + one 12-part print plate), made by `hardware/cad_scripts/make_finger_clamps.py`. How to print and assemble it: the README in that folder.
- Two interactive design pages in `docs/design/` (open in Chrome):
  - `finger_clamps.html`: 3D hand, one-clamp view, strap on/off animation, sizes, assembly.
  - `hand_unit_layout.html`: design A (servos on the hand) vs design B (table-top unit), flex sensor mounting, spool and force numbers, DevKit wiring.
- Preview pictures in `docs/previews/finger_clamps/`. README, CLAUDE.md and SAFETY.md (new clamp skin checks) updated.

**How the design got here (v1 → v8)**
1. v1: 3 TPU C-clamps per finger (70 % wrap, palm-side opening, fingertip open), elastic through a tunnel, lock pins, one line + knot at the tip.
2. TPU is fixed at 95A (school filament). The softness is set by the wall thickness instead (1.8 mm now; 1.2–1.4 mm if too stiff).
3. Sized to real caliper readings: base / tip widths index 16.1 / 14.2, middle 15.0 / 14.2, ring 14.9 / 13.8, pinky 12.5 / 11.5 mm (the middle segment is the average).
4. U-loop line (up one side, round the tip, back down) for a straight pull with no knot at the tip.
5. The strap moved from tunnel + lock pins (fiddly, damaged the elastic) to **press studs** (on and off with no tools).
6. Flex sensor slot (7.2 × 1.0 mm) added under the line channels.
7. **+3 mm inner size** for a 1.5 mm foam liner. File names now carry the version (`_v7`, `_v8`).
8. v8: the tip clamp's nose is now a small pulley, so both line holes are full circles.

**Tests (on the computer, nothing printed yet)**
- All 13 STLs are closed, one-piece solids (watertight check).
- Studs centred on every clamp (x = −2.30…+2.30 mm) and stick out 1.9 mm.
- Tip clamps: both line holes measure a full 1.4 × 1.4 mm at the end face. The nose stays clear of the flex sensor slot.
- The script in the repo makes byte-identical STLs to the ones sent on 23 Oct.
- Line: PE 4.0 (0.32 mm, 42 lb ≈ 190 N) vs 1.4 mm channels → plenty of room and strength.

**What went wrong**
- The first slicer check used **old files** (tunnel and an off-centre pin hole, no studs). Fix: version numbers in every file name. Only print `_v8`.
- In v7 the tip nose half-covered both line holes ("half-moon" holes). Fixed in v8.

**Numbers to remember (estimates, still to measure)**
- Line travel, fist to straight: ≈ 40–47 mm per finger.
- MG996R datasheet: 9.4 kgf·cm at 4.8 V, 11 kgf·cm at 6 V, ≈ 120° rotation, 55 g, stall ≈ 2.5 A.
- At 120°: spool radius ≈ 22 mm → ≈ 48 N line pull at stall at 6 V → ≈ 6 N per finger in steady use (4 fingers, half of stall). At 180°: 15 mm spool → ≈ 9 N per finger.
- Sheath friction loses ≈ 20–40 %.

**To-do**
1. [ ] Print one middle-finger set (base, middle, tip) in TPU 95A. Test-fit with 1.5 mm foam on the hand.
2. [ ] Measure segment lengths (3 per finger) so clamp lengths and strap holes are exact.
3. [ ] Strap: punch 3 mm holes; check it stays on when making a fist.
4. [ ] Force test with a luggage scale (see To-do 6b above).
5. [ ] Decide: one servo for 4 fingers, or both servos on the fingers (index + middle, ring + little) with the thumb in V2.
6. [ ] Design the back-of-hand plate + table unit box once the clamps fit.

## 22 Oct 2026: flex sensor + 5 LED bar graph (Arduino Uno)
**Setup** (`firmware/flex/flex_5led_uno`): Arduino Uno (COM8), flex on A0, 5 red LEDs on pins 12, 11, 10, 9, 8 with 10k each (dim but visible). The code:
- runs an LED check at start, then learns "flat" in 2 s;
- `b` + Send learns "fully bent", `r` re-learns flat;
- ignores small wobble (NOISE), and only changes the LED count when the bend is clearly past a step (hysteresis).

**Tests and numbers**
1. Partner resistor 2 × 47k in series (≈94k): reading ≈ 126 untouched, wobble ±3, bend change ≈ 10–12 points → LEDs flickered ("haywire") because the change was about the size of the noise.
2. Bent the other way: reading 126 → 112–116 (≈12 points).
3. 10k partner: straight ≈ 535–546 (drifts), bent ≈ 555 → change ≈ 15–23 points. With `b` calibration, 4 LEDs at full bend.
4. The sensor only responds in **one bend direction** (here: printed side on the inside of the curve, opposite to the usual rule). Bending the other way = 0 %.
5. **Zoom trick** (`ZOOM_1V1 = true`, Uno measures 0–1.1 V): 50k on top put the reading at ~1000, too close to the 1023 ceiling. With **100k (2 × 50k) from 5V to A0 and flex from A0 to GND** it works, with a bigger change. Still not smooth: creep after bending, plus contact wiggle on croc clips/breadboard.

**Lessons**
- The online demo was a Tinkercad simulation (perfect virtual sensor). Real resistive flex sensors creep, have hysteresis, and depend on where and how tightly they bend.
- Pick the partner resistor near the sensor's own resistance (or use the 1.1 V zoom for weak sensors). 94k was far too big for an ~11–14k sensor.
- For the device we only need "finger straight → stop the motor", which this sensor can do once it's taped to the finger. Backup: the motor's position (MG996R angle / STS3215 position + load).

**Also made today**
- Tinkercad layouts (Uno + flex + 47k, and flex + 5 LEDs) and Uno code for virtual tests. Tinkercad has no ESP32; the Uno uses 5V/A0, the ESP32 uses 3V3/GPIO 4.
- ESP32 version of the bar graph (`firmware/flex/flex_5led_esp32`, LEDs on GPIO 10–14, flex on GPIO 4) + wiring diagram.

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
