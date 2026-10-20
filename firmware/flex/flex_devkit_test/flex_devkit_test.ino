/*
  flex_devkit_test  -  ESP32-S3 DevKit + 1 flex sensor -> Serial Monitor AND the Finger Tracker website (USB)
  -----------------------------------------------------------------------------------------------------------
  No motor, no batteries. Just the flex sensor, one 47k resistor and the DevKit.

  WIRING (3 connections, all on the DevKit's TOP row, left end: 3V3 3V3 RST 4 ...)
    flex leg 1        -> ESP 3V3          (3.3 V, never 5 V)
    flex leg 2        -> ESP GPIO 4
    47k resistor      -> from GPIO 4 to ESP GND  (blue rail, if your ESP GND goes there)

  Board "ESP32S3 Dev Module", USB-C "USB-UART" port, Serial Monitor 115200.
  You will see lines like   D,1830,0,IDLE
     the first number = flex reading (0..4095). Bend the sensor -> the number changes.
  The website reads these same lines: close the Serial Monitor first, then click "Connect by USB" on the site.
*/

const int FLEX_PIN = 4;
float smooth = 0;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  smooth = analogRead(FLEX_PIN);
}

void loop() {
  long sum = 0;
  for (int i = 0; i < 8; i++) sum += analogRead(FLEX_PIN);
  smooth += (sum / 8.0 - smooth) * 0.3;

  while (Serial.available()) Serial.read();          // website buttons (o/c/s) ignored here: no motor yet

  Serial.print("D,"); Serial.print((int)smooth); Serial.println(",0,IDLE");
  delay(20);                                          // 50 readings per second
}
