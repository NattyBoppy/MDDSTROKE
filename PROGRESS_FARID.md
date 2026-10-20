# Progress log (Farid)

Running log of the stroke hand exoskeleton build: what was done, what worked, what failed, what's next.
Newest entry at the top. Teammates: read the **Current status** and **To-do** first.

---

## Current status (21 Oct 2026, 1 am)
| Area | Status |
|---|---|
| Mechanics (printed test finger) | ✅ MG90S + spool v4 + knuckle roller set pulls the printed finger fully straight |
| Mechanics (real hand) | ⚠️ MG90S stalls at ~10–20 % resistance. Stronger motors bought (MG996R, STS3215), not yet tested on a hand |
| Flex sensor | ⏳ bought (4.5" and 2.2"); DevKit test sketch ready, not yet tested |
| EMG | ❌ not working reliably yet (see 20 Oct). 1-hour limit tomorrow, then fall back to the DFRobot sensor |
| Website v1 | ✅ works in demo mode (low-poly hand, USB + Bluetooth, calibration, CSV recording) |
| Website v2 (realistic hand) | ⏳ prompt written (`docs/prompts/website_v2_prompt.md`), to be built with Claude Code |
| Finger wrap / C-clamp | ⏳ 5 concepts drawn (`docs/concepts/A..E`), team to choose |

## To-do (in order)
1. [ ] **EMG, maximum 1 hour** (21 Oct): ESP self-test → palm-side fist test on SIG → back of arm. If it fails, use the DFRobot sensor for the demo.
2. [ ] **Flex sensor on the DevKit** (`firmware/flex/flex_devkit_test`): record the readings for a straight finger and a full fist.
3. [ ] Build **website v2** with Claude Code using the prompt; connect it to the flex sensor.
4. [ ] **MG996R knob test** (`firmware/motors/mg996r_knob_test`) on a real finger: find the "just straight" angle.
5. [ ] STS3215: test with the Feetech FD software first; photograph the FE-URT-2 header labels before wiring it to the ESP32.
6. [ ] Choose the finger-wrap concept, measure finger sizes, design the clips + back-of-hand hub + table unit.
7. [ ] Join flex + motor: the motor stops when the flex sensor says "straight".
8. [ ] Join EMG + motor: the EMG trigger opens the hand.

---

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
