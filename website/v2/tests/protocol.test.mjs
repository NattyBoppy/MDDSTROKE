// Tests for js/protocol.js. Run from the repo folder with:   node website/v2/tests/protocol.test.mjs
// No install needed (uses Node's built-in test runner).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, LineBuffer, checkCommand } from '../js/protocol.js';

test('D line (v1 format) drives the index finger', () => {
  assert.deepEqual(parseLine('D,1830,0,IDLE'), { type: 'D', raw: 1830, servo: 0, state: 'IDLE' });
  assert.deepEqual(parseLine('D,612,150,OPENING'), { type: 'D', raw: 612, servo: 150, state: 'OPENING' });
  assert.deepEqual(parseLine('D,612,150'), { type: 'D', raw: 612, servo: 150, state: '' });
  assert.equal(parseLine('D,612,150,blocked').state, 'BLOCKED');
  assert.equal(parseLine('  D,612,150,OPEN \r').state, 'OPEN');
});

test('F line: five fingers, -1 means no sensor', () => {
  assert.deepEqual(parseLine('F,-1,2310,-1,-1,-1'), { type: 'F', flex: [null, 2310, null, null, null] });
  assert.deepEqual(parseLine('F,0,4095,1,2,3'), { type: 'F', flex: [0, 4095, 1, 2, 3] });
});

test('M and E lines', () => {
  assert.deepEqual(parseLine('M,90,85,OPEN'), { type: 'M', servo1: 90, servo2: 85, state: 'OPEN' });
  assert.deepEqual(parseLine('E,152.5,40,1'), { type: 'E', extensor: 152.5, flexor: 40, on: true });
  assert.deepEqual(parseLine('E,30,12,0'), { type: 'E', extensor: 30, flexor: 12, on: false });
});

test('garbage and boot messages are ignored (null), never thrown', () => {
  const bad = [
    '', ' ', 'hello', 'ESP-ROM:esp32s3-20210327', 'rst:0x1 (POWERON),boot:0x8 (SPI_FAST_FLASH_BOOT)',
    'entry 0x403c98d4', 'load:0x3fce3808,len:0x44c', 'D,', 'D,abc,0,IDLE', 'D,12', 'D,1,2,3,4,5',
    'D,5000,0,IDLE', 'D,100,0,DANCING', 'F,1,2,3', 'F,1,2,3,4,5,6', 'F,1,2,x,4,5', 'F,-5,1,1,1,1',
    'M,90', 'M,a,b,OPEN', 'E,1,2', 'E,1,2,7', 'E,1,2,yes', 'd,100,0,IDLE', 'X,1,2,3', '\u0000ÿ',
    'D,1e3,0,IDLE', 'F,1.5,2,3,4,5', null, undefined, 42, {},
  ];
  for (const line of bad) assert.equal(parseLine(line), null, `should ignore: ${JSON.stringify(line)}`);
});

test('LineBuffer joins lines split across chunks', () => {
  const got = [];
  const buf = new LineBuffer(l => got.push(l));
  buf.push('F,-1,23');
  buf.push('10,-1,-1,-1\nD,1830');
  buf.push(',0,IDLE\r');
  buf.push('\nM,90,85,OPEN\r\nE,10,2,0\n\n\nhalf');
  assert.deepEqual(got, ['F,-1,2310,-1,-1,-1', 'D,1830,0,IDLE', 'M,90,85,OPEN', 'E,10,2,0']);
  assert.deepEqual(got.map(parseLine).map(p => p.type), ['F', 'D', 'M', 'E']);
  assert.equal(buf.rest, 'half');
});

test('LineBuffer: ESP32 boot noise mixed with data', () => {
  const parsed = [];
  const buf = new LineBuffer(l => { const p = parseLine(l); if (p) parsed.push(p); });
  buf.push('ESP-ROM:esp32s3-20210327\r\nBuild:Mar 27 2021\r\nrst:0x1 (POWERON),boot:0x8\r\n');
  buf.push('ÿþ garbage ### \nD,2000,0,IDLE\n');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].raw, 2000);
});

test('LineBuffer drops a run-away line with no line end', () => {
  const got = [];
  const buf = new LineBuffer(l => got.push(l));
  buf.push('x'.repeat(5000));
  assert.equal(buf.rest, '');
  buf.push('D,1,0,IDLE\n');
  assert.deepEqual(got, ['D,1,0,IDLE']);
});

test('only o, c and s may be sent', () => {
  assert.equal(checkCommand('o'), 'o');
  assert.equal(checkCommand('c'), 'c');
  assert.equal(checkCommand('s'), 's');
  for (const bad of ['90', 'O', 'x', 'o\n', '', 'servo,180']) assert.throws(() => checkCommand(bad));
});
