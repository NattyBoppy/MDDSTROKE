# Wiring

Current setup (29 Oct): **Arduino Uno R3 + analog EMG sensor (2 × 9 V) + MG996R + hand holder**, plus the planned **emergency stop** (1 Nov).
The ESP32-S3 and the website are planned and drawn dashed; they're not wired yet.

| Picture | What it shows |
|---|---|
| [system_overview.png](system_overview.png) | the whole system, step by step: muscle → electrodes → EMG sensor → Uno → servo → gears + spool → line → 4 fingers, plus the two power sources |
| [breadboard_wiring.png](breadboard_wiring.png) | every wire: batteries → EMG sensor, SIG → A0, shared ground, D9 / 5V / GND → servo, the E-stop in the servo's +5 V with D2 sense, laptop USB |

![system overview](system_overview.png)

![breadboard wiring](breadboard_wiring.png)

## Emergency stop (added 1 Nov, not built yet)
A big red **latching** button (push to stop, twist to release), wired **into the servo's red +5 V wire**:
1. **Press it** → the servo loses power **at once**. This is pure wiring, so it works even if the code is stuck. The motor stops pulling, the line goes slack, and the patient can take the holder off.
2. **D2 tells the Uno.** D2 is wired to the servo side of the button, with a **10k resistor to GND**. Normal = HIGH, pressed = LOW. The E-stop sketch then stays stopped, so the servo can't jump when the button is released.
3. **To restart:** twist the button to release it, then press the Uno's **RESET** button.

Code: [`arduino_ide_code/uno_emg_mg996r_estop_1nov`](../arduino_ide_code/uno_emg_mg996r_estop_1nov/). It's the 29 Oct code plus the E-stop, **not tested on hardware yet**.

## Parts list
| Part | Qty | Notes |
|---|---|---|
| Arduino Uno R3 + USB cable | 1 | powered by the laptop (charger unplugged) |
| Analog EMG sensor (Muscle Sensor V3) + electrode cable | 1 | |
| Electrode pads | 3 | 2 on the muscle (~2 cm apart), 1 on the elbow bone |
| 9 V battery + snap clip | 2 | power the EMG sensor only |
| MG996R servo | 1 | in the hand holder |
| **Emergency stop button** | 1 | latching mushroom head (twist to release), **1 × NC contact**, rated ≥ 3 A. 22 mm panel type fits a small box |
| **10 kΩ resistor** | 1 | D2 → GND (tells the Uno the button was pressed) |
| Breadboard + jumper wires | – | red = +, grey/black = GND, purple = SIG, yellow/orange = servo signal, green = D2 sense |
| *Recommended:* separate 5–6 V supply for the servo | 1 | if the Uno resets or the servo twitches. The E-stop then goes in that supply's + wire, with grounds joined |

## Power, in one sentence each
- The **two 9 V batteries** power the EMG sensor and nothing else.
- The **laptop** (USB) powers the Uno, and the Uno's 5V pin powers the servo.
- All the grounds are joined, so the Uno can read the EMG signal.

## Editing the pictures
The pictures are made from the files in [`source/`](source/). Open one in Chrome to see it, and edit the text in it with any text editor.
To make a new PNG, take a screenshot of it, or ask Claude Code to re-render it.

Older wiring diagrams (ESP32 flex sensor, first EMG tests) are in [`../misc/docs/old/wiring/`](../misc/docs/old/wiring/).
