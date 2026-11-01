# MDDSTROKE: finger-extension exoskeleton for stroke patients

An NTU group project for stroke patients whose hand rests in a **clenched fist**.
When the patient **tries** to open the hand, a sensor on the forearm picks up the muscle signal, and a motor pulls the four fingers straight.

![hand holder prototype](design/hand_holder_prototype_29oct.png)

## How it works (29 Oct setup)
1. The patient tenses the **forearm muscles** (flexor / extensor).
2. **Electrodes** on the skin pass the signal to an **analog EMG sensor**, powered by **two 9 V batteries**.
3. An **Arduino Uno R3** reads the signal, smooths it, and checks it against a threshold.
4. On a "hit", the Uno turns the **MG996R servo**, which is screwed into the **back-of-palm holder**.
5. Through a **3-gear train** (servo gear → idler gear → big gear), the big gear's **spool** winds in a **nylon fishing line**.
6. The line goes taut and pulls the **index, middle, ring and little finger** straight, all at once. No thumb for now.
7. On the next hit the servo returns, the spool unwinds, the line goes slack, and the fingers curl back into a fist by themselves.
8. **Emergency stop** (designed 1 Nov, not built yet): a red button cuts the servo's power at once, so the patient can take the device off safely.

![system overview](wiring/system_overview.png)

**Power:** the 2 × 9 V batteries power **only** the EMG sensor. The **laptop** (USB) powers the Uno, and the Uno powers the servo through the E-stop.

## Folders
| Folder | What is in it |
|---|---|
| [`wiring/`](wiring/) | system overview + breadboard wiring pictures, parts list, emergency stop |
| [`arduino_ide_code/`](arduino_ide_code/) | Arduino sketches: **29 Oct working code**, and the 1 Nov version with the E-stop |
| [`biomechanics_calculation/`](biomechanics_calculation/) | the finger force / spool / torque calculation (PDF) |
| [`design/`](design/) | prototype photo, **29 Oct back-of-palm holder (.3mf print file)**, `3d_printed/` finger casings |
| [`website/`](website/) | live 3D hand + **Serial plotter** (watch the EMG live in Chrome, like the Arduino IDE) |
| [`misc/`](misc/) | work log, safety checklist (`misc/docs/SAFETY.md`), earlier firmware / hardware / docs, the full `CLAUDE.md` |

## ⚠️ Before testing on a person
- Read [`misc/docs/SAFETY.md`](misc/docs/SAFETY.md).
- Laptop **charger unplugged** during EMG tests.
- First run the servo **without a hand** in the holder, and have someone ready to pull the USB cable (until the E-stop is built).
- The servo currently runs on USB power through the Uno. If the Uno resets or the servo twitches, give it its own 5–6 V supply (grounds joined). Details in [`arduino_ide_code/README.md`](arduino_ide_code/README.md).

## Planned next (to discuss with the team)
1. **ESP32-S3 as the wireless link.** Use it only for its **Bluetooth / Wi-Fi**, to send the live data (EMG, motor state) to our [website](website/), which shows the hand moving. How exactly is still to be worked out:
   - **Bluetooth** is the easiest: the website can already connect to an ESP32 called "ExoHand" in Chrome.
   - **Wi-Fi** is harder: a website on `https://` (GitHub Pages) can't talk to a plain `http://` ESP32 on the local network. Options: the ESP32 serves its own page, or a secure connection.
2. **EMG min / max thresholds.** Today the motor toggles on any contraction spike (above 400, relax below 250). We want a proper **minimum and maximum** per person (calibrate at rest and at full effort), to decide when the spool **tightens** (open) and when it **releases** (close).
3. **Emergency stop: build it** (with the mechanics team). A switch or button that **stops everything** without breaking anything, so the patient can take the device off. Wiring, parts and code are ready in [`wiring/`](wiring/) and [`arduino_ide_code/uno_emg_mg996r_estop_1nov`](arduino_ide_code/uno_emg_mg996r_estop_1nov/). Mechanics: where it sits so the patient can reach it with the other hand.
4. **Website as the Arduino IDE.** ✅ Started: the website's **Serial plotter + monitor** shows the Uno's EMG live over USB (set USB speed to 9600). Next: the same over **Bluetooth / Wi-Fi** through the ESP32.
5. **Wireless instead of the USB cable**: needs (1). The servo will then also need its own power supply.

## Team: how to edit
- Small change: open the file on GitHub → pencil icon → edit → **Commit changes**.
- Bigger change: open the repo in Claude Code and describe what you want. It reads `CLAUDE.md` (which loads `misc/CLAUDE.md`) first.
- After a work session, add a dated entry to [`misc/PROGRESS_FARID.md`](misc/PROGRESS_FARID.md).
