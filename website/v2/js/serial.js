/*
  serial.js: "Connect by USB" using Web Serial (Chrome / Edge on a laptop only).
  ---------------------------------------------------------------------------
  Opens the board's USB port (115200 baud unless told otherwise), hands every chunk of text to onText(),
  and can send single command characters back (o / c / s, checked in protocol.js).
*/
import { checkCommand } from './protocol.js';

export const usbSupported = () => typeof navigator !== 'undefined' && 'serial' in navigator;

export class SerialConnection {
  constructor({ onText, onClose, baudRate = 115200 }) {
    this.kind = 'usb';
    this.baudRate = baudRate;  // must match Serial.begin(...) in the sketch
    this.onText = onText;      // called with each chunk of text from the board
    this.onClose = onClose;    // called once, with a message, when the link ends
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.closing = false;
  }

  // Asks the user to pick a port, then opens it. Throws an Error with a friendly message.
  async open() {
    if (!usbSupported()) throw new Error('USB needs Chrome or Edge on a laptop. Safari, Firefox and phones cannot open USB ports.');
    try {
      this.port = await navigator.serial.requestPort();
    } catch {
      throw new Error('No board chosen. Press Connect by USB and pick the board (often "USB-SERIAL CH343", "CP210x" or "USB JTAG/serial").');
    }
    try {
      await this.port.open({ baudRate: this.baudRate });
    } catch {
      throw new Error('That port is busy. Close the Arduino Serial Monitor (only one program can use the port), then try again.');
    }
    // one writer for the whole connection: commands queue up in order, so STOP never clashes with Open
    this.writer = this.port.writable.getWriter();
    this.loop = this.readLoop();   // runs in the background until the cable is pulled or we disconnect
  }

  async readLoop() {
    const decoder = new TextDecoder();
    try {
      while (this.port.readable && !this.closing) {
        this.reader = this.port.readable.getReader();
        try {
          while (true) {
            const { value, done } = await this.reader.read();
            if (done) break;
            if (value) this.onText(decoder.decode(value, { stream: true }));
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
    if (!this.closing) this.finish('USB disconnected. Plug the board back in and press Connect by USB.');
  }

  // Sends one command letter. Only o, c, s get through.
  async send(ch) {
    checkCommand(ch);
    if (!this.writer) return;
    await this.writer.write(new TextEncoder().encode(ch));
  }

  async close() {
    this.closing = true;
    try { if (this.reader) await this.reader.cancel(); } catch { /* already gone */ }
    try { await this.loop; } catch { /* ignore */ }          // wait until the reader has let go of the port
    try { if (this.writer) { this.writer.releaseLock(); this.writer = null; } } catch { /* ignore */ }
    try { if (this.port) await this.port.close(); } catch { /* already closed */ }
    this.finish('Disconnected.');
  }

  finish(msg) {
    if (this.done) return;
    this.done = true;
    this.onClose(msg);
  }
}
