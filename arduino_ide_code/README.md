# Arduino IDE code

| Sketch | Date | What it is |
|---|---|---|
| [`working_code_uno_r3_9v_analog_emg_hand_holder_mg996r_29oct`](working_code_uno_r3_9v_analog_emg_hand_holder_mg996r_29oct/) | 29 Oct 2026 | **Working code.** Arduino Uno R3 + 2 × 9 V + analog EMG sensor + hand holder + MG996R |

*(Folder and file names use underscores, not spaces or `+`, because the Arduino IDE refuses sketch names with those. The folder and the `.ino` file must have the same name.)*

Wiring for this sketch: [`../wiring/breadboard_wiring.png`](../wiring/breadboard_wiring.png).

---

## 29 Oct working code: what it does
1. Reads the EMG sensor on **A0** about 100 times a second.
2. **Smooths** the reading (90 % old value + 10 % new value), so one spike can't trigger it.
3. When the smoothed value goes **above 400** (a "hit" = the patient tenses the forearm):
   - hand **closed** → servo turns to **180°** → the gears wind the spool → the fishing line goes taut → **the 4 fingers straighten**;
   - hand **open** (and at least 1 second since it opened) → servo goes back to **0°** → the spool unwinds → the line goes slack → the fingers **curl back into a fist by themselves** (the patient's resting tone).
4. After a hit, the muscle must **relax below 250** before the next hit counts. So holding the muscle tight doesn't make the hand flap open and shut.
5. 0.5 s after each move, the servo signal is switched off (`detach`), so the servo stops buzzing and jittering.
6. Sends the smoothed value to the **Serial Plotter** (Tools → Serial Plotter, **9600 baud**). Use it to see your 400 / 250 lines.

### How to upload
1. Open the `.ino` file in the Arduino IDE.
2. **Tools → Board → Arduino Uno**, and **Tools → Port** → the Uno's COM port.
3. Click **→ Upload**.

### To tune
- `TRIGGER = 400`: lower it if a real effort doesn't trigger; raise it if it triggers by itself.
- `REARM = 250`: must stay **below** `TRIGGER`.
- `moveServo(180)` / `moveServo(0)`: the open and closed angles.

---

## ⚠️ Three things to check (not changed in the code)
1. **Servo power.** At the moment, the MG996R gets its power from the Uno's 5V pin, so from the laptop's USB port. A USB port gives about 0.5 A; an MG996R can pull up to about 2.5 A when the finger resists. That can make the Uno reset, the servo twitch, or the laptop switch the USB port off.
   - **Better:** power the servo from a separate 5–6 V supply (bench supply adjustable output, current limit set). Connect **only the grounds** to the Uno, and keep D9 for the signal.
2. **A0 voltage.** The Uno's A0 can take at most **5 V**. The EMG board's SIG can go up to about +9 V if its gain knob is turned high.
   - Check SIG with a multimeter while flexing as hard as possible. If it goes above about 4.5 V, turn the gain down, or add a divider (two equal resistors halve it, then use `TRIGGER = 200`, `REARM = 125`).
3. **No angle limits.** The code uses the servo's **full 0–180° range**, and nothing stops it if the finger is already straight.
   - Test the first time **without a hand** in the holder.
   - Have someone ready to pull the USB cable.
   - Once you know the "just straight" angle, use that number instead of 180.

Also: during EMG tests, unplug the laptop **charger** (run on battery) and keep the EMG board on its two 9 V batteries only. See [`../docs/SAFETY.md`](../docs/SAFETY.md).
