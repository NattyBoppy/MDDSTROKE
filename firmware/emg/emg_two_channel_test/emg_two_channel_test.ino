/*
  emg_two_channel_test  -  ESP32-S3 + Analog EMG sensor (channel A) + DFRobot heart/ECG sensor (channel B)
  -----------------------------------------------------------------------------------------------------
  Reads both sensors 1000 times a second and draws them in the Arduino SERIAL PLOTTER.
  No motor, no bench supply - sensors only.

  Channel A = Analog EMG sensor   -> on the EXTENSORS (back of forearm)  -> rises when you OPEN your fingers
  Channel B = DFRobot ECG (AD8232)-> on the FLEXORS (palm side)          -> rises when you make a FIST
              (it is a heart sensor, so its muscle signal will be weaker/noisier - that is expected)

  SAFETY: laptop charger UNPLUGGED while the pads are on your skin (run on battery).
          Nothing else (servo, bench supply) connected to this breadboard.

  WIRING
    Analog EMG sensor:  VCC/+ -> ESP32 3V3   GND/- -> ESP32 GND   SIG/OUT -> GPIO 1
    DFRobot ECG:        + (red)  -> ESP32 3V3   - (black) -> ESP32 GND   A (blue/signal) -> GPIO 2
    (If the EMG board's pins say +Vs / -Vs instead of VCC / GND, STOP and send me a photo.)

  Arduino IDE: Board "ESP32S3 Dev Module", USB-C "COM" port.
  Upload, then Tools > Serial Plotter, set 115200.  (Close the Serial Monitor first.)

  What the plotter lines mean:
    A_activity / B_activity : muscle activity (best for most sensors). Flat-ish at rest, jumps when the muscle works.
    A_level                 : smoothed raw value of channel A (use this one if the EMG board already outputs a
                              smooth "envelope" - then A_level itself rises when you contract)
*/

const int PIN_A = 1;          // GPIO 1 - analog EMG sensor
const int PIN_B = 2;          // GPIO 2 - DFRobot ECG sensor
const bool USE_B = false;          // false = only the analog EMG sensor (channel A). Set true when you add the DFRobot sensor.
const bool SHOW_A_LEVEL = false;   // set true only if A_activity looks wrong (A_level is a much bigger number, it squashes the other lines)

float baseA = 2048, baseB = 2048;     // slow average = resting middle of each signal
float actA = 0, actB = 0;             // muscle activity (rectified + smoothed)
float levelA = 0;                     // smoothed raw value of A
unsigned long nextSample = 0, lastPrint = 0;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);           // 0..4095 for 0..3.3 V
  baseA = analogRead(PIN_A); baseB = analogRead(PIN_B); levelA = baseA;
}

void loop() {
  unsigned long now = micros();
  if ((long)(now - nextSample) < 0) return;
  nextSample = now + 1000;            // 1000 samples per second

  int a = analogRead(PIN_A);
  int b = analogRead(PIN_B);

  baseA += (a - baseA) * 0.0005f;     // follows only very slow drift (about 2 s)
  baseB += (b - baseB) * 0.0005f;
  actA  += (fabs(a - baseA) - actA) * 0.02f;   // rectify, then smooth (about 50 ms)
  actB  += (fabs(b - baseB) - actB) * 0.02f;
  levelA += (a - levelA) * 0.02f;

  if (millis() - lastPrint >= 20) {   // 50 points per second to the plotter
    lastPrint = millis();
    Serial.print("A_activity:"); Serial.print((int)actA);
    if (USE_B) { Serial.print(" B_activity:"); Serial.print((int)actB); }
    if (SHOW_A_LEVEL) { Serial.print(" A_level:"); Serial.print((int)levelA); }
    Serial.println();
  }
}
