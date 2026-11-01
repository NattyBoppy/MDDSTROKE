/*
  finger_flex_nano  -  Arduino Nano + MG90S servo + button + 0.96" OLED + 4.5" flex sensor
  -----------------------------------------------------------------------------------------
  Same as servo_180_day2, plus:
   - reads the flex sensor and sends it to the Finger Tracker website over USB
   - the website can also send OPEN / CLOSE / STOP
   - optional: stop opening as soon as the flex sensor says the finger is straight

  Button: press = OPEN, press again = CLOSE, press while moving = PAUSE (next press closes)

  WIRING
    Servo  red -> + rail | brown -> - rail | orange -> D9
    Button one leg -> D2, the DIAGONAL leg -> - rail
    OLED   VDD -> + rail, GND -> - rail, SDA -> A4, SCK -> A5
    FLEX   one leg -> Nano 5V pin           (the Nano's own 5V, NOT the bench supply rail)
           other leg -> A0
           47k resistor from A0 -> GND        (10k also works, smaller range)
    Nano GND -> - rail  (shared ground with the bench supply)
    Power: Nano by USB from the laptop (needed for the website); servo + OLED from the
           bench supply 5V on the rails; Nano 5V pin NOT connected to the + rail.

  Libraries: Adafruit SSD1306, Adafruit GFX Library.  Board: Arduino Nano, ATmega328P.
  Website talks at 115200 baud. Close the Arduino Serial Monitor before connecting the website.
*/
#include <Servo.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---------------- SETTINGS ----------------
const int CLOSED_ANGLE = 10;     // finger curled
const int OPEN_ANGLE   = 170;    // finger straight (the LIMIT)
const int STEP_DELAY   = 5;      // ms per degree. bigger = slower

// Flex sensor calibration: watch "sensor reading" on the website,
// write down the number with the finger STRAIGHT and fully BENT, put them here.
const int  FLEX_STRAIGHT = -1;   // -1 = not calibrated yet
const int  FLEX_BENT     = -1;
const bool STOP_WHEN_STRAIGHT = false;   // true = stop opening once the sensor says straight
// ------------------------------------------

const int SERVO_PIN = 9, BUTTON_PIN = 2, FLEX_PIN = A0;

Servo s;
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
bool hasOled = false;

enum State { CLOSED, OPENING, OPENED, CLOSING, PAUSED };
const char* NAMES[] = { "CLOSED", "OPENING", "OPEN", "CLOSING", "PAUSED" };
State state = CLOSED;
int angle = CLOSED_ANGLE, target = CLOSED_ANGLE;
int flexRaw = 0;
unsigned long lastStep = 0, lastSend = 0, lastScreen = 0;

int flexPercentOpen() {                      // -1 if not calibrated
  if (FLEX_STRAIGHT < 0 || FLEX_BENT < 0 || FLEX_STRAIGHT == FLEX_BENT) return -1;
  long p = (long)(flexRaw - FLEX_BENT) * 100 / (FLEX_STRAIGHT - FLEX_BENT);
  return constrain(p, 0, 100);
}

void startOpen()  { target = OPEN_ANGLE;   state = OPENING; }
void startClose() { target = CLOSED_ANGLE; state = CLOSING; }
void pauseHere()  { target = angle;        state = PAUSED;  }

void onButton() {
  if (state == CLOSED) startOpen();
  else if (state == OPENING || state == CLOSING) pauseHere();
  else startClose();                         // OPENED or PAUSED -> close (the safe direction)
}

bool buttonPressed() {                       // debounced, never blocks
  static bool stable = HIGH, lastRead = HIGH;
  static unsigned long changed = 0;
  bool r = digitalRead(BUTTON_PIN);
  if (r != lastRead) { lastRead = r; changed = millis(); }
  if (millis() - changed > 30 && r != stable) {
    stable = r;
    if (stable == LOW) return true;
  }
  return false;
}

int stepDelayNow() {                         // slower near both ends
  int span = abs(OPEN_ANGLE - CLOSED_ANGLE);
  bool nearEnd = abs(angle - CLOSED_ANGLE) < span * 0.15 || abs(angle - OPEN_ANGLE) < span * 0.15;
  return nearEnd ? STEP_DELAY * 2 : STEP_DELAY;
}

void drawScreen() {
  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);
  oled.setTextSize(2); oled.setCursor(0, 0); oled.println(NAMES[state]);
  oled.setTextSize(1);
  oled.setCursor(0, 22); oled.print("Servo "); oled.print(angle); oled.print(" deg");
  oled.setCursor(0, 34); oled.print("Flex  "); oled.print(flexRaw);
  int p = flexPercentOpen();
  if (p >= 0) { oled.print("  "); oled.print(p); oled.print("% open"); }
  int barPct = (p >= 0) ? p : (long)(angle - CLOSED_ANGLE) * 100 / (OPEN_ANGLE - CLOSED_ANGLE);
  oled.drawRect(0, 48, 128, 10, SSD1306_WHITE);
  oled.fillRect(2, 50, map(constrain(barPct, 0, 100), 0, 100, 0, 124), 6, SSD1306_WHITE);
  oled.display();
}

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  // screen start-up that can never freeze the Nano
  Wire.begin();
  Wire.setWireTimeout(3000, true);
  byte addr = 0;
  const byte addrs[2] = { 0x3C, 0x3D };
  for (byte i = 0; i < 2; i++) {
    Wire.beginTransmission(addrs[i]);
    if (Wire.endTransmission() == 0) { addr = addrs[i]; break; }
  }
  if (addr) hasOled = oled.begin(SSD1306_SWITCHCAPVCC, addr);
  Wire.setClock(400000);
  s.attach(SERVO_PIN);
  s.write(angle);
  Serial.println(hasOled ? "OLED found" : "OLED not found - running without screen");
}

void loop() {
  unsigned long now = millis();

  if (buttonPressed()) onButton();
  while (Serial.available()) {               // commands from the website
    char c = Serial.read();
    if (c == 'o' || c == 'O') startOpen();
    else if (c == 'c' || c == 'C') startClose();
    else if (c == 's' || c == 'S') pauseHere();
  }

  // flex sensor, averaged over 4 readings to calm the noise
  long sum = 0;
  for (byte i = 0; i < 4; i++) sum += analogRead(FLEX_PIN);
  flexRaw = sum / 4;

  if (state == OPENING && STOP_WHEN_STRAIGHT && flexPercentOpen() >= 98) {
    target = angle; state = OPENED;          // finger is straight: stop here
  }

  if (angle != target && now - lastStep >= (unsigned long)stepDelayNow()) {
    lastStep = now;
    angle += (target > angle) ? 1 : -1;
    s.write(angle);
  }
  if (angle == target) {
    if (state == OPENING) state = OPENED;
    else if (state == CLOSING) state = CLOSED;
  }

  if (now - lastSend >= 50) {                // 20 readings a second to the website
    lastSend = now;
    Serial.print("D,"); Serial.print(flexRaw);
    Serial.print(',');  Serial.print(angle);
    Serial.print(',');  Serial.println(NAMES[state]);
  }
  if (hasOled && now - lastScreen >= 150) { lastScreen = now; drawScreen(); }
}
