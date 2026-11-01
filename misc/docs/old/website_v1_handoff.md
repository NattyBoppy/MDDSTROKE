> Moved from the old `handtracker/` folder: `site/` is now `website/v1/`, and the firmware is in `firmware/flex/`.

# Handoff: Finger Tracker website + flex sensor firmware

Project: stroke hand exoskeleton (NTU). A cable-driven glove opens a clenched finger with a servo. A 4.5" flex sensor on the back of the finger measures how bent it is. This website shows that bend live as a 3D hand.

Status on 19 Oct 2026:
- The website works in demo mode and has been checked in Chrome on desktop and phone sizes.
- The firmware is written but not yet flashed, and has not been tested with a real flex sensor (it arrives 20 Oct).

## What is in this folder

```
handtracker/
  handoff.md                     <- this file
  site/index.html                <- the whole website (one file, no build step)
  firmware/finger_flex_nano/     <- Arduino Nano version (use this for POC1 on Thu 22 Oct)
  firmware/finger_flex_xiao/     <- XIAO ESP32S3 version (USB + Bluetooth, the brain from now on)
```

## Put the website on Netlify (pick one)

**A. Drag and drop (easiest, about 1 minute)**
1. Go to https://app.netlify.com/drop and log in.
2. Drag the **`site`** folder (not the whole handtracker folder) onto the page.
3. Netlify gives you a link like `https://something.netlify.app`.
4. Optional: in Site settings, rename it to something like `exohand-tracker`.

**B. Command line (if Node is installed)**
```
cd handtracker
npx netlify-cli login
npx netlify-cli deploy --dir=site --prod
```

**C. Claude on the desktop with a Netlify connector:** ask it to "deploy the `site` folder in handtracker to Netlify as a new site". It is a static site with one `index.html`, no build command, and publish directory `site`.

The site must be served over **https**, because the USB and Bluetooth browser features only work on https. Netlify does this automatically.

## Using it

| Browser | USB | Bluetooth |
|---|---|---|
| Chrome / Edge on a laptop | Yes | Yes |
| Chrome on Android | No | Yes |
| Any browser on iPhone, Safari, Firefox | No | No (demo mode only) |

1. Flash a firmware (below). Plug the board into the laptop. **Close the Arduino Serial Monitor**, because only one program can use the port at a time.
2. Open the Netlify link in Chrome, press **Connect by USB**, and pick the board (often "USB-SERIAL CH340" for the Nano, or "USB JTAG/serial" for the XIAO).
3. For the XIAO by Bluetooth, press **Connect by Bluetooth** and pick **ExoHand**.
4. Calibrate: hold the finger straight and press **Save straight**. Curl it fully and press **Save fully bent**. These are saved in that browser.
5. **Open finger / Close finger / Stop** send commands to the device. **Start recording** then **Download recording (CSV)** saves a session.

## Firmware

**Nano (Thursday demo):** `firmware/finger_flex_nano/finger_flex_nano.ino`
- Board: Arduino Nano, Processor: ATmega328P. Libraries: Adafruit SSD1306 and Adafruit GFX.
- Flex wiring: Nano **5V** -> flex -> **A0** -> **47k** -> GND. Servo signal on D9, button on D2, OLED on A4/A5.
- Servo powered from the bench supply 5V; Nano powered by USB; grounds connected; Nano 5V pin **not** on the + rail.

**XIAO ESP32S3:** `firmware/finger_flex_xiao/finger_flex_xiao.ino`
- Install the esp32 boards package by Espressif. Board: XIAO_ESP32S3, USB CDC On Boot: Enabled. Libraries: ESP32Servo, Adafruit SSD1306, Adafruit GFX.
- Flex wiring: XIAO **3V3** (never 5V) -> flex -> **D0** -> **47k** -> GND. Servo signal D1, button D2, OLED SDA D4 / SCK D5.

**Auto-stop when straight (both versions):**
1. Connect the website and note the **sensor reading** with the finger straight and fully bent.
2. Put those two numbers in `FLEX_STRAIGHT` and `FLEX_BENT`.
3. Set `STOP_WHEN_STRAIGHT = true` and upload again.

## Data format (for anyone extending this)

Device -> website: one text line every 50 ms, over USB at 115200 baud, or as Bluetooth notifications:
```
D,<flex_raw>,<servo_deg>,<state>\n      e.g.  D,612,150,OPENING
```
- `state` is one of CLOSED, OPENING, OPEN, CLOSING, PAUSED.
- With the recommended wiring, a more bent finger gives a lower `flex_raw`.

Website -> device: single characters: `o` = open, `c` = close, `s` = stop. They go over USB, or by Bluetooth write.

Bluetooth uses the Nordic UART Service:
- Service `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`
- TX (notify) `...0003`
- RX (write) `...0002`
- Device name `ExoHand`

Website model:
- bend (0 to 1) = (straight − raw) / (straight − bent)
- Finger angle shown = 180° − 90° × bend, so 180° = straight and 90° = fist.
- The 3D index finger bends at MCP 85°, PIP 100° and DIP 65° times the bend.

## Ideas KID mentioned for next steps (not built yet)
- Finger angle tracking over time, which KID will specify further.
- AI-powered app, which is a grading criterion for the 5 Nov demo:
  - learn each user's comfortable opening limit from the flex readings and servo effort;
  - suggest a session target;
  - summarise progress.
- Save sessions to a database (KID already uses Supabase for another project) instead of only downloading CSVs.
- More fingers: one flex sensor each, and the 3D model already has all five.
