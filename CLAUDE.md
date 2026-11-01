# CLAUDE.md: read this first (for Claude Code and teammates using Claude)

## What this project is
NTU group project (MDD): a **cable-driven finger-extension exoskeleton for stroke patients whose hand is stuck in a clenched fist**.
One motor pulls a nylon fishing line that runs along the back of the fingers and opens them to straight.

- **Current working setup (29 Oct):** analog EMG sensor (Muscle Sensor V3, powered ONLY by 2 × 9 V) → **Arduino Uno R3** (A0, smoothing + threshold toggle) → D9 → **MG996R** in a **hand holder** → 3-gear train (small → middle → big gear with spool) → **nylon fishing line** → **4 finger casings** (index, middle, ring, little; **no thumb**). One motor pulls all 4 fingers at once.
  - The Uno is powered by the laptop USB, and the servo by the Uno's 5V pin.
  - Spool winds (clockwise) → line taut → fingers straighten. Spool unwinds → slack → the fingers return to a fist by themselves (resting tone).
- **Not in use yet:** flex sensors, ESP32-S3, balance bar/whiffletree, coil sheaths, table-top unit. Older firmware/hardware for these stays in `firmware/` and `hardware/`.
- **Planned:** ESP32-S3 reads the EMG (through the 1/3 divider) and sends it by Bluetooth to the website.
- Code: `arduino_ide_code/working_code_uno_r3_9v_analog_emg_hand_holder_mg996r_29oct/`. Wiring: `wiring/`.
- Milestones: POC1 Thu 22 Oct 2026, POC2 29 Oct, CA2 demo 5 Nov 2026 (graded on need-statement fit, casing/materials, electronics, AI-powered app).
- Later phases add a display on the table unit, plus machine learning that compares the flexor and extensor EMG to decide open or close.

## The person driving this
The lead (Farid / KID) is a UI/UX designer and maker, **not a software engineer**.
- Explain in plain, step-by-step language.
- Prefer diagrams and screenshots.
- Never assume git or terminal knowledge. Say exactly which button to click.

## SAFETY RULES (never break these)
1. **The firmware owns the motor limits.** Each sketch has `SAFE_MIN` / `SAFE_MAX` (or `POS_MIN` / `POS_MAX`, `TORQUE_LIMIT`) at the top in a `#####` box.
   - The website may only send `o` (open), `c` (close) and `s` (stop). It must never send raw angles.
2. Any change that widens a motor limit must be pointed out to the user in **bold**, with the old and new values.
3. There must always be a **big, obvious STOP** in the website. It sends `s`, and so does the Space key.
4. ESP32 pins are **3.3 V max**.
   - The red EMG board can output up to ~9 V, so it always goes through the 1/3 divider (3 × 47k).
   - Never put 5 V on an ESP32 GPIO.
5. During EMG tests: laptop charger **unplugged**, EMG board on its two 9 V batteries, no bench supply or motor on the same board.
6. Big servos (MG996R, STS3215, DS3218) are powered from the bench supply's **adjustable** output (6.0 V, with the current limit set), never from the ESP32, and always with a shared ground.

## Repo layout
```
README.md            front page (keep it short and current)
CLAUDE.md            this file. Must stay in the top folder: Claude Code only reads it from there
wiring/              system_overview.png + breadboard_wiring.png (current Uno setup); source/ = editable SVG pages
arduino_ide_code/    Arduino sketches. Sketch folder name = .ino name, underscores only (Arduino IDE rule)
biomechanics_calculation/  finger force / spool / torque calculation (PDF)
design/              prototype photo, design pages (.html, open in Chrome), 3d_printed/ = current STLs
website/             live hand tracker: v2/ (the site), index.html (forwards to v2), screenshots/, build prompt
firmware/            earlier ESP32 / Nano / XIAO sketches: flex/, emg/, motors/
hardware/<date>/     earlier printed parts grouped by the date they were added (YYYY-MM-DD)
docs/SAFETY.md       safety checklist: read before every test on a person
docs/previews/       preview pictures of earlier parts
docs/old/            out-of-date material: old wiring, concepts, website v1 handoff
misc/PROGRESS_FARID.md  running log of what was done / worked / failed / to-do. UPDATE IT after each work session.
```

## Hardware facts
| Part | Notes |
|---|---|
| Brain | ESP32-S3 DevKit N16R8 ("YD-ESP32-S3"). Arduino board "ESP32S3 Dev Module", Flash 16MB, PSRAM OPI, plug into the **USB-UART** USB-C port |
| Also used | Arduino Nano (POC board with button + OLED), Seeed XIAO ESP32S3 (runs out of pins for 5 fingers) |
| Flex sensors | 4.5" and 2.2". Wiring: 3V3 → flex → ADC pin → 47k → GND. Bending lowers the reading. On the hand: pin end fixed on the back-of-hand plate, the rest slides through the slot in each clamp |
| Finger clamps | v8, TPU 95A (school filament, hardness fixed). 3 per finger, 70 % wrap, inner size = finger + 3 mm for a 1.5 mm foam liner. Elastic strap on press studs; U-loop line round a pulley nose on the tip clamp |
| Line | Braided PE 4.0 (0.32 mm, 42 lb). Clamp channels are Ø1.4 mm |
| EMG | Red analog EMG board (Muscle Sensor V3 style: +VS, GND, -VS / SIG, GND), powered by 2 × 9 V (±9 V); SIG → 47k → 47k → [pin] → 47k → GND. Also a DFRobot AD8232 heart sensor (weak for EMG but usable) |
| Motors | MG90S (too weak on a real hand), MG996R, Feetech STS3215 (serial bus, FE-URT-2 board, 1,000,000 baud, library FTServo_Arduino), DS3218 possible |

### DevKit pin plan (ADC1 pins only; ADC2 clashes with Wi-Fi/BT)
| GPIO | Use |
|---|---|
| 1 | EMG channel A (extensor), via the 1/3 divider |
| 2 | EMG channel B (flexor, later) |
| 4 | flex: index (the first single sensor goes here) |
| 6 / 7 / 8 | flex: middle / ring / little |
| 9 | flex: thumb (not used for now) |
| 5 | servo signal (the one motor, 4 fingers) |
| 16 | spare (was planned for a thumb servo) |
| 17 / 18 | Serial1 TX / RX to the FE-URT-2 board (STS3215), only once its header is confirmed 3.3 V-safe |

## Device ↔ website protocol (115200 baud USB serial, or Bluetooth Nordic UART "ExoHand")
Device → website, one text line every ~20–50 ms. The website must ignore any line it does not understand.
```
D,<flex_raw>,<servo_deg>,<state>          v1 format (single finger, = index). state: CLOSED|OPENING|OPEN|CLOSING|PAUSED|IDLE|BLOCKED
F,<thumb>,<index>,<middle>,<ring>,<little>  raw flex 0..4095, -1 = no sensor fitted
M,<servo1_deg>,<servo2_deg>,<state>       motors
E,<extensor_mV>,<flexor_mV>,<on 0|1>      EMG envelope (sensor-side millivolts) + trigger
```
Website → device: single characters `o` open, `c` close, `s` stop.
Bluetooth NUS UUIDs: service 6E400001-B5A3-F393-E0A9-E50E24DCCA9E, RX (write) 6E400002…, TX (notify) 6E400003….

## Working style for Claude in this repo
- Keep the website **static, no build step**: plain HTML/CSS/ES modules, three.js from a pinned CDN version. Friends must be able to open the files and edit them.
- Write comments in plain English.
- Small commits with clear messages.
- After every session, append to `misc/PROGRESS_FARID.md` under today's date: what changed, tests run (with numbers), what worked, what failed, and the to-do list.
- Keep the repo **public** (GitHub Pages needs that on a free account): no personal data, no patient or tester names or health details, no emails or keys.
