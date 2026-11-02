# Website

The **live hand tracker**: a realistic 3D hand that copies the real fingers, with a big STOP button. It runs in Chrome; no install needed.

- Live link: **https://nattyboppy.github.io/MDDSTROKE/v2/** (only works while the GitHub repo is **Public**)
- Try it without any hardware: open the link and press **Demo (no hardware)**.

| In this folder | |
|---|---|
| [`v2/`](v2/) | the website itself. **How to use it: [v2/README.md](v2/README.md)** |
| [`index.html`](index.html) | the front door: it just forwards visitors to `v2/` |
| [`screenshots/`](screenshots/) | pictures of the website (made by the automatic test) |
| [`v2_build_prompt.md`](v2_build_prompt.md) | the original instructions the website was built from |

## Use it with the 29 Oct Uno now: the Serial plotter
The website has a **Serial plotter + monitor** that works like the Arduino IDE's, so you can watch the EMG live in Chrome:
1. Upload the 29 Oct code to the Uno, and **close** the Arduino IDE's Serial Monitor / Plotter.
2. Open the website in **Chrome**. Under **1 · Connect**, set **USB speed** to **9600 (Uno 29 Oct EMG code)**.
3. Click **Connect by USB** and pick the Uno's port.
4. The **Serial plotter** panel draws the smoothed EMG live. **Pause**, **Clear** and **Show the last 10 / 30 / 60 s** work like you'd expect.

![serial plotter](screenshots/v2_serial_plotter.png)

The **3D hand** only moves with ExoHand data lines (`D`, `F`, `M`, `E`), which the ESP32 sketches send. The Uno code prints plain numbers, so it shows up in the plotter only.

## Without the cable: the HC-05 Bluetooth module (2 Nov)
1. Upload [`uno_emg_mg996r_hc05_2nov`](../arduino_ide_code/uno_emg_mg996r_hc05_2nov/) to the Uno (HC-05 TXD → D10, D11 → 1k → HC-05 RXD with 2k to GND).
2. Pair the HC-05 once in the laptop's Bluetooth settings (PIN `1234` or `0000`).
3. Open the website in **Chrome** and click **Connect HC-05 (Bluetooth)**. Pick **HC-05** in the pop-up (on a Mac it is called `cu.HC-05`). The speed is set to 9600 for you.
4. The **Serial plotter** draws the smoothed EMG live, the same as over USB.

**If the link drops** (on a Mac it can drop while the port still looks open), the page notices within about 4 seconds, says "HC-05 link dropped… Reconnecting", and opens it again by itself, like the Arduino IDE's monitor. You don't need to press anything. The status line counts the drops: if it climbs quickly, check the HC-05's wires and the Uno's power (the servo on the Uno's 5V pin can make it reset).

The website's **STOP** and **Open / Close** buttons can't reach this sketch: it only sends, it never listens. The page says so when you press them. Stop the motor by cutting its power.

GitHub publishes this folder automatically every time something changes in it on `main` (see `.github/workflows/pages.yml`).
