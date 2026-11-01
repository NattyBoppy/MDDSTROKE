/*
  emg_step_test  -  the SIMPLEST possible test. One line in the Serial Plotter: pin_mV
  -----------------------------------------------------------------------------------
  Shows the voltage the ESP32 sees on GPIO 1, in millivolts (0 .. ~3300).
  No calibration, no threshold - just the raw number, so we can find faults.

  Board: "ESP32S3 Dev Module", plug into the USB-UART port. Serial Plotter, 115200.

  What you should see:
    green wire touching GND            ->  about 0
    green wire touching ESP 3V3        ->  about 3300   (quick self-test, safe)
    green wire in column Y, relaxed    ->  small, about 10 - 40
    green wire in column Y, wrist back ->  goes UP (about 60+)
*/

const int PIN = 1;
float level = 0;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
}

void loop() {
  long sum = 0;
  for (int i = 0; i < 16; i++) sum += analogReadMilliVolts(PIN);   // average 16 readings
  level += (sum / 16.0 - level) * 0.2;                            // light smoothing
  Serial.print("pin_mV:"); Serial.print(level, 0);
  Serial.println(",zero:0,top_150:150");   // two fixed guide lines so the plotter stays zoomed in on 0..150
  delay(20);                                                      // 50 points per second
}
