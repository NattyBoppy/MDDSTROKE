/*
  sts3215_knob_test  -  ESP32-S3 + FE-URT-2 board + Feetech STS3215 + potentiometer (knob)
  -----------------------------------------------------------------------------------------
  !!! DO NOT WIRE THE ESP32 TO THE URT-2 YET !!!
  First test the servo with the Feetech FD software on the laptop (see chat), and send a
  photo of the URT-2 header labels. The ESP32 pins are 3.3 V only; we must confirm the
  URT-2 header is 3.3 V-safe before connecting it.

  What it does once wired:
    - knob -> servo position (inside a SAFE range)
    - servo FORCE capped at TORQUE_LIMIT (the STS3215 can do this itself)
    - prints the servo's real position and its LOAD (how hard it is pushing):
      LOAD is your future "patient is resisting -> stop" signal.

  ##########################################################################################
  ##  SAFETY: TORQUE_LIMIT starts at 300 (= 30% of full force) and the range is narrow.   ##
  ##  Raise them in small steps while watching the finger.                                ##
  ##########################################################################################

  WIRING (after we confirm the URT-2 header)
    URT-2 power terminal (TTL-Bus side) G / V1 <- bench supply ADJUSTABLE output 6.0 V, limit 2 A
    URT-2 mode switch -> TTL
    Servo -> URT-2 TTL-bus 3-pin port
    ESP32 GPIO 17 (TX) -> URT-2 header RX     (if nothing answers, swap these two wires)
    ESP32 GPIO 18 (RX) <- URT-2 header TX
    ESP32 GND          -> URT-2 header GND
    Knob: left leg -> 3V3, right leg -> GND, middle -> GPIO 1

  Library: Feetech "FTServo_Arduino" (contains SCServo.h). Download the zip, then
           Sketch > Include Library > Add .ZIP Library.
  Board: "ESP32S3 Dev Module". Serial Monitor 115200.
*/
#include <SCServo.h>

// ===================== SAFETY SETTINGS =====================
const int  SERVO_ID     = 1;      // factory default is 1 (change the 2nd servo to 2 in FD)
const int  POS_MIN      = 1700;   // position range 0..4095 (= 0..360 deg). 2048 = middle.
const int  POS_MAX      = 2400;   // narrow on purpose (~60 deg). Widen in steps of ~100.
const int  TORQUE_LIMIT = 300;    // 0..1000 (1000 = full force). Start at 300 = 30%.
const int  SPEED        = 800;    // steps per second (lower = gentler)
const int  ACCEL        = 30;     // 0..254 (lower = softer start)
// ===========================================================

const int KNOB_PIN = 1, BUS_TX = 17, BUS_RX = 18;
SMS_STS st;
float knobSmooth = 0;
int lastTarget = -1;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  Serial1.begin(1000000, SERIAL_8N1, BUS_RX, BUS_TX);   // STS servos talk at 1,000,000 baud
  st.pSerial = &Serial1;
  delay(500);
  if (st.Ping(SERVO_ID) == -1) Serial.println("Servo NOT found: check power, TTL switch, and swap TX/RX wires.");
  else                         Serial.println("Servo found.");
  st.writeWord(SERVO_ID, 48, TORQUE_LIMIT);                // address 48 = torque limit (RAM)
  st.EnableTorque(SERVO_ID, 1);
  knobSmooth = analogRead(KNOB_PIN);
}

void loop() {
  knobSmooth = knobSmooth * 0.85 + analogRead(KNOB_PIN) * 0.15;
  int target = constrain(map((int)knobSmooth, 0, 4095, POS_MIN, POS_MAX), POS_MIN, POS_MAX);
  if (abs(target - lastTarget) > 8) {                      // only send when the knob really moved
    st.WritePosEx(SERVO_ID, target, SPEED, ACCEL);
    lastTarget = target;
  }

  static unsigned long lastPrint = 0;
  if (millis() - lastPrint > 200) {
    lastPrint = millis();
    int pos  = st.ReadPos(SERVO_ID);
    int load = st.ReadLoad(SERVO_ID);                       // + / - = direction, bigger = pushing harder
    Serial.print("target "); Serial.print(target);
    Serial.print("   real position "); Serial.print(pos);
    Serial.print("   load "); Serial.println(load);
  }
  delay(20);
}
