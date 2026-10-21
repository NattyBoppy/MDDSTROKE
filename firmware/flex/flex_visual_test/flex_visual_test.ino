/*
  flex_visual_test  -  see a flex sensor clearly in the Arduino IDE (ESP32-S3 DevKit)
  ----------------------------------------------------------------------------------
  WIRING (voltage divider, 3 jumpers)
      ESP 3V3  ->  flex leg 1
      flex leg 2  ->  ESP GPIO 4   AND   one leg of the fixed resistor
      other leg of the fixed resistor  ->  ESP GND
  (Fixed resistor: use one close to your flex sensor's FLAT value. For an ~11k sensor,
   3 x 47k side by side (= ~16k) is good. Type that value into R_FIXED_KOHM below.)

  HOW TO USE
   1. Board "ESP32S3 Dev Module", USB-C "USB-UART" port, upload.
   2. Keep the sensor FLAT for the first 3 seconds (it learns "flat").
   3. Tools > Serial Plotter, 115200.  One line: bend_% from 0 (flat) to 100 (most bent so far).
      It auto-zooms to YOUR sensor, so even a small change fills the screen.
   4. Want numbers + a text bar instead? Set PLOTTER = false and use the Serial Monitor.
   5. Type r + Send to re-learn "flat".
*/

const int   FLEX_PIN     = 4;
const float R_FIXED_KOHM = 47.0;   // the fixed resistor you used (47.0, or 15.7 for 3 x 47k side by side)
const bool  PLOTTER      = true;   // true = Serial Plotter graph, false = Serial Monitor text bar

float flat_mV = 0;       // voltage when flat (learned at start)
float maxDrop = 0;       // biggest drop seen so far (= most bent)
float level   = 0;       // smoothed voltage

float readMilliVolts() {
  long sum = 0;
  for (int i = 0; i < 16; i++) sum += analogReadMilliVolts(FLEX_PIN);
  return sum / 16.0;
}

void learnFlat() {
  if (!PLOTTER) Serial.println("Keep the sensor FLAT for 3 seconds...");
  float sum = 0; int n = 0;
  unsigned long t0 = millis();
  while (millis() - t0 < 3000) { sum += readMilliVolts(); n++; delay(10); }
  flat_mV = sum / n; level = flat_mV; maxDrop = 0;
  if (!PLOTTER) { Serial.print("Flat = "); Serial.print(flat_mV, 0); Serial.println(" mV. Now bend it!"); }
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  delay(1500);                     // let the USB serial settle
  learnFlat();
}

void loop() {
  if (Serial.available()) { char c = Serial.read(); if (c == 'r' || c == 'R') learnFlat(); }

  level += (readMilliVolts() - level) * 0.3f;          // light smoothing
  float drop = flat_mV - level;                        // bending makes the voltage DROP
  if (drop < 0) drop = -drop;                          // works even if your sensor goes the other way
  if (drop > maxDrop) maxDrop = drop;
  float range = maxDrop < 30 ? 30 : maxDrop;           // ignore tiny noise (< 30 mV) when nothing is bent yet
  float pct = drop / range * 100.0f;
  if (pct > 100) pct = 100;

  if (PLOTTER) {
    // fixed guide lines at 0 and 100 keep the graph steady
    Serial.print("bend_%:"); Serial.print(pct, 0);
    Serial.println(",flat:0,most_bent:100");
  } else {
    float r_kohm = (level > 1) ? R_FIXED_KOHM * (3300.0f / level - 1.0f) : -1;
    Serial.print("pin "); Serial.print(level, 0); Serial.print(" mV | change ");
    Serial.print(drop, 0); Serial.print(" mV | flex ~"); Serial.print(r_kohm, 1);
    Serial.print(" kohm | bend "); Serial.print(pct, 0); Serial.print("% |");
    int bars = (int)(pct / 5);
    for (int i = 0; i < 20; i++) Serial.print(i < bars ? '#' : '.');
    Serial.println("|");
  }
  delay(20);
}
