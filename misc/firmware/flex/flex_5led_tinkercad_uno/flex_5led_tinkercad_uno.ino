/*
  flex_5led_tinkercad_uno  -  Tinkercad version (Arduino Uno): flex sensor -> 5 LED bar graph
  Wiring: 5V -> flex leg 1 | flex leg 2 -> A0 + 20k resistor to GND
          pins 12, 11, 10, 9, 8 -> LED long legs ; LED short legs -> resistor (220 ohm in Tinkercad) -> GND
  Start Simulation, click the flex sensor, drag its slider.
*/
const int FLEX_PIN = A0;
const int LED_PINS[5] = {12, 11, 10, 9, 8};
int flatValue = 0, maxDrop = 0;

void setup() {
  Serial.begin(9600);
  for (int i = 0; i < 5; i++) pinMode(LED_PINS[i], OUTPUT);
  long sum = 0;
  for (int i = 0; i < 50; i++) { sum += analogRead(FLEX_PIN); delay(20); }   // 1 s: learn "flat"
  flatValue = sum / 50;
  Serial.print("Flat = "); Serial.print(flatValue); Serial.println(". Now bend it!");
}

void loop() {
  int value = analogRead(FLEX_PIN);
  int drop = abs(flatValue - value);
  if (drop > maxDrop) maxDrop = drop;
  int range = maxDrop < 5 ? 5 : maxDrop;
  int pct = (long)drop * 100 / range;
  int ledsOn = (pct + 10) / 20;                 // 0..5
  for (int i = 0; i < 5; i++) digitalWrite(LED_PINS[i], i < ledsOn ? HIGH : LOW);
  Serial.print("reading "); Serial.print(value); Serial.print(" | bend "); Serial.print(pct);
  Serial.print("% | LEDs "); Serial.println(ledsOn);
  delay(100);
}
