/*
  Tinkercad version (Arduino Uno) of flex_visual_test
  Wiring:  5V -> flex leg 1 | flex leg 2 -> A0 and resistor | resistor other end -> GND
  Start Simulation, click the flex sensor, drag its slider, watch the Serial Monitor.
  Set GRAPH = true to use Tinkercad's graph button instead of the text bar.
*/
const int  FLEX_PIN = A0;
const bool GRAPH    = false;

int flatValue = 0;
int maxDrop   = 0;

void setup() {
  Serial.begin(9600);
  long sum = 0;
  for (int i = 0; i < 50; i++) { sum += analogRead(FLEX_PIN); delay(20); }   // 1 s: learn "flat"
  flatValue = sum / 50;
  if (!GRAPH) { Serial.print("Flat = "); Serial.print(flatValue); Serial.println(". Now bend it!"); }
}

void loop() {
  int value = analogRead(FLEX_PIN);            // 0..1023
  int drop  = abs(flatValue - value);          // how far from flat
  if (drop > maxDrop) maxDrop = drop;
  int range = maxDrop < 5 ? 5 : maxDrop;       // ignore tiny noise
  int pct   = (long)drop * 100 / range;

  if (GRAPH) {
    Serial.println(pct);                       // 0 = flat, 100 = most bent so far
  } else {
    Serial.print("reading "); Serial.print(value);
    Serial.print(" | change "); Serial.print(drop);
    Serial.print(" | bend "); Serial.print(pct); Serial.print("% |");
    for (int i = 0; i < 20; i++) Serial.print(i < pct / 5 ? '#' : '.');
    Serial.println("|");
  }
  delay(100);
}
