/*
  finger_xiao_safe  -  XIAO ESP32S3 + servo + flex sensor + knob (potentiometer) + button + OLED
  ==============================================================================================
  FOR TESTING ON REAL FINGERS. Safety comes first, so it starts with a SMALL movement range.

  ##############################################################################################
  ##  SAFETY - READ BEFORE EVERY UPLOAD                                                       ##
  ##  1. SAFE_MIN / SAFE_MAX below are the servo's hard limits. The code NEVER goes outside   ##
  ##     them, whatever the knob, button, website or flex sensor says.                         ##
  ##     They start narrow (60..110) ON PURPOSE. Widen by 10 degrees at a time, and only     ##
  ##     after you have watched the finger at the current limit.                              ##
  ##  2. Bigger servo (MG996R / DS3218) = 5-10x stronger than the MG90S. Start narrow again. ##
  ##  3. A DS3218 270-degree servo turns ~1.5x further for the same number:                   ##
  ##     write(110) is about 165 real degrees on a 270 servo.                                  ##
  ##  4. Keep a hand on the bench supply OUTPUT button. Velcro must rip off quickly.          ##
  ##############################################################################################

  Three safety layers in this code:
    A. Hard servo limits (SAFE_MIN / SAFE_MAX).
    B. Flex sensor ceiling: once you have saved the STRAIGHT reading (hold the button 2 s
       with the finger straight), opening stops automatically when the finger is straight.
    C. "Blocked" stop: if the servo turns BLOCK_DEG degrees but the finger hardly moves
       (stiff finger / spasm / snagged line), it pauses instead of pulling harder.

  CONTROLS
    Button short press : OPEN / CLOSE / PAUSE (same as before)
    Button hold 2 s    : save the current flex reading as STRAIGHT (finger held straight!)
    Knob (pot)         : with KNOB_MODE = true, the servo follows the knob (inside the limits)
    Website / Serial   : o = open, c = close, s = stop, t = save straight, b = save bent

  WIRING  (XIAO is 3.3 V: never put 5 V on a D pin)
    Servo   red -> + rail (bench supply 6.0 V) | brown -> - rail | orange -> D1
    Button  one leg -> D2, diagonal leg -> - rail
    Flex    XIAO 3V3 -> flex -> D0 ;  47k from D0 -> GND      (printed side facing UP, away from skin)
    Knob    outer legs -> 3V3 and GND ; middle leg -> D3
    OLED    VDD -> 3V3, GND -> GND, SDA -> D4, SCK -> D5
    XIAO GND -> - rail (shared ground). XIAO powered by USB-C. XIAO 5V pin NOT on the + rail.

  Board: XIAO_ESP32S3 (esp32 by Espressif), USB CDC On Boot: Enabled
  Libraries: ESP32Servo, Adafruit SSD1306, Adafruit GFX Library
*/
#include <ESP32Servo.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ======================= SAFETY SETTINGS (change carefully) =======================
const int  SAFE_MIN    = 60;     // servo angle with the finger CURLED (line slack)
const int  SAFE_MAX    = 110;    // servo angle allowed at most (line pulled). Widen 10 at a time.
const int  STEP_DELAY  = 15;     // ms per degree. Bigger = slower = safer. (MG90S demo used 5)
const bool KNOB_MODE   = false;  // true = servo follows the knob instead of the button
const int  BLOCK_DEG   = 30;     // pause if the servo turned this far but the finger barely moved
const int  BLOCK_RAW   = 40;     // "barely moved" = flex reading changed less than this
const int  STRAIGHT_MARGIN = 60; // stop when the flex reading is this close to the saved STRAIGHT
// ==================================================================================

const int SERVO_PIN = D1, BUTTON_PIN = D2, FLEX_PIN = A0, KNOB_PIN = A3;
#define NUS_SERVICE "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_RX      "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_TX      "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

Servo s;
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
Preferences prefs;
bool hasOled = false;

enum State { CLOSED, OPENING, OPENED, CLOSING, PAUSED, BLOCKED, KNOB };
const char* NAMES[] = { "CLOSED", "OPENING", "OPEN", "CLOSING", "PAUSED", "BLOCKED", "KNOB" };
State state = CLOSED;
int angle = SAFE_MIN, target = SAFE_MIN;
int flexRaw = 0, straightRaw = -1, bentRaw = -1;
int blockStartAngle = 0, blockStartFlex = 0;
unsigned long lastStep = 0, lastSend = 0, lastScreen = 0, msgUntil = 0;
const char* msg = "";

BLECharacteristic* txChar = nullptr;
volatile bool bleConnected = false;
volatile char bleCmd = 0;
class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer* srv) { bleConnected = true; }
  void onDisconnect(BLEServer* srv) { bleConnected = false; BLEDevice::startAdvertising(); }
};
class RxCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) { auto v = c->getValue(); if (v.length() > 0) bleCmd = v[0]; }
};

void flash(const char* m) { msg = m; msgUntil = millis() + 2000; Serial.println(m); }
bool atStraight() { return straightRaw >= 0 && abs(flexRaw - straightRaw) <= STRAIGHT_MARGIN; }

void startOpen() {
  if (atStraight()) { flash("Already straight"); return; }
  target = SAFE_MAX; state = OPENING; blockStartAngle = angle; blockStartFlex = flexRaw;
}
void startClose() { target = SAFE_MIN; state = CLOSING; }
void pauseHere()  { target = angle;    state = PAUSED;  }
void saveStraight() { straightRaw = flexRaw; prefs.putInt("straight", straightRaw); flash("Saved STRAIGHT"); }
void saveBent()     { bentRaw = flexRaw;     prefs.putInt("bent", bentRaw);         flash("Saved BENT"); }

void command(char c) {
  switch (c) {
    case 'o': case 'O': startOpen(); break;
    case 'c': case 'C': startClose(); break;
    case 's': case 'S': pauseHere(); break;
    case 't': case 'T': saveStraight(); break;
    case 'b': case 'B': saveBent(); break;
  }
}
void onShortPress() {
  if (state == CLOSED) startOpen();
  else if (state == OPENING || state == CLOSING) pauseHere();
  else startClose();                       // OPEN / PAUSED / BLOCKED -> close (safe direction)
}

// returns 1 = short press, 2 = long press (2 s), 0 = nothing
int readButton() {
  static bool down = false; static unsigned long t0 = 0; static bool longDone = false;
  bool pressed = digitalRead(BUTTON_PIN) == LOW;
  if (pressed && !down) { down = true; t0 = millis(); longDone = false; }
  if (pressed && down && !longDone && millis() - t0 > 2000) { longDone = true; return 2; }
  if (!pressed && down) { down = false; if (!longDone && millis() - t0 > 40) return 1; }
  return 0;
}

void drawScreen() {
  oled.clearDisplay(); oled.setTextColor(SSD1306_WHITE);
  oled.setTextSize(2); oled.setCursor(0, 0);
  oled.println(millis() < msgUntil ? "SAVED" : NAMES[state]);
  oled.setTextSize(1);
  oled.setCursor(0, 20); oled.print("Servo "); oled.print(angle); oled.print("  lim "); oled.print(SAFE_MIN); oled.print("-"); oled.print(SAFE_MAX);
  oled.setCursor(0, 31); oled.print("Flex "); oled.print(flexRaw); oled.print(bleConnected ? "  BT" : "");
  oled.setCursor(0, 42); oled.print("Straight ");
  if (straightRaw < 0) oled.print("not saved"); else oled.print(straightRaw);
  oled.drawRect(0, 54, 128, 10, SSD1306_WHITE);
  oled.fillRect(2, 56, map(angle, SAFE_MIN, SAFE_MAX, 0, 124), 6, SSD1306_WHITE);
  oled.display();
}

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  analogReadResolution(12);
  prefs.begin("exohand", false);
  straightRaw = prefs.getInt("straight", -1);
  bentRaw     = prefs.getInt("bent", -1);

  Wire.begin();
  for (byte a : { (byte)0x3C, (byte)0x3D }) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) { hasOled = oled.begin(SSD1306_SWITCHCAPVCC, a); break; }
  }
  Wire.setClock(400000);

  s.setPeriodHertz(50);
  s.attach(SERVO_PIN, 500, 2400);
  s.write(angle);                           // starts at SAFE_MIN (slack line)

  BLEDevice::init("ExoHand");
  BLEServer* srv = BLEDevice::createServer(); srv->setCallbacks(new ServerCB());
  BLEService* svc = srv->createService(NUS_SERVICE);
  txChar = svc->createCharacteristic(NUS_TX, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());
  BLECharacteristic* rx = svc->createCharacteristic(NUS_RX, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new RxCB());
  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising(); adv->addServiceUUID(NUS_SERVICE); adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  if (KNOB_MODE) state = KNOB;
}

void loop() {
  unsigned long now = millis();

  int b = readButton();
  if (b == 1 && !KNOB_MODE) onShortPress();
  if (b == 2) saveStraight();
  while (Serial.available()) command(Serial.read());
  if (bleCmd) { command(bleCmd); bleCmd = 0; }

  long sum = 0; for (byte i = 0; i < 8; i++) sum += analogRead(FLEX_PIN); flexRaw = sum / 8;

  if (KNOB_MODE) {                          // knob sets the target, always inside the safe limits
    target = map(analogRead(KNOB_PIN), 0, 4095, SAFE_MIN, SAFE_MAX);
    if (atStraight() && target > angle) target = angle;     // never pull past straight
  }

  // ---- safety layer B: flex sensor ceiling ----
  if (state == OPENING && atStraight()) { target = angle; state = OPENED; flash("Straight: stopped"); }
  // ---- safety layer C: servo turning but finger not moving ----
  if (state == OPENING && angle - blockStartAngle >= BLOCK_DEG) {
    if (abs(flexRaw - blockStartFlex) < BLOCK_RAW) { target = angle; state = BLOCKED; flash("BLOCKED: finger not moving"); }
    else { blockStartAngle = angle; blockStartFlex = flexRaw; }
  }

  target = constrain(target, SAFE_MIN, SAFE_MAX);           // safety layer A, always
  if (angle != target && now - lastStep >= (unsigned long)STEP_DELAY) {
    lastStep = now; angle += (target > angle) ? 1 : -1; s.write(angle);
  }
  if (angle == target) {
    if (state == OPENING) state = OPENED;
    else if (state == CLOSING) state = CLOSED;
  }

  if (now - lastSend >= 50) {
    lastSend = now;
    char line[24];
    int n = snprintf(line, sizeof(line), "D,%d,%d,%s\n", flexRaw, angle, NAMES[state]);
    Serial.print(line);
    if (bleConnected && txChar) { txChar->setValue((uint8_t*)line, n); txChar->notify(); }
  }
  if (hasOled && now - lastScreen >= 150) { lastScreen = now; drawScreen(); }
}
