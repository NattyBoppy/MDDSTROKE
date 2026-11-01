/*
  finger_flex_xiao  -  Seeed XIAO ESP32S3 + servo + button + 0.96" OLED + 4.5" flex sensor
  ----------------------------------------------------------------------------------------
  The "brain" from now on. Same behaviour as the Nano version, plus Bluetooth:
  the Finger Tracker website can connect by USB OR by Bluetooth (device name "ExoHand").

  WIRING  (the XIAO is a 3.3 V board: never put 5 V on its D pins)
    Servo  red -> + rail (bench supply 5 V) | brown -> - rail | orange -> D1
    Button one leg -> D2, the DIAGONAL leg -> - rail
    OLED   VDD -> XIAO 3V3, GND -> - rail, SDA -> D4, SCK -> D5
    FLEX   one leg -> XIAO 3V3   (3.3 V, NOT 5 V)
           other leg -> D0 (A0)
           47k resistor from D0 -> GND
    XIAO GND -> - rail (shared ground with the bench supply)
    Power: XIAO by USB-C from the laptop (or a USB power bank); servo from the bench supply.
           XIAO 5V pin NOT connected to the + rail while USB is plugged in.

  Arduino IDE setup (once):
    File > Preferences > Additional boards manager URLs:
      https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
    Tools > Board > Boards Manager: install "esp32" by Espressif
    Tools > Board: "XIAO_ESP32S3"     Tools > USB CDC On Boot: "Enabled"
    Libraries: ESP32Servo (Kevin Harrington), Adafruit SSD1306, Adafruit GFX Library
*/
#include <ESP32Servo.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ---------------- SETTINGS ----------------
const int CLOSED_ANGLE = 10;
const int OPEN_ANGLE   = 170;
const int STEP_DELAY   = 5;      // ms per degree. bigger = slower
const int  FLEX_STRAIGHT = -1;   // fill in from the website's "sensor reading" (0-4095 here)
const int  FLEX_BENT     = -1;
const bool STOP_WHEN_STRAIGHT = false;
// ------------------------------------------

const int SERVO_PIN = D1, BUTTON_PIN = D2, FLEX_PIN = A0;

// Nordic UART Service - the website looks for these
#define NUS_SERVICE "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_RX      "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_TX      "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

Servo s;
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
bool hasOled = false;

enum State { CLOSED, OPENING, OPENED, CLOSING, PAUSED };
const char* NAMES[] = { "CLOSED", "OPENING", "OPEN", "CLOSING", "PAUSED" };
State state = CLOSED;
int angle = CLOSED_ANGLE, target = CLOSED_ANGLE;
int flexRaw = 0;
unsigned long lastStep = 0, lastSend = 0, lastScreen = 0;

BLECharacteristic* txChar = nullptr;
volatile bool bleConnected = false;
volatile char bleCmd = 0;

class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer* srv) { bleConnected = true; }
  void onDisconnect(BLEServer* srv) { bleConnected = false; BLEDevice::startAdvertising(); }
};
class RxCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) {
    auto v = c->getValue();
    if (v.length() > 0) bleCmd = v[0];
  }
};

int flexPercentOpen() {
  if (FLEX_STRAIGHT < 0 || FLEX_BENT < 0 || FLEX_STRAIGHT == FLEX_BENT) return -1;
  long p = (long)(flexRaw - FLEX_BENT) * 100 / (FLEX_STRAIGHT - FLEX_BENT);
  return constrain(p, 0, 100);
}
void startOpen()  { target = OPEN_ANGLE;   state = OPENING; }
void startClose() { target = CLOSED_ANGLE; state = CLOSING; }
void pauseHere()  { target = angle;        state = PAUSED;  }
void command(char c) {
  if (c == 'o' || c == 'O') startOpen();
  else if (c == 'c' || c == 'C') startClose();
  else if (c == 's' || c == 'S') pauseHere();
}
void onButton() {
  if (state == CLOSED) startOpen();
  else if (state == OPENING || state == CLOSING) pauseHere();
  else startClose();
}
bool buttonPressed() {
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
int stepDelayNow() {
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
  oled.setCursor(0, 34); oled.print("Flex "); oled.print(flexRaw);
  oled.print(bleConnected ? "  BT on" : "");
  int p = flexPercentOpen();
  int barPct = (p >= 0) ? p : (long)(angle - CLOSED_ANGLE) * 100 / (OPEN_ANGLE - CLOSED_ANGLE);
  oled.drawRect(0, 48, 128, 10, SSD1306_WHITE);
  oled.fillRect(2, 50, map(constrain(barPct, 0, 100), 0, 100, 0, 124), 6, SSD1306_WHITE);
  oled.display();
}

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  analogReadResolution(12);                  // 0..4095

  Wire.begin();                              // XIAO default: SDA = D4, SCL = D5
  for (byte a : { (byte)0x3C, (byte)0x3D }) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) { hasOled = oled.begin(SSD1306_SWITCHCAPVCC, a); break; }
  }
  Wire.setClock(400000);

  s.setPeriodHertz(50);
  s.attach(SERVO_PIN, 500, 2400);
  s.write(angle);

  BLEDevice::init("ExoHand");
  BLEServer* srv = BLEDevice::createServer();
  srv->setCallbacks(new ServerCB());
  BLEService* svc = srv->createService(NUS_SERVICE);
  txChar = svc->createCharacteristic(NUS_TX, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());
  BLECharacteristic* rx = svc->createCharacteristic(NUS_RX,
      BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new RxCB());
  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
}

void loop() {
  unsigned long now = millis();

  if (buttonPressed()) onButton();
  while (Serial.available()) command(Serial.read());
  if (bleCmd) { command(bleCmd); bleCmd = 0; }

  long sum = 0;
  for (byte i = 0; i < 8; i++) sum += analogRead(FLEX_PIN);
  flexRaw = sum / 8;

  if (state == OPENING && STOP_WHEN_STRAIGHT && flexPercentOpen() >= 98) { target = angle; state = OPENED; }

  if (angle != target && now - lastStep >= (unsigned long)stepDelayNow()) {
    lastStep = now;
    angle += (target > angle) ? 1 : -1;
    s.write(angle);
  }
  if (angle == target) {
    if (state == OPENING) state = OPENED;
    else if (state == CLOSING) state = CLOSED;
  }

  if (now - lastSend >= 50) {
    lastSend = now;
    char line[24];                             // e.g. "D,2310,150,OPENING\n" (fits one BLE packet)
    int n = snprintf(line, sizeof(line), "D,%d,%d,%s\n", flexRaw, angle, NAMES[state]);
    Serial.print(line);
    if (bleConnected && txChar) { txChar->setValue((uint8_t*)line, n); txChar->notify(); }
  }
  if (hasOled && now - lastScreen >= 150) { lastScreen = now; drawScreen(); }
}
