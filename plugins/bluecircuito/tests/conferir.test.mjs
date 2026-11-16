// Testes da conferência elétrica (sem rede, sem IA): node tests/conferir.test.mjs
import assert from 'node:assert/strict';
import { conferir, pinosNoCodigo, ohm } from '../lib/conferir.mjs';
import { PLACAS, PECAS, acharPinoPlaca, pinosDa } from '../lib/catalogo.mjs';

let ok = 0;
const caso = (nome, fn) => { try { fn(); ok++; } catch (e) { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; } };
const cods = (r, nivel) => r.problemas.filter((p) => !nivel || p.nivel === nivel).map((p) => p.codigo);
const proj = (placa, pecas, ligacoes, extra = {}) => ({ placa, pecas, ligacoes: ligacoes.map(([de, para]) => ({ de, para })), ...extra });

caso('catálogo: toda placa tem GND e alimentação, e todo pino tem nome único', () => {
  for (const [id, p] of Object.entries(PLACAS)) {
    const ps = pinosDa(p), nomes = ps.map((x) => x.nome);
    assert.equal(new Set(nomes).size, nomes.length, id + ': nome de pino repetido ' + nomes.filter((n, i) => nomes.indexOf(n) !== i));
    assert.ok(ps.some((x) => x.tipo === 'gnd'), id + ' sem GND');
    assert.ok(ps.some((x) => x.tipo === '3v3'), id + ' sem 3V3');
    assert.ok(p.i2c && p.spi && p.pio && p.fqbn, id + ' incompleta');
  }
  for (const [id, c] of Object.entries(PECAS)) {
    const nomes = c.pinos.map((x) => x.nome);
    assert.equal(new Set(nomes).size, nomes.length, id + ': pino repetido');
    for (const x of c.pinos.filter((x) => x.papel === 'vcc')) assert.ok(Array.isArray(x.faixa) && x.faixa[0] <= x.faixa[1], id + ' faixa');
    if (c.wokwi) for (const k of Object.keys(c.wokwi.pinos)) assert.ok(nomes.includes(k), `${id}: o pino ${k} do Wokwi não existe na peça`);
  }
});

caso('apelidos de pino', () => {
  assert.equal(acharPinoPlaca('esp32-devkit', 'GPIO4').nome, 'D4');
  assert.equal(acharPinoPlaca('esp32-devkit', '4').nome, 'D4');
  assert.equal(acharPinoPlaca('esp32-devkit', 'VP').gpio, 36);
  assert.equal(acharPinoPlaca('arduino-uno', 'A0').gpio, 14);
  assert.equal(acharPinoPlaca('arduino-uno', '13').nome, 'D13');
  assert.equal(acharPinoPlaca('rpi-pico', 'GPIO15').nome, 'GP15');
  assert.equal(acharPinoPlaca('esp8266-nodemcu', 'D4').gpio, 2);
  assert.equal(acharPinoPlaca('esp32-devkit', 'GND').tipo, 'gnd');
  assert.equal(acharPinoPlaca('esp32-devkit', 'D99'), null);
});

caso('pisca-LED certo não tem erro', () => {
  const r = conferir(proj('esp32-devkit', [{ id: 'led1', tipo: 'led' }, { id: 'r1', tipo: 'resistor', valor: '220Ω' }],
    [['placa:D4', 'r1:1'], ['r1:2', 'led1:A'], ['led1:K', 'placa:GND']], { firmware: { codigo: 'const int LED_PIN = 4;\nvoid setup(){pinMode(LED_PIN, OUTPUT);}' } }));
  assert.deepEqual(cods(r, 'erro'), []);
  assert.deepEqual(cods(r, 'aviso'), []);
  assert.equal(r.pinos.D4.estado, 'usado');
  assert.equal(r.pinos.D5.estado, 'livre');
});

caso('LED sem resistor e LED invertido', () => {
  let r = conferir(proj('esp32-devkit', [{ id: 'led1', tipo: 'led' }], [['placa:D4', 'led1:A'], ['led1:K', 'placa:GND']]));
  assert.ok(cods(r, 'erro').includes('led-resistor'));
  r = conferir(proj('esp32-devkit', [{ id: 'led1', tipo: 'led' }, { id: 'r1', tipo: 'resistor', valor: '220' }], [['placa:D4', 'r1:1'], ['r1:2', 'led1:K'], ['led1:A', 'placa:GND']]));
  assert.ok(cods(r, 'erro').includes('led-invertido'));
});

caso('HC-SR04 no ESP32: 5 V no ECHO queima o pino', () => {
  const r = conferir(proj('esp32-devkit', [{ id: 'us', tipo: 'hc-sr04' }],
    [['us:VCC', 'placa:VIN'], ['us:GND', 'placa:GND'], ['us:TRIG', 'placa:D5'], ['us:ECHO', 'placa:D18']]));
  assert.ok(cods(r, 'erro').includes('nivel'), JSON.stringify(r.problemas));
  // com conversor de nível no meio, passa
  const r2 = conferir(proj('esp32-devkit', [{ id: 'us', tipo: 'hc-sr04' }, { id: 'cn', tipo: 'conversor-nivel' }],
    [['us:VCC', 'placa:VIN'], ['us:GND', 'placa:GND'], ['us:TRIG', 'placa:D5'], ['us:ECHO', 'cn:HV1'], ['cn:LV1', 'placa:D18'], ['cn:HV', 'placa:VIN'], ['cn:LV', 'placa:3V3'], ['cn:GND', 'placa:GND']]));
  assert.ok(!cods(r2, 'erro').includes('nivel'), JSON.stringify(r2.problemas));
  assert.deepEqual(r2.pinos.D18.uso, ['Sensor ultrassônico HC-SR04 ECHO (pelo conversor)']);
  assert.deepEqual(cods(r2, 'erro'), []);
});

caso('HC-SR04 no 3V3 não liga direito', () => {
  const r = conferir(proj('esp32-devkit', [{ id: 'us', tipo: 'hc-sr04' }], [['us:VCC', 'placa:3V3'], ['us:GND', 'placa:GND'], ['us:TRIG', 'placa:D5'], ['us:ECHO', 'placa:D18']]));
  assert.ok(cods(r, 'erro').includes('tensao-baixa'));
});

caso('MPU-6050 e DS3231 no mesmo endereço 0x68', () => {
  const ligI2c = (id) => [[id + ':VCC', 'placa:3V3'], [id + ':GND', 'placa:GND'], [id + ':SDA', 'placa:D21'], [id + ':SCL', 'placa:D22']];
  const r = conferir(proj('esp32-devkit', [{ id: 'imu', tipo: 'mpu6050' }, { id: 'rtc', tipo: 'ds3231' }], [...ligI2c('imu'), ...ligI2c('rtc')]));
  const e = r.problemas.find((p) => p.codigo === 'i2c-endereco');
  assert.ok(e, JSON.stringify(r.problemas));
  assert.match(e.texto, /0x69/);
  const r2 = conferir(proj('esp32-devkit', [{ id: 'imu', tipo: 'mpu6050', endereco: '0x69' }, { id: 'rtc', tipo: 'ds3231' }], [...ligI2c('imu'), ...ligI2c('rtc')]));
  assert.ok(!cods(r2).includes('i2c-endereco'));
  assert.ok(!cods(r2, 'erro').includes('pino-duplo'), 'barramento I2C compartilhado não é pino duplo');
});

caso('ADC2 com Wi-Fi e pino só de entrada', () => {
  const r = conferir(proj('esp32-devkit', [{ id: 'pot', tipo: 'potenciometro' }], [['pot:VCC', 'placa:3V3'], ['pot:GND', 'placa:GND'], ['pot:SIG', 'placa:D25']], { wifi: true }));
  assert.ok(cods(r, 'erro').includes('adc2-wifi'));
  const r2 = conferir(proj('esp32-devkit', [{ id: 'rl', tipo: 'rele' }], [['rl:VCC', 'placa:VIN'], ['rl:GND', 'placa:GND'], ['rl:IN', 'placa:D34']]));
  assert.ok(cods(r2, 'erro').includes('pino-so-entrada'));
});

caso('I2C fora dos pinos fixos do Uno', () => {
  const r = conferir(proj('arduino-uno', [{ id: 'oled', tipo: 'ssd1306' }], [['oled:VCC', 'placa:5V'], ['oled:GND', 'placa:GND'], ['oled:SDA', 'placa:D2'], ['oled:SCL', 'placa:D3']]));
  assert.ok(cods(r, 'erro').includes('i2c-pino'));
  const r2 = conferir(proj('arduino-uno', [{ id: 'oled', tipo: 'ssd1306' }], [['oled:VCC', 'placa:5V'], ['oled:GND', 'placa:GND'], ['oled:SDA', 'placa:A4'], ['oled:SCL', 'placa:A5']]));
  assert.deepEqual(cods(r2, 'erro'), []);
});

caso('RC522 no Uno: 5 V nos sinais de um chip de 3,3 V', () => {
  const r = conferir(proj('arduino-uno', [{ id: 'rf', tipo: 'rc522' }], [['rf:3.3V', 'placa:3.3V'], ['rf:GND', 'placa:GND'], ['rf:RST', 'placa:D9'], ['rf:SDA', 'placa:D10'], ['rf:MOSI', 'placa:D11'], ['rf:MISO', 'placa:D12'], ['rf:SCK', 'placa:D13']]));
  assert.ok(cods(r, 'erro').includes('nivel-5v'));
});

caso('servo na placa avisa; motor DC direto no pino é erro; GND separado é erro', () => {
  const r = conferir(proj('esp32-devkit', [{ id: 'sv', tipo: 'servo' }], [['sv:V+', 'placa:VIN'], ['sv:GND', 'placa:GND'], ['sv:PWM', 'placa:D13']]));
  assert.ok(cods(r, 'aviso').includes('motor-placa'));
  const r2 = conferir(proj('esp32-devkit', [{ id: 'm', tipo: 'motor-dc' }], [['m:M+', 'placa:D13'], ['m:M-', 'placa:GND']]));
  assert.ok(cods(r2, 'erro').includes('motor-driver'));
  const r3 = conferir(proj('esp32-devkit', [{ id: 'sv', tipo: 'servo' }, { id: 'f', tipo: 'fonte-5v' }], [['sv:V+', 'f:+5V'], ['sv:GND', 'f:GND'], ['sv:PWM', 'placa:D13']]));
  assert.ok(cods(r3, 'erro').includes('gnd-comum'));
  const r4 = conferir(proj('esp32-devkit', [{ id: 'sv', tipo: 'servo' }, { id: 'f', tipo: 'fonte-5v' }], [['sv:V+', 'f:+5V'], ['sv:GND', 'f:GND'], ['f:GND', 'placa:GND'], ['sv:PWM', 'placa:D13']]));
  assert.deepEqual(cods(r4, 'erro'), []);
});

caso('fita de LED: consumo passa do USB', () => {
  const r = conferir(proj('esp32-devkit', [{ id: 'fita', tipo: 'fita-ws2812b', leds: 60 }], [['fita:5V', 'placa:VIN'], ['fita:GND', 'placa:GND'], ['fita:DIN', 'placa:D16']]));
  assert.ok(cods(r, 'erro').includes('consumo'));
});

caso('curto, pino sem ligação, pino desconhecido e DS18B20 sem pull-up', () => {
  let r = conferir(proj('esp32-devkit', [], [['placa:3V3', 'placa:GND']]));
  assert.ok(cods(r, 'erro').includes('curto'));
  r = conferir(proj('esp32-devkit', [{ id: 't', tipo: 'ds18b20' }], [['t:VCC', 'placa:3V3'], ['t:GND', 'placa:GND'], ['t:DQ', 'placa:D4'], ['t:XX', 'placa:D5']]));
  assert.ok(cods(r, 'erro').includes('pullup'));
  assert.ok(cods(r, 'erro').includes('ponto'));
  r = conferir(proj('esp32-devkit', [{ id: 'd', tipo: 'dht22' }], [['d:VCC', 'placa:3V3']]));
  assert.ok(cods(r, 'erro').includes('sem-ligacao'));
  r = conferir(proj('esp32-devkit', [{ id: 'a', tipo: 'pir' }, { id: 'b', tipo: 'pir' }], [['a:VCC', 'placa:VIN'], ['b:VCC', 'placa:VIN'], ['a:GND', 'placa:GND'], ['b:GND', 'placa:GND'], ['a:OUT', 'placa:D4'], ['b:OUT', 'placa:D4']]));
  assert.ok(cods(r, 'erro').includes('pino-duplo'));
});

caso('código usando outro pino', () => {
  const r = conferir(proj('esp32-devkit', [{ id: 'rl', tipo: 'rele' }], [['rl:VCC', 'placa:VIN'], ['rl:GND', 'placa:GND'], ['rl:IN', 'placa:D26']], { firmware: { codigo: '#define RELE_PIN 27\nvoid setup(){ pinMode(RELE_PIN, OUTPUT); }' } }));
  assert.equal(cods(r, 'aviso').filter((c) => c === 'codigo-pino').length, 2);
});

caso('pinos no código: Arduino, MicroPython, ESPHome, sem falso positivo', () => {
  const p = PLACAS['esp32-devkit'];
  assert.deepEqual([...pinosNoCodigo('#define NUM_LEDS 8\n#define LED_PIN 5\nlcd.begin(16, 2);\nDHT dht(4, DHT22);\nWire.begin(21, 22);', p)].sort((a, b) => a - b), [4, 5, 21, 22]);
  assert.deepEqual([...pinosNoCodigo('from machine import Pin, I2C\nled = Pin(2, Pin.OUT)\ni2c = I2C(0, scl=Pin(22), sda=Pin(21))', p, 'micropython')].sort((a, b) => a - b), [2, 21, 22]);
  assert.deepEqual([...pinosNoCodigo('switch:\n  - platform: gpio\n    pin: GPIO26\nsensor:\n  - platform: dht\n    pin: 4', p, 'esphome')].sort((a, b) => a - b), [4, 26]);
  assert.deepEqual([...pinosNoCodigo('pinMode(A0, INPUT); digitalWrite(13, HIGH);', PLACAS['arduino-uno'])].sort((a, b) => a - b), [13, 14]);
});

caso('ohm', () => {
  assert.equal(ohm('220Ω'), 220); assert.equal(ohm('4,7k'), 4700); assert.equal(ohm('10 kΩ'), 10000); assert.equal(ohm('x'), null);
});

caso('placa desconhecida', () => {
  const r = conferir({ placa: 'esp99', pecas: [], ligacoes: [] });
  assert.deepEqual(cods(r), ['placa']);
});

console.log(`${ok} casos passaram.`);
