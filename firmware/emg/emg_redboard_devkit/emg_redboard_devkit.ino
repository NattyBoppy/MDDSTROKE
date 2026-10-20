/*
  emg_redboard_devkit  (v3)  -  ESP32-S3 DevKit + red analog EMG board (+VS / GND / -VS) on two 9 V batteries
  ---------------------------------------------------------------------------------------------------------
  The red board outputs a SMOOTH muscle-activity voltage: relaxed -> low, muscle working -> rises.
  It reaches the ESP32 through a 1/3 divider (3 equal resistors), so the code multiplies back by 3.

  v3 changes:
   - prints ONLY numbers (no text) so the Serial Plotter does not get confused / zoomed out
   - shows millivolts (mV) so small changes are easy to see
   - averages 8 readings each time to cut the ESP32's own reading noise

  Board: "ESP32S3 Dev Module", USB-C "USB-UART". Serial Plotter 115200.
  After uploading: CLOSE the plotter and OPEN it again (clears the old messy legend).
  Keep the arm RELAXED for the first 5 seconds (only the EMG_mV line shows during that time).
  Type r + Send to re-learn the resting level.
*/

const int   EMG_PIN    = 1;
const float DIVIDER    = 3.0;     // 3 equal resistors -> ESP32 sees 1/3 of the sensor voltage
const float MARGIN     = 3.0;     // threshold = rest + MARGIN x wobble (lower = more sensitive)
const float MIN_WOBBLE = 10.0;    // mV. Smallest allowed rest wobble -> threshold at least 30 mV above rest
const int   HOLD_MS    = 200;     // must stay above threshold this long to count as ON

float level = 0;                  // smoothed sensor voltage (mV)
float restMean = 0, restVar = 0; long restN = 0;
bool  calibrating = true; unsigned long calStart = 0;
float threshold = 0;
unsigned long aboveSince = 0; bool on = false;
unsigned long nextSample = 0, lastPrint = 0;

float readSensor_mV() {
  long sum = 0;
  for (int i = 0; i < 8; i++) sum += analogReadMilliVolts(EMG_PIN);
  return (sum / 8.0) * DIVIDER;
}

void startCalibration() {
  calibrating = true; calStart = millis(); restMean = 0; restVar = 0; restN = 0;
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetPinAttenuation(EMG_PIN, ADC_0db);   // finer reading of small voltages. Pin is still safe up to 3.3 V.
  level = readSensor_mV();
  delay(1000);
  startCalibration();
}

void loop() {
  if (Serial.available()) { char c = Serial.read(); if (c == 'r' || c == 'R') startCalibration(); }

  unsigned long now = micros();
  if ((long)(now - nextSample) < 0) return;
  nextSample = now + 2000;                       // 500 times per second

  level += (readSensor_mV() - level) * 0.03f;    // smooth (~70 ms)

  unsigned long ms = millis();
  if (calibrating) {
    restN++; float d = level - restMean; restMean += d / restN; restVar += d * (level - restMean);
    if (ms - calStart > 5000) {
      float sd = sqrt(restVar / max(1L, restN - 1));
      threshold = restMean + MARGIN * max(sd, MIN_WOBBLE);
      calibrating = false;
    }
  } else {
    if (level > threshold) { if (!aboveSince) aboveSince = ms; if (ms - aboveSince >= (unsigned long)HOLD_MS) on = true; }
    else { aboveSince = 0; on = false; }
  }

  if (ms - lastPrint >= 20) {                    // 50 points per second
    lastPrint = ms;
    Serial.print("EMG_mV:"); Serial.print(level, 0);
    if (!calibrating) {
      Serial.print(",threshold_mV:"); Serial.print(threshold, 0);
      Serial.print(",ON:"); Serial.print(on ? threshold * 1.3 : restMean * 0.7, 0);
    }
    Serial.println();
  }
}
