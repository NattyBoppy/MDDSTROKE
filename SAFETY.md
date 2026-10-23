# Safety checklist (read before every test on a person)

## Motors
- [ ] `SAFE_MIN` / `SAFE_MAX` (or `POS_MIN` / `POS_MAX`, `TORQUE_LIMIT`) at the top of the sketch are the **narrow** starting values. Widen them only 10° (or ~100 steps) at a time.
- [ ] First run with **no finger attached**. Watch the full range.
- [ ] Someone keeps a hand on the **bench supply OUTPUT button** (or unplugs the servo) during every finger test.
- [ ] Big servos are on the bench supply **adjustable** output (6.0 V, current limit set), never on the ESP32. Grounds are shared.
- [ ] Stop immediately if there's pain, the finger is forced past straight, or the servo buzzes against a stalled finger.

## Finger clamps (anything strapped to the hand)
- [ ] Foam liner fitted in every clamp. No bare TPU edges on the skin.
- [ ] After 15 minutes, take the clamps off and check for red marks or dents. Stop if a mark is still there after 10 minutes.
- [ ] Clamps must slide on and off without forcing the finger. Never force a clenched finger open to fit a clamp.
- [ ] The fishing line runs inside the clamp channels only, never directly against the skin.

## EMG / anything on the skin
- [ ] Laptop **charger unplugged** (run on battery). No bench supply or motor on the EMG breadboard.
- [ ] EMG board on its two 9 V batteries only. Clip the batteries on last and unclip them first.
- [ ] The SIG output always goes through the 1/3 divider before an ESP32 pin.
- [ ] No broken skin under the electrodes. Remove them if they itch or burn.

## Electronics
- [ ] ESP32 GPIO max 3.3 V. Never connect 5 V to a GPIO.
- [ ] Never feed the Nano's 5 V pin while its USB is plugged in. Never put 5 V on the XIAO's pins.
- [ ] Before powering a new breadboard layout: continuity check that 3V3 and GND are **not** shorted.
