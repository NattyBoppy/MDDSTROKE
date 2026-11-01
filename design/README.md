# Design

## Current prototype (29 Oct): hand holder + 4 finger casings
![hand holder prototype](hand_holder_prototype_29oct.png)

- **Finger casings** on the index, middle, ring and little finger. No thumb for now.
- **Hand holder** on the back of the hand and forearm. The **MG996R** servo is screwed in at its base.
- **3-gear train:** the servo turns the small gear → the middle gear → the big gear. The big gear carries the **spool**.
- **Spool** winds and unwinds the **nylon fishing line**, which runs to all 4 finger casings, so one motor pulls all 4 fingers at once.
- Servo turns → spool **winds** (clockwise) → line goes **taut** → fingers **straighten**.
- Servo returns → spool **unwinds** → line goes **slack** → the fingers curl back into a **fist** by themselves (the stroke patient's resting tone).

## Folders and files
| | |
|---|---|
| [`3d_printed/`](3d_printed/) | STL files of the current printed parts |
| [`finger_clamps.html`](finger_clamps.html) | interactive 3D page of the earlier TPU C-clamp design (v8). Download it, then double-click it to open in Chrome |
| [`hand_unit_layout.html`](hand_unit_layout.html) | interactive comparison of motor layouts (made when 2 motors were planned) |

Older printed parts (spools, knuckle set, C-clamps v8) are in [`../hardware/`](../hardware/), grouped by date.
