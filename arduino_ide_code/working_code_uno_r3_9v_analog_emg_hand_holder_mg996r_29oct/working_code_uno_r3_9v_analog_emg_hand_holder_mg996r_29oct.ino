#include <Servo.h>

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
  moveServo(0);
}

void loop() {
  emgValue = analogRead(emgPin);
  smoothed = 0.9 * smoothed + 0.1 * emgValue;

  if (armed && smoothed >= TRIGGER) {
    armed = false;                          // a hit is used up
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
    armed = true;                           // relaxed enough, ready for next hit
  }

  // Stop sending pulses 0.5 s after a move, so the servo stops jittering
  if (myServo.attached() && millis() - moveTime > 500) {
    myServo.detach();
  }

  Serial.println(smoothed);
  delay(10);
}
