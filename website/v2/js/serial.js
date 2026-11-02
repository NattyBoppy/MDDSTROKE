/*
  serial.js: "Connect by USB" and "Connect HC-05" using Web Serial (Chrome / Edge on a laptop only).
  ---------------------------------------------------------------------------
  Opens the board's USB port (115200 baud unless told otherwise), hands every chunk of text to onText(),
  and can send single command characters back (o / c / s, checked in protocol.js).

  HC-05 (classic Bluetooth, on the Uno): once paired, the computer treats it as one more serial port
  (Mac: "cu.HC-05", Windows: a "Standard Serial over Bluetooth link" COM port), so the same code opens it.
  We also ask Chrome to list Bluetooth serial devices (the SPP service), in case it has no port yet.
*/
import { checkCommand } from './protocol.js';

export const usbSupported = () => typeof navigator !== 'undefined' && 'serial' in navigator;

// Bluetooth "Serial Port Profile": the service every HC-05 offers.
export const SPP_SERVICE = '00001101-0000-1000-8000-00805f9b34fb';
export const HC05_BAUD = 9600;   // the HC-05's factory speed, and bt.begin(9600) in the 2 Nov sketch
// On a Mac the HC-05's Bluetooth link can drop while the port still looks open, and Chrome is never told.
// So for the HC-05 only: no text for this long = the link is gone, close the port and open it again
// (the Arduino IDE's monitor does the same). The 2 Nov sketch prints about 50 lines a second.
const HC05_QUIET_MS = 3500;
const HC05_RETRY_MS = 2000;      // wait between reconnect tries

export class SerialConnection {
  constructor({ onText, onClose, onStatus = () => {}, baudRate = 115200, bluetooth = false }) {
    this.kind = bluetooth ? 'hc05' : 'usb';
    this.bluetooth = bluetooth;  // true = the port is an HC-05 Bluetooth link, not a cable
    this.baudRate = baudRate;  // must match Serial.begin(...) in the sketch
    this.onText = onText;      // called with each chunk of text from the board
    this.onClose = onClose;    // called once, with a message, when the link ends
    this.onStatus = onStatus;  // HC-05 only: called with (message, kind) while it reconnects
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.closing = false;
    this.reopening = false;    // HC-05 only: true while we close and reopen the port
    this.drops = 0;            // HC-05 only: how many times the link dropped this session
    this.lastDataAt = 0;
    this.watchdog = null;
  }

  // Asks the user to pick a port, then opens it. Throws an Error with a friendly message.
  async open() {
    if (!usbSupported()) {
      throw new Error(this.bluetooth
        ? 'The HC-05 needs Chrome or Edge on a laptop. Safari, Firefox and phones cannot open it.'
        : 'USB needs Chrome or Edge on a laptop. Safari, Firefox and phones cannot open USB ports.');
    }
    try {
      this.port = await navigator.serial.requestPort(this.bluetooth ? { allowedBluetoothServiceClassIds: [SPP_SERVICE] } : {});
    } catch {
      throw new Error(this.bluetooth
        ? 'No HC-05 chosen. Pair the HC-05 in your computer\'s Bluetooth settings first (PIN 1234 or 0000), then press Connect HC-05 and pick it (on a Mac: "cu.HC-05").'
        : 'No board chosen. Press Connect by USB and pick the board (often "USB-SERIAL CH343", "CP210x" or "USB JTAG/serial").');
    }
    try {
      await this.port.open({ baudRate: this.baudRate });
    } catch {
      throw new Error(this.bluetooth
        ? 'Could not open the HC-05. Check the Uno has power (the HC-05 LED blinks) and is close by, and close the Arduino Serial Monitor if it is using the HC-05 port. Then try again.'
        : 'That port is busy. Close the Arduino Serial Monitor (only one program can use the port), then try again.');
    }
    this.start();
    if (this.bluetooth) {
      this.watchdog = setInterval(() => {
        if (!this.closing && !this.reopening && performance.now() - this.lastDataAt > HC05_QUIET_MS) this.reopen();
      }, 500);
    }
  }

  start() {
    // one writer for the whole connection: commands queue up in order, so STOP never clashes with Open
    this.writer = this.port.writable.getWriter();
    this.lastDataAt = performance.now();
    this.loop = this.readLoop();   // runs in the background until the cable is pulled or we disconnect
  }

  // HC-05 only: the link went quiet or broke. Let go of the port and keep trying to open it again
  // (no pop-up needed: Chrome remembers the port) until it works or the user presses Disconnect.
  async reopen() {
    if (this.reopening || this.closing) return;
    this.reopening = true;
    this.drops++;
    this.onStatus(`HC-05 link dropped (${this.drops}×). Reconnecting… (check the Uno still has power)`, 'warn');
    await this.release();
    while (!this.closing) {
      try {
        await this.port.open({ baudRate: this.baudRate });
        break;
      } catch {
        try { await this.port.close(); } catch { /* not open */ }
        await new Promise(r => setTimeout(r, HC05_RETRY_MS));
      }
    }
    if (this.closing) {            // Disconnect was pressed while we were trying
      try { await this.port.close(); } catch { /* not open */ }
      this.reopening = false;
      return;
    }
    this.reopening = false;          // first, or the new read loop would stop straight away
    this.start();
    this.onStatus(`Reconnected to the HC-05 (the link has dropped ${this.drops}× so far). Waiting for readings…`, 'ok');
  }

  async readLoop() {
    const decoder = new TextDecoder();
    try {
      while (this.port.readable && !this.closing && !this.reopening) {
        this.reader = this.port.readable.getReader();
        try {
          while (true) {
            const { value, done } = await this.reader.read();
            if (done) break;
            if (value) { this.lastDataAt = performance.now(); this.onText(decoder.decode(value, { stream: true })); }
          }
        } catch {
          // a read error: if the port still works we get a fresh stream and carry on,
          // if the cable was pulled port.readable is null and the outer loop ends
          break;
        } finally {
          this.reader.releaseLock();
        }
      }
    } catch { /* ignore */ }
    if (this.closing || this.reopening) return;
    if (this.bluetooth) this.reopen();   // the HC-05 gets reconnected instead of giving up
    else this.finish('USB disconnected. Plug the board back in and press Connect by USB.');
  }

  // Sends one command letter. Only o, c, s get through.
  async send(ch) {
    checkCommand(ch);
    if (!this.writer) {
      if (this.reopening) throw new Error('the HC-05 is reconnecting, so nothing was sent');
      return;
    }
    await this.writer.write(new TextEncoder().encode(ch));
  }

  async close() {
    this.closing = true;
    clearInterval(this.watchdog);
    await this.release();
    this.finish('Disconnected.');
  }

  // Lets go of the reader, the writer and then the port itself.
  async release() {
    try { if (this.reader) await this.reader.cancel(); } catch { /* already gone */ }
    try { await this.loop; } catch { /* ignore */ }          // wait until the reader has let go of the port
    try { if (this.writer) { this.writer.releaseLock(); this.writer = null; } } catch { /* ignore */ }
    try { if (this.port) await this.port.close(); } catch { /* already closed */ }
  }

  finish(msg) {
    clearInterval(this.watchdog);
    if (this.done) return;
    this.done = true;
    this.onClose(msg);
  }
}
