/*
  ble.js: "Connect by Bluetooth" using Web Bluetooth.
  ---------------------------------------------------
  Works in Chrome / Edge on a laptop and Chrome on Android. Not on iPhone.
  The board advertises the Nordic UART Service (NUS) with the name "ExoHand":
    TX characteristic (board -> website): notifications with text lines
    RX characteristic (website -> board): we write o / c / s
*/
import { checkCommand } from './protocol.js';

export const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const NUS_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';   // we write here
export const NUS_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';   // board notifies here
export const DEVICE_NAME = 'ExoHand';

export const bleSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;

export class BleConnection {
  constructor({ onText, onClose }) {
    this.kind = 'ble';
    this.onText = onText;
    this.onClose = onClose;
    this.device = null;
    this.rx = null;
    this.closing = false;
    this.queue = Promise.resolve();   // Bluetooth can only do one write at a time, so writes wait in line
  }

  async open() {
    if (!bleSupported()) throw new Error('Bluetooth needs Chrome or Edge on a laptop, or Chrome on Android. iPhone browsers cannot use it.');
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: DEVICE_NAME }],
        optionalServices: [NUS_SERVICE],
      });
    } catch (err) {
      if (err && err.name === 'NotFoundError') throw new Error('No device chosen. Make sure the board is switched on and named ExoHand, then try again.');
      throw new Error('Bluetooth is off or blocked. Turn Bluetooth on in your computer settings and try again.');
    }
    try {
      this.device.addEventListener('gattserverdisconnected', () => {
        if (!this.closing) this.finish('Bluetooth connection lost. Press Connect by Bluetooth to reconnect.');
      });
      const gatt = await this.device.gatt.connect();
      const service = await gatt.getPrimaryService(NUS_SERVICE);
      const tx = await service.getCharacteristic(NUS_TX);
      this.rx = await service.getCharacteristic(NUS_RX);
      const decoder = new TextDecoder();
      tx.addEventListener('characteristicvaluechanged', e => this.onText(decoder.decode(e.target.value, { stream: true })));
      await tx.startNotifications();
    } catch {
      try { this.device.gatt.disconnect(); } catch { /* ignore */ }
      throw new Error('Found ExoHand but could not connect. Turn the board off and on, then try again.');
    }
  }

  get name() { return this.device ? this.device.name : DEVICE_NAME; }

  send(ch) {
    checkCommand(ch);
    if (!this.rx) return Promise.resolve();
    const bytes = new TextEncoder().encode(ch);
    const write = () => (this.rx.writeValueWithoutResponse
      ? this.rx.writeValueWithoutResponse(bytes)      // faster
      : this.rx.writeValue(bytes));                   // older Chrome
    const p = this.queue.then(write);
    this.queue = p.catch(() => {});                   // one failed write must not block the next (e.g. STOP)
    return p;
  }

  async close() {
    this.closing = true;
    try { if (this.device && this.device.gatt.connected) this.device.gatt.disconnect(); } catch { /* ignore */ }
    this.finish('Disconnected.');
  }

  finish(msg) {
    if (this.done) return;
    this.done = true;
    this.onClose(msg);
  }
}
