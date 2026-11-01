# MDDSTROKE: finger-extension exoskeleton for stroke patients

An NTU group project for stroke patients whose hand rests in a **clenched fist**.
When the patient **tries** to open the hand, a sensor on the forearm picks up the muscle signal, and a motor pulls the four fingers straight.

![hand holder prototype](design/hand_holder_prototype_29oct.png)

## How it works (29 Oct setup)
1. The patient tenses the **forearm muscles** (flexor / extensor).
2. **Electrodes** on the skin pass the signal to an **analog EMG sensor**, powered by **two 9 V batteries**.
3. An **Arduino Uno R3** reads the signal, smooths it, and checks it against a threshold.
4. On a "hit", the Uno turns the **MG996R servo**, which is screwed into the **hand holder**.
5. Through a **3-gear train** (small → middle → big gear), the big gear's **spool** winds in a **nylon fishing line**.
6. The line goes taut and pulls the **index, middle, ring and little finger** straight, all at once. No thumb for now.
7. On the next hit the servo returns, the spool unwinds, the line goes slack, and the fingers curl back into a fist by themselves.

![system overview](wiring/system_overview.png)

**Power:** the 2 × 9 V batteries power **only** the EMG sensor. The **laptop** (USB) powers the Uno, and the Uno powers the servo.

## Folders
| Folder | What is in it |
|---|---|
| [`wiring/`](wiring/) | system overview + breadboard wiring pictures (and their editable source) |
| [`arduino_ide_code/`](arduino_ide_code/) | the Arduino sketches. **Working code: 29 Oct, Uno + EMG + MG996R** |
| [`biomechanics_calculation/`](biomechanics_calculation/) | the finger force / spool / torque calculation (PDF) |
| [`design/`](design/) | the prototype photo, `3d_printed/` STL files, interactive design pages |
| [`website/`](website/) | the live 3D hand tracker website (demo mode for now) |
| [`firmware/`](firmware/) | earlier ESP32 / Nano / XIAO sketches (flex sensor, EMG tests, motor tests) |
| [`hardware/`](hardware/) | earlier printed parts, grouped by date |
| [`docs/`](docs/) | [`SAFETY.md`](docs/SAFETY.md) (read before testing on anyone), previews, and `old/` |
| [`misc/`](misc/) | the work log ([`PROGRESS_FARID.md`](misc/PROGRESS_FARID.md)) |
| `CLAUDE.md` | instructions that Claude Code reads automatically. It has to stay in this top folder. |

## ⚠️ Before testing on a person
- Read [`docs/SAFETY.md`](docs/SAFETY.md).
- Laptop **charger unplugged** during EMG tests.
- First run the servo **without a hand** in the holder, and have someone ready to pull the USB cable.
- The servo currently runs on USB power through the Uno. If the Uno resets or the servo twitches, give the servo its own 5–6 V supply (grounds joined). Details in [`arduino_ide_code/README.md`](arduino_ide_code/README.md).

## Planned next
- **ESP32-S3** reading the EMG signal and sending it by **Bluetooth** to the [website](website/), for live EMG and recording.
- A sensor that tells the motor when the finger is straight, so it stops by itself.

## Team: how to edit
- Small change: open the file on GitHub → pencil icon → edit → **Commit changes**.
- Bigger change: open the repo in Claude Code and describe what you want. It reads `CLAUDE.md` first.
- After a work session, add a dated entry to `misc/PROGRESS_FARID.md`.
