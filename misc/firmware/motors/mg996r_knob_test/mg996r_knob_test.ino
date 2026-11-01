/*
  mg996r_knob_test  -  ESP32-S3 (N16R8 DevKit) + MG996R servo + potentiometer (knob)
  -----------------------------------------------------------------------------------
  Turn the knob -> the servo follows, in real time, but only inside the SAFE range.
  Use this to find the servo angle where the finger is just STRAIGHT.

  ############################################################################
  ##  SAFETY                                                                ##
  ##  The MG996R is about 5x stronger than the MG90S.                        ##
  ##  SAFE_MIN / SAFE_MAX start NARROW (70..110) on purpose.                 ##
  ##  The knob can never push the servo outside them.                        ##
  ##  Watch the Serial Monitor for the angle. Widen SAFE_MAX 10 at a time.  ##
  ##  Hand on the bench supply OUTPUT button while testing on a finger.     ##
  ############################################################################

  WIRING (NEW breadboard - your Nano board stays untouched)
    ESP32-S3:   plug the USB-C marked "COM" (or "UART") into the laptop
    Knob:       left leg -> ESP32 3V3, right leg -> ESP32 GND, MIDDLE leg -> GPIO 1
    MG996R:     orange (signal) -> GPIO 5
                red   -> breadboard + rail  (bench supply ADJUSTABLE output, 6.0 V, limit 2.5 A)
                brown -> breadboard - rail
    ESP32 GND -> breadboard - rail   (shared ground - REQUIRED)
    ESP32 5V / 3V3 -> NOT connected to the servo rail

  Arduino IDE:
    Board: "ESP32S3 Dev Module"   (Tools > Board > esp32)
    Library: ESP32Servo by Kevin Harrington (Tools > Manage Libraries)
    Serial Monitor: 115200
*/
#include <ESP32Servo.h>

// ===================== SAFETY SETTINGS =====================
const int SAFE_MIN = 70;    // servo angle at one end of the knob
const int SAFE_MAX = 110;   // servo angle at the other end. Widen 10 at a time.
const int MAX_STEP = 2;     // max degrees the servo may move every 20 ms (stops sudden jerks)
// ===========================================================

const int KNOB_PIN  = 1;    // GPIO 1
const int SERVO_PIN = 5;    // GPIO 5

Servo s;
float knobSmooth = 0;
int angle = (SAFE_MIN + SAFE_MAX) / 2;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);                 // knob reads 0..4095
  knobSmooth = analogRead(KNOB_PIN);
  s.setPeriodHertz(50);
  s.attach(SERVO_PIN, 500, 2500);           // MG996R pulse range
  s.write(angle);
  Serial.println("MG996R knob test ready. Turn the knob slowly.");
}

void loop() {
  knobSmooth = knobSmooth * 0.85 + analogRead(KNOB_PIN) * 0.15;      // calm the noise
  int target = map((int)knobSmooth, 0, 4095, SAFE_MIN, SAFE_MAX);
  target = constrain(target, SAFE_MIN, SAFE_MAX);

  if (target > angle) angle += min(MAX_STEP, target - angle);       // move gently towards the knob
  if (target < angle) angle -= min(MAX_STEP, angle - target);
  s.write(angle);

  static unsigned long lastPrint = 0;
  if (millis() - lastPrint > 200) {
    lastPrint = millis();
    Serial.print("knob "); Serial.print((int)knobSmooth);
    Serial.print("   servo angle "); Serial.print(angle);
    Serial.print("   (safe range "); Serial.print(SAFE_MIN); Serial.print("-"); Serial.print(SAFE_MAX); Serial.println(")");
  }
  delay(20);
}
