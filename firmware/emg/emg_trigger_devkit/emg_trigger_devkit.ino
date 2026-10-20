/*
  emg_trigger_devkit  -  ESP32-S3 DevKit (N16R8) version
  -------------------------------------------------------------------------------
  One EMG channel, cleaner signal + automatic "muscle ON" detector.
  Works with the DFRobot heart sensor now, and the red EMG board later.

  WIRING (3 wires, no breadboard needed)
    DFRobot red  (+)      -> DevKit pin "3V3"   (bottom row, first pin)
    DFRobot black(-)      -> DevKit pin "GND"   (any GND)
    DFRobot blue (signal) -> DevKit pin "1"     (top row, 4th pin: GND, TX, RX, 1)
    Nothing on the 5V pin.

  ARDUINO IDE SETTINGS
    Tools > Board: "ESP32S3 Dev Module"
    Tools > Flash Size: "16MB (128Mb)"     Tools > PSRAM: "OPI PSRAM"
    Plug the USB-C marked "USB-UART" (or "COM") into the laptop, pick its COM port.

  What is new vs the first test:
   1. Mains-hum remover: Singapore's 50 Hz electrical hum repeats every 20 ms, so the code
      subtracts the reading from exactly 20 ms ago. Hum cancels, muscle signal stays.
   2. Rest calibration: for the first 5 seconds after start (or whenever you type r + Send in
      the Serial Monitor) KEEP THE ARM RELAXED. The code learns your resting level.
   3. Threshold line + ON line in the Serial Plotter:
        EMG        = muscle activity
        threshold  = resting level + safety margin (auto)
        ON         = jumps up while the muscle is ON for at least 0.2 s  -> this is the future
                     "open the hand" trigger for the motor

  Serial Plotter at 115200. Arm still, relaxed for the first 5 s.
*/

const int   EMG_PIN = 1;
const float MARGIN  = 3.0;        // threshold = rest average + MARGIN x rest wobble. Lower = more sensitive.
const int   HOLD_MS = 200;        // must stay above threshold this long to count as ON

const int HUM = 20;               // 20 samples at 1 kHz = one 50 Hz cycle
int  ring[HUM]; int ri = 0;
float env = 0;                     // smoothed muscle activity
float restMean = 0, restVar = 0; long restN = 0;
bool  calibrating = true; unsigned long calStart = 0;
float threshold = 1e9;
unsigned long aboveSince = 0; bool on = false;
unsigned long nextSample = 0, lastPrint = 0;

void startCalibration() {
  calibrating = true; calStart = millis(); restMean = 0; restVar = 0; restN = 0;
  Serial.println("Calibrating: keep the arm RELAXED for 5 seconds...");
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  int a = analogRead(EMG_PIN);
  for (int i = 0; i < HUM; i++) ring[i] = a;
  delay(1500);
  startCalibration();
}

void loop() {
  if (Serial.available()) { char c = Serial.read(); if (c == 'r' || c == 'R') startCalibration(); }

  unsigned long now = micros();
  if ((long)(now - nextSample) < 0) return;
  nextSample = now + 1000;                       // 1000 samples per second

  int a = analogRead(EMG_PIN);
  int comb = a - ring[ri];                        // reading now minus reading 20 ms ago: removes hum + slow drift
  ring[ri] = a; ri = (ri + 1) % HUM;
  env += (fabs((float)comb) - env) * 0.01f;       // rectify + smooth (~100 ms)

  unsigned long ms = millis();
  if (calibrating) {                               // learn the resting level (Welford running mean/variance)
    restN++; float d = env - restMean; restMean += d / restN; restVar += d * (env - restMean);
    if (ms - calStart > 5000) {
      float sd = sqrt(restVar / max(1L, restN - 1));
      threshold = restMean + MARGIN * max(sd, restMean * 0.15f);
      calibrating = false;
      Serial.print("Rest level "); Serial.print(restMean, 1);
      Serial.print("  wobble "); Serial.print(sd, 1);
      Serial.print("  -> threshold "); Serial.println(threshold, 1);
    }
  } else {
    if (env > threshold) { if (!aboveSince) aboveSince = ms; if (ms - aboveSince >= (unsigned long)HOLD_MS) on = true; }
    else { aboveSince = 0; on = false; }
  }

  if (ms - lastPrint >= 20) {                      // 50 points per second
    lastPrint = ms;
    Serial.print("EMG:"); Serial.print(env, 1);
    if (!calibrating) {
      Serial.print(" threshold:"); Serial.print(threshold, 1);
      Serial.print(" ON:"); Serial.print(on ? threshold * 1.5 : 0, 1);
    }
    Serial.println();
  }
}
