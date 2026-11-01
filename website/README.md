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

**Not connected to the current Uno setup yet.** The website reads data from the **ESP32-S3** over USB or Bluetooth, and the 29 Oct setup uses an Arduino Uno with no ESP32.
For now, use it in **Demo** mode, or connect an ESP32 running `firmware/flex/flex_devkit_test`.

GitHub publishes this folder automatically every time something changes in it on `main` (see `.github/workflows/pages.yml`).
