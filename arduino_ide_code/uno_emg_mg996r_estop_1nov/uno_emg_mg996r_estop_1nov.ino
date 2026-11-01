/*
  uno_emg_mg996r_estop_1nov  -  the 29 Oct working code + an EMERGENCY STOP button
  -------------------------------------------------------------------------------
  NOT TESTED ON HARDWARE YET. The 29 Oct code is unchanged in its own folder.

  Same as 29 Oct: EMG on A0 -> smoothing -> a "hit" above TRIGGER toggles the hand
  open (servo to SERVO_WOUND) / closed (servo to SERVO_RELEASED). Relax below REARM
  before the next hit counts.

  NEW: EMERGENCY STOP (wiring: wiring/breadboard_wiring.png)
    - A red latching button (normally-closed contact) sits in the servo's red +5 V wire:
          Uno 5V -> E-STOP -> servo red wire
      Pressing it cuts the servo's power straight away, even if this code is stuck.
    - D2 is connected to the servo side of the button, with a 10k resistor from D2 to GND:
          D2 HIGH = button not pressed (servo has power)
          D2 LOW  = button pressed (servo power cut)
    - Once D2 goes LOW this code STOPS for good: it lets go of the servo and ignores the EMG,
      so the servo can't suddenly move when the button is released.
    - To start again: twist the button to release it, then press the Uno's RESET button.
      On start the servo goes to SERVO_RELEASED (fingers relaxed).

  Board: Arduino Uno. Serial Plotter / website plotter: 9600 baud.
*/
#include <Servo.h>

// ##########################################################################
// #  SAFETY: servo angles. The firmware owns these limits.                  #
// #  Change them only after testing WITHOUT a hand in the holder.           #
// ##########################################################################
const int SERVO_RELEASED = 0;     // spool unwound: line slack, fingers relax into a fist
const int SERVO_WOUND    = 180;   // spool wound in: line taut, fingers straight
// ##########################################################################

const int ESTOP_PIN = 2;          // HIGH = running, LOW = E-STOP pressed

Servo myServo;
int emgPin = A0;
int emgValue = 0;
float smoothed = 0;

const int TRIGGER = 400;      // hit threshold
const int REARM = 250;        // must drop below this before the next hit counts

bool isFull = false;
bool armed = true;
bool stopped = false;         // true after the E-STOP was pressed (until RESET)
unsigned long fullTime = 0;
unsigned long moveTime = 0;

void moveServo(int angle) {
  if (stopped) return;                      // never move after an E-STOP
  myServo.attach(9);
  myServo.write(angle);
  moveTime = millis();
}

void emergencyStop() {
  stopped = true;
  if (myServo.attached()) myServo.detach(); // stop sending pulses
  Serial.println("ESTOP");                  // shows in the Serial Monitor / website monitor
}

void setup() {
  Serial.begin(9600);
  pinMode(ESTOP_PIN, INPUT);                // the 10k resistor pulls it LOW when the button is pressed
  if (digitalRead(ESTOP_PIN) == LOW) emergencyStop();   // pressed already at start-up
  moveServo(SERVO_RELEASED);
}

void loop() {
  if (!stopped && digitalRead(ESTOP_PIN) == LOW) emergencyStop();

  emgValue = analogRead(emgPin);
  smoothed = 0.9 * smoothed + 0.1 * emgValue;

  if (!stopped) {
    if (armed && smoothed >= TRIGGER) {
      armed = false;                          // a hit is used up
      if (!isFull) {
        moveServo(SERVO_WOUND);
        isFull = true;
        fullTime = millis();
      } else if (millis() - fullTime >= 1000) {
        moveServo(SERVO_RELEASED);
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
  }

  Serial.println(smoothed);                   // keeps plotting, even when stopped
  delay(10);
}
