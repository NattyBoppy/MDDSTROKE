/*
  uno_emg_mg996r_hc05_2nov  -  the 29 Oct working code + HC-05 Bluetooth
  ---------------------------------------------------------------------
  Same as 29 Oct: EMG on A0 -> smoothing -> a "hit" above TRIGGER toggles the hand
  open (servo to 180) / closed (servo to 0). Relax below REARM before the next hit counts.

  NEW: the smoothed EMG value also goes out over Bluetooth (HC-05), at 9600 baud.
    - HC-05 TXD -> D10 (Uno RX for Bluetooth)
    - D11 -> 1k -> HC-05 RXD, with 2k from RXD to GND (the HC-05 pins are 3.3 V)
    - HC-05 VCC -> 5V, GND -> GND
  On the laptop: pair the HC-05 (PIN 1234 or 0000), then in the website set USB speed 9600,
  click Connect by USB and pick the HC-05 port. The Serial plotter shows the EMG live.

  NOT in this version: the D2 emergency stop (see uno_emg_mg996r_estop_1nov), and the
  website's STOP button (nothing is read from Bluetooth). Keep a hand on the power.
  D10 / D11 are the pins the README plans for the microSD module; move the HC-05 before adding SD.

  Board: Arduino Uno. Serial Plotter / website plotter: 9600 baud.
*/
#include <Servo.h>
#include <SoftwareSerial.h>   // BT

SoftwareSerial bt(10, 11);    // BT: RX = D10 (from HC-05 TXD), TX = D11 (to HC-05 RXD via divider)

Servo myServo;
int emgPin = A0;
int emgValue = 0;
float smoothed = 0;

const int TRIGGER = 400;      // hit threshold
const int REARM = 250;        // must drop below this before the next hit counts

bool isFull = false;
bool armed = true;
unsigned long fullTime = 0;
unsigned long moveTime = 0;

void moveServo(int angle) {
  myServo.attach(9);
  myServo.write(angle);
  moveTime = millis();
}

void setup() {
  Serial.begin(9600);
  bt.begin(9600);             // BT
  moveServo(0);
}

void loop() {
  emgValue = analogRead(emgPin);
  smoothed = 0.9 * smoothed + 0.1 * emgValue;

  if (armed && smoothed >= TRIGGER) {
    armed = false;            // a hit is used up
    if (!isFull) {
      moveServo(180);
      isFull = true;
      fullTime = millis();
    } else if (millis() - fullTime >= 1000) {
      moveServo(0);
      isFull = false;
    }
  }

  if (smoothed < REARM) {
    armed = true;             // relaxed enough, ready for next hit
  }

  // Stop sending pulses 0.5 s after a move, so the servo stops jittering
  if (myServo.attached() && millis() - moveTime > 500) {
    myServo.detach();
  }

  Serial.println(smoothed);
  bt.println(smoothed);       // BT
  delay(10);
}
