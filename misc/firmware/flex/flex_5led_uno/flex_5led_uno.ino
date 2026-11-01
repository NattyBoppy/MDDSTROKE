/*
  flex_5led_uno  -  REAL Arduino Uno: flex sensor lights 5 LEDs like a bar graph
  ------------------------------------------------------------------------------
  Flat = 0 LEDs. Bend more = more LEDs (1..5). Auto-scales to YOUR sensor.

  WIRING
    Flex sensor:  Uno 5V -> flex leg 1
                  flex leg 2 -> Uno A0
                  20k resistor: flex leg 2 -> GND      (10k also works)
    LEDs:         Uno pins 12, 11, 10, 9, 8 -> resistor -> LED LONG leg
                  LED SHORT leg -> GND rail
                  (10k makes the LEDs dim but visible. 220-330 ohm = bright.)
    Uno GND -> the breadboard's GND (-) rail.

  WHAT HAPPENS
    1. LED check: each LED lights one at a time (pin 12 -> 8). If one stays dark,
       that LED is backwards (flip it) or its wire/resistor is in the wrong row.
    2. All 5 LEDs blink for 2 seconds: keep the sensor FLAT (it learns "flat").
    3. Bend the sensor fully ONCE (sets the scale), then bend slowly and watch.
  Tools > Serial Monitor at 9600 shows the numbers.
    Type r + Send = re-learn FLAT (keep it flat for 2 s)
    Type b + Send = learn BENT  (hold it fully bent for 2 s)  -> fixed scale, no more guessing
  NOISE: changes smaller than this are ignored (stops "bending" when nobody touches it).
  Want a graph? Set GRAPH = true and use Tools > Serial Plotter (9600).
*/

const int  FLEX_PIN = A0;
const int  LED_PINS[5] = {12, 11, 10, 9, 8};
const bool GRAPH = false;
// ZOOM TRICK (makes a weak sensor ~4x more visible):
//   set true AND use ONE 47k as the flex's partner resistor (47k from 5V to the A0 row, flex from the A0 row to GND).
//   The Uno then measures 0..1.1 V instead of 0..5 V. Safe: anything above 1.1 V just reads 1023.
const bool ZOOM_1V1 = true;    // ON: 100k (2 x 50k) from 5V to the A0 row, flex from the A0 row to GND
const int  NOISE = 10;       // raise to 15-25 if LEDs still flicker when nobody touches the sensor
const int  HYST  = 8;        // LED count only changes when the bend moves clearly past a step (stops flicker between 2 and 3)

int flatValue = 0;
int maxDrop   = 0;
int bentDrop  = -1;          // set by typing b (fully bent). -1 = not set yet
float level   = 0;
int shown     = 0;            // LEDs currently shown

void allLeds(bool on) { for (int i = 0; i < 5; i++) digitalWrite(LED_PINS[i], on ? HIGH : LOW); }

void ledCheck() {
  for (int i = 0; i < 5; i++) {
    allLeds(false); digitalWrite(LED_PINS[i], HIGH);
    if (!GRAPH) { Serial.print("LED check: pin "); Serial.println(LED_PINS[i]); }
    delay(400);
  }
  allLeds(false);
}

void learnFlat() {
  if (!GRAPH) Serial.println("Keep the sensor FLAT for 2 seconds...");
  long sum = 0;
  for (int i = 0; i < 100; i++) {
    sum += analogRead(FLEX_PIN);
    allLeds((i / 10) % 2 == 0);          // blink while learning
    delay(20);
  }
  allLeds(false);
  flatValue = sum / 100; level = flatValue; maxDrop = 0; bentDrop = -1;
  if (!GRAPH) { Serial.print("Flat = "); Serial.print(flatValue); Serial.println(". Bend it fully once, then slowly."); }
}

void learnBent() {
  if (!GRAPH) Serial.println("Hold the sensor FULLY BENT for 2 seconds...");
  long sum = 0;
  for (int i = 0; i < 100; i++) { sum += analogRead(FLEX_PIN); allLeds((i / 10) % 2 == 0); delay(20); }
  allLeds(false);
  bentDrop = abs(flatValue - (int)(sum / 100));
  if (!GRAPH) { Serial.print("Bent = "); Serial.print((int)(sum / 100)); Serial.print("  (change "); Serial.print(bentDrop); Serial.println(" from flat)"); }
  if (bentDrop <= NOISE && !GRAPH) Serial.println("WARNING: bent is almost the same as flat. This sensor barely responds.");
}

void setup() {
  Serial.begin(9600);
  if (ZOOM_1V1) { analogReference(INTERNAL); delay(50); analogRead(FLEX_PIN); }   // switch to the 1.1 V scale
  for (int i = 0; i < 5; i++) pinMode(LED_PINS[i], OUTPUT);
  ledCheck();
  learnFlat();
}

void loop() {
  if (Serial.available()) {
    char c = Serial.read();
    if (c == 'r' || c == 'R') learnFlat();
    if (c == 'b' || c == 'B') learnBent();
  }

  long sum = 0;
  for (int i = 0; i < 8; i++) sum += analogRead(FLEX_PIN);   // average 8 readings
  level += (sum / 8.0 - level) * 0.15;                        // smoothing (lower = smoother but slower)

  int drop = abs(flatValue - (int)level);                     // works whichever way your sensor goes
  if (drop <= NOISE) drop = 0;                                // ignore small wobble = "flat"
  if (drop > maxDrop) maxDrop = drop;
  int range;
  if (bentDrop > NOISE) range = bentDrop;                     // scale from your "b" calibration
  else range = maxDrop < 3 * NOISE ? 3 * NOISE : maxDrop;     // otherwise auto-scale, never smaller than 3 x NOISE
  int pct = (long)drop * 100 / range; if (pct > 100) pct = 100;
  // only change the LED count when the bend is clearly past the step (hysteresis)
  if (abs(pct - shown * 20) > 10 + HYST) shown = (pct + 10) / 20;
  int ledsOn = shown;                                         // 0..5 LEDs

  for (int i = 0; i < 5; i++) digitalWrite(LED_PINS[i], i < ledsOn ? HIGH : LOW);

  if (GRAPH) {
    Serial.print("bend_%:"); Serial.print(pct); Serial.println(",flat:0,most_bent:100");
  } else {
    Serial.print("reading "); Serial.print((int)level);
    Serial.print(" | change "); Serial.print(drop);
    Serial.print(" | bend "); Serial.print(pct);
    Serial.print("% | LEDs "); Serial.println(ledsOn);
  }
  delay(50);
}
