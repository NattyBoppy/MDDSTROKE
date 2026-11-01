/*
  multi_flex_devkit  -  ESP32-S3 DevKit + up to 5 flex sensors -> website v2 (USB and Bluetooth)
  ---------------------------------------------------------------------------------------------
  NO MOTOR in this sketch. It only reads the flex sensors and sends them to the website.
  The website's Open / Close / STOP buttons (o / c / s) are received and ignored.

  WIRING (the same for every finger; 3.3 V only, NEVER 5 V on an ESP32 pin)
      ESP 3V3  ->  flex sensor  ->  GPIO pin  ->  47k resistor  ->  ESP GND
      Bending the sensor LOWERS the reading. Calibrate on the website (Save straight / Save fully bent).

      finger   GPIO      (ADC1 pins only: ADC2 does not work while Bluetooth is on)
      index     4        <- the first single sensor goes here
      middle    6
      ring      7
      little    8
      thumb     9

  Which sensors are plugged in? Set FITTED below (true = connected). Unfitted ones send -1,
  and the website then moves that finger with its slider or copies the index (a setting on the site).

  ARDUINO IDE SETTINGS
      Board:            "ESP32S3 Dev Module"   (Tools > Board > esp32 > ESP32S3 Dev Module)
      USB CDC On Boot:  "Disabled"             (we use the USB-UART port, see below)
      Flash Size:       "16MB (128Mb)"
      PSRAM:            "OPI PSRAM"
      Plug the USB-C cable into the port labelled "USB-UART" (or "COM"), not "USB".
      Serial Monitor:   115200 baud. You will see lines like   F,-1,2310,-1,-1,-1
      CLOSE the Serial Monitor before pressing "Connect by USB" on the website
      (only one program can use the port at a time).

  WHAT IT SENDS, every 20 ms (50 times a second), over USB AND Bluetooth:
      F,<thumb>,<index>,<middle>,<ring>,<little>      raw 0..4095, -1 = not fitted
  Bluetooth: Nordic UART Service, device name "ExoHand" (Connect by Bluetooth on the website).
*/

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ###########################################################################
// #  WHICH SENSORS ARE CONNECTED?   order: thumb, index, middle, ring, little #
// ###########################################################################
const bool FITTED[5] = { false, true, false, false, false };   // only the index (GPIO 4) for now
const int  PINS[5]   = { 9, 4, 6, 7, 8 };                       // thumb, index, middle, ring, little

const int   SAMPLES   = 8;      // readings averaged each time (removes fast noise)
const float SMOOTHING = 0.3;    // 0..1, lower = smoother but slower
const int   PERIOD_MS = 20;     // send a line every 20 ms

#define NUS_SERVICE "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_RX      "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_TX      "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

float smooth[5];
BLECharacteristic* txChar = nullptr;
volatile bool bleConnected = false;

class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer* srv) { bleConnected = true; }
  void onDisconnect(BLEServer* srv) { bleConnected = false; BLEDevice::startAdvertising(); }   // let the website reconnect
};
class RxCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) { /* o / c / s from the website: ignored, no motor in this sketch */ }
};

int readAveraged(int pin) {
  long sum = 0;
  for (int i = 0; i < SAMPLES; i++) sum += analogRead(pin);
  return sum / SAMPLES;
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);                     // 0..4095
  for (int f = 0; f < 5; f++) {
    if (!FITTED[f]) continue;
    analogSetPinAttenuation(PINS[f], ADC_11db); // full 0..3.3 V range
    smooth[f] = readAveraged(PINS[f]);
  }

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

  Serial.println("# multi_flex_devkit ready (the website ignores this line)");
}

void loop() {
  static unsigned long last = 0;
  while (Serial.available()) Serial.read();     // o / c / s over USB: ignored, no motor here

  if (millis() - last < PERIOD_MS) return;
  last = millis();

  int value[5];
  for (int f = 0; f < 5; f++) {
    if (!FITTED[f]) { value[f] = -1; continue; }
    smooth[f] += (readAveraged(PINS[f]) - smooth[f]) * SMOOTHING;
    value[f] = (int)smooth[f];
  }

  char line[40];                                // e.g. "F,-1,2310,-1,-1,-1\n"
  int n = snprintf(line, sizeof(line), "F,%d,%d,%d,%d,%d\n", value[0], value[1], value[2], value[3], value[4]);
  Serial.write((const uint8_t*)line, n);

  // Bluetooth packets can be as small as 20 bytes, so send the line in 20-byte pieces.
  // The website glues the pieces back together.
  if (bleConnected && txChar) {
    for (int i = 0; i < n; i += 20) {
      int len = min(20, n - i);
      txChar->setValue((uint8_t*)line + i, len);
      txChar->notify();
    }
  }
}
