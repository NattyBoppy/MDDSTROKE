/*
  flex_5led_esp32  -  flex sensor lights up 5 LEDs like a bar graph (ESP32-S3 DevKit)
  ----------------------------------------------------------------------------------
  Flat = 0 LEDs on.  Bend more = more LEDs on (1 .. 5).
  It learns "flat" in the first 3 seconds and auto-scales to YOUR sensor,
  so even a weak sensor lights all 5 LEDs at its biggest bend.

  WIRING (see the diagram)
    ESP 3V3  -> flex leg 1
    ESP 4    -> flex leg 2 ; 20k resistor from flex leg 2 to the - rail
    ESP 10, 11, 12, 13, 14 -> LED 1..5 long leg ; short leg -> resistor -> - rail
    ESP GND  -> - rail
  LED resistors: 10k makes the LEDs DIM (fine in a dim room). 1k or 220-330 ohm is brighter if you get some.
  Board "ESP32S3 Dev Module", USB-UART port. Serial Monitor 115200 also shows the numbers.
  Type r + Send to re-learn "flat".
*/

const int FLEX_PIN = 4;
const int LED_PINS[5] = {10, 11, 12, 13, 14};

float flat_mV = 0, level = 0, maxDrop = 0;

float readMilliVolts() {
  long sum = 0;
  for (int i = 0; i < 16; i++) sum += analogReadMilliVolts(FLEX_PIN);
  return sum / 16.0;
}

void learnFlat() {
  for (int i = 0; i < 5; i++) digitalWrite(LED_PINS[i], HIGH);   // all on = "learning, keep it flat"
  Serial.println("Keep the sensor FLAT for 3 seconds...");
  float sum = 0; int n = 0; unsigned long t0 = millis();
  while (millis() - t0 < 3000) { sum += readMilliVolts(); n++; delay(10); }
  flat_mV = sum / n; level = flat_mV; maxDrop = 0;
  for (int i = 0; i < 5; i++) digitalWrite(LED_PINS[i], LOW);
  Serial.print("Flat = "); Serial.print(flat_mV, 0); Serial.println(" mV. Now bend it!");
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  for (int i = 0; i < 5; i++) pinMode(LED_PINS[i], OUTPUT);
  delay(1000);
  learnFlat();
}

void loop() {
  if (Serial.available()) { char c = Serial.read(); if (c == 'r' || c == 'R') learnFlat(); }

  level += (readMilliVolts() - level) * 0.3f;
  float drop = flat_mV - level; if (drop < 0) drop = -drop;      // works whichever way your sensor goes
  if (drop > maxDrop) maxDrop = drop;
  float range = maxDrop < 30 ? 30 : maxDrop;                     // ignore noise below 30 mV
  int pct = (int)(drop / range * 100); if (pct > 100) pct = 100;
  int ledsOn = (pct + 10) / 20;                                  // 0..5 LEDs

  for (int i = 0; i < 5; i++) digitalWrite(LED_PINS[i], i < ledsOn ? HIGH : LOW);

  Serial.print("pin "); Serial.print(level, 0); Serial.print(" mV | change ");
  Serial.print(drop, 0); Serial.print(" mV | bend "); Serial.print(pct);
  Serial.print("% | LEDs "); Serial.println(ledsOn);
  delay(50);
}
