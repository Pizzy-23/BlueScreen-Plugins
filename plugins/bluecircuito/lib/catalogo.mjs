// Catálogo do BlueCircuito: placas e peças com o que importa para ligar sem queimar nada. A IA só pode usar o que
// está aqui, e a conferência (conferir.mjs) usa estes dados, não a palavra da IA: tensão de cada pino, o que cada
// GPIO aceita, endereço I2C, consumo. Preços são estimativas em reais (loja nacional, 2026), só para ter ideia.

// ---------- placas ----------
// caps de um pino: in, out, adc, adc2 (ADC que para com o Wi-Fi ligado no ESP32), pwm, dac, touch,
// strap (decide o modo de boot), serial (usado pelo USB), evitar (ocupado por algo da placa)
const gp = (nome, gpio, caps, extra = {}) => ({ nome, gpio, caps: caps.split(' ').filter(Boolean), ...extra });
const pw = (nome, tipo, extra = {}) => ({ nome, tipo, ...extra });

const ESP32_ADC2 = new Set([0, 2, 4, 12, 13, 14, 15, 25, 26, 27]);
function esp32(g, nome, extra = '') {
  const c = ['in', 'out', 'pwm'];
  if ([32, 33, 34, 35, 36, 39].includes(g)) c.push('adc');
  if (ESP32_ADC2.has(g)) c.push('adc2');
  if ([34, 35, 36, 39].includes(g)) c.splice(c.indexOf('out'), 1), c.splice(c.indexOf('pwm'), 1);
  if ([25, 26].includes(g)) c.push('dac');
  if ([0, 2, 4, 12, 13, 14, 15, 27, 32, 33].includes(g)) c.push('touch');
  if ([0, 2, 5, 12, 15].includes(g)) c.push('strap');
  if ([1, 3].includes(g)) c.push('serial');
  return gp(nome, g, c.join(' ') + (extra ? ' ' + extra : ''), { wokwi: nome });
}
const NOTAS_ESP32 = {
  0: 'GPIO0 decide o modo de gravação no boot: não pode estar em nível baixo quando a placa liga.',
  2: 'GPIO2 precisa ficar em nível baixo ou solto no boot (e acende o LED azul da placa).',
  5: 'GPIO5 decide o tempo do boot: em nível alto no boot (o padrão).',
  12: 'GPIO12 escolhe a tensão da memória no boot: nível alto aqui impede a placa de ligar.',
  15: 'GPIO15 em nível baixo no boot cala as mensagens de inicialização.',
  1: 'TX0 é a serial do USB: usar aqui atrapalha gravar e o monitor serial.',
  3: 'RX0 é a serial do USB: usar aqui atrapalha gravar e o monitor serial.',
};

export const PLACAS = {
  'esp32-devkit': {
    nome: 'ESP32 DevKit V1 (30 pinos)', mcu: 'ESP32', logica: 3.3, tolerante5v: false, wifi: true, bluetooth: true, preco: 45,
    wokwi: 'wokwi-esp32-devkit-v1', pio: { platform: 'espressif32', board: 'esp32dev' }, fqbn: 'esp32:esp32:esp32',
    corrente: { pino: 20, total: 1200 }, consumo: 240,
    i2c: { sda: 21, scl: 22, livre: true }, spi: { mosi: 23, miso: 19, sck: 18, cs: 5 },
    fontes: { '3V3': { tensao: 3.3, capacidade: 350 }, VIN: { tensao: 5, capacidade: 450, nota: 'VIN tem os 5 V do USB' } },
    notas: NOTAS_ESP32,
    esquerda: [pw('EN', 'reset', { wokwi: 'EN' }), esp32(36, 'VP'), esp32(39, 'VN'), ...[34, 35, 32, 33, 25, 26, 27, 14, 12, 13].map((g) => esp32(g, 'D' + g)), pw('GND', 'gnd', { wokwi: 'GND.2' }), pw('VIN', '5v', { wokwi: 'VIN' })],
    direita: [esp32(23, 'D23'), esp32(22, 'D22'), esp32(1, 'TX0'), esp32(3, 'RX0'), esp32(21, 'D21'), esp32(19, 'D19'), esp32(18, 'D18'), esp32(5, 'D5'), esp32(17, 'TX2'), esp32(16, 'RX2'), esp32(4, 'D4'), esp32(2, 'D2'), esp32(15, 'D15'), pw('GND.1', 'gnd', { wokwi: 'GND.1' }), pw('3V3', '3v3', { wokwi: '3V3' })],
  },
  'esp32-s3': {
    nome: 'ESP32-S3 DevKitC-1', mcu: 'ESP32-S3', logica: 3.3, tolerante5v: false, wifi: true, bluetooth: true, preco: 70,
    wokwi: null, pio: { platform: 'espressif32', board: 'esp32-s3-devkitc-1', flags: ['-DARDUINO_USB_CDC_ON_BOOT=1'] }, fqbn: 'esp32:esp32:esp32s3',
    corrente: { pino: 20, total: 1200 }, consumo: 240,
    i2c: { sda: 8, scl: 9, livre: true }, spi: { mosi: 11, miso: 13, sck: 12, cs: 10 },
    fontes: { '3V3': { tensao: 3.3, capacidade: 400 }, '5V': { tensao: 5, capacidade: 450 } },
    notas: { 0: 'GPIO0 é o botão BOOT: nível baixo no boot entra no modo de gravação.', 3: 'GPIO3 decide a origem do JTAG no boot.', 45: 'GPIO45 escolhe a tensão da memória no boot.', 46: 'GPIO46 decide o modo de boot: deixe em nível baixo.', 19: 'GPIO19 é o D- do USB nativo.', 20: 'GPIO20 é o D+ do USB nativo.', 43: 'TX da serial do USB.', 44: 'RX da serial do USB.', 35: 'Nos módulos com PSRAM octal (N8R8, N16R8), GPIO35 a 37 são da memória.', 36: 'Nos módulos com PSRAM octal, GPIO35 a 37 são da memória.', 37: 'Nos módulos com PSRAM octal, GPIO35 a 37 são da memória.', 48: 'GPIO48 tem o LED RGB da placa.' },
    esquerda: [pw('3V3', '3v3'), pw('RST', 'reset'), ...[4, 5, 6, 7, 15, 16, 17, 18, 8, 3, 46, 9, 10, 11, 12, 13, 14].map((g) => s3(g)), pw('5V', '5v'), pw('GND', 'gnd')],
    direita: [pw('GND.1', 'gnd'), ...[43, 44, 1, 2, 42, 41, 40, 39, 38, 37, 36, 35, 0, 45, 48, 47, 21, 20, 19].map((g) => s3(g)), pw('GND.2', 'gnd')],
  },
  'esp32-c3': {
    nome: 'ESP32-C3 SuperMini', mcu: 'ESP32-C3', logica: 3.3, tolerante5v: false, wifi: true, bluetooth: true, preco: 25,
    wokwi: null, pio: { platform: 'espressif32', board: 'esp32-c3-devkitm-1', flags: ['-DARDUINO_USB_MODE=1', '-DARDUINO_USB_CDC_ON_BOOT=1'] }, fqbn: 'esp32:esp32:esp32c3',
    corrente: { pino: 20, total: 800 }, consumo: 200,
    i2c: { sda: 8, scl: 9, livre: true }, spi: { mosi: 6, miso: 5, sck: 4, cs: 7 },
    fontes: { '3V3': { tensao: 3.3, capacidade: 300 }, '5V': { tensao: 5, capacidade: 450 } },
    notas: { 2: 'GPIO2 decide o modo de boot: precisa estar em nível alto ao ligar.', 8: 'GPIO8 tem o LED da placa e precisa de nível alto no boot.', 9: 'GPIO9 é o botão BOOT: nível baixo ao ligar entra no modo de gravação.', 20: 'RX da serial.', 21: 'TX da serial.' },
    esquerda: [pw('5V', '5v'), pw('GND', 'gnd'), pw('3V3', '3v3'), ...[4, 3, 2, 1, 0].map((g) => c3(g))],
    direita: [...[5, 6, 7, 8, 9, 10, 20, 21].map((g) => c3(g))],
  },
  'esp8266-nodemcu': {
    nome: 'NodeMCU ESP8266 (ESP-12E)', mcu: 'ESP8266', logica: 3.3, tolerante5v: false, wifi: true, bluetooth: false, preco: 30,
    wokwi: null, pio: { platform: 'espressif8266', board: 'nodemcuv2' }, fqbn: 'esp8266:esp8266:nodemcuv2',
    corrente: { pino: 12, total: 600 }, consumo: 170,
    i2c: { sda: 4, scl: 5, livre: true }, spi: { mosi: 13, miso: 12, sck: 14, cs: 15 },
    fontes: { '3V3': { tensao: 3.3, capacidade: 300 }, VIN: { tensao: 5, capacidade: 450 } },
    notas: { 0: 'D3 (GPIO0) em nível baixo no boot entra no modo de gravação.', 2: 'D4 (GPIO2) precisa de nível alto no boot (e tem o LED da placa).', 15: 'D8 (GPIO15) precisa de nível baixo no boot: a placa já tem resistor para isso.', 16: 'D0 (GPIO16) não tem PWM, interrupção nem I2C; serve para acordar do sono profundo.', 1: 'TX é a serial do USB.', 3: 'RX é a serial do USB.' },
    esquerda: [gp('A0', 17, 'in adc', { analogico: true, nota: 'Entrada analógica de 0 a 3,3 V (a placa tem divisor).' }), pw('RSV', 'nc'), pw('RSV.2', 'nc'), gp('SD3', 10, 'evitar'), gp('SD2', 9, 'evitar'), pw('GND', 'gnd'), pw('3V3', '3v3'), pw('EN', 'reset'), pw('RST', 'reset'), pw('GND.2', 'gnd'), pw('VIN', '5v')],
    direita: [gp('D0', 16, 'in out'), gp('D1', 5, 'in out pwm'), gp('D2', 4, 'in out pwm'), gp('D3', 0, 'in out pwm strap'), gp('D4', 2, 'in out pwm strap'), pw('3V3.2', '3v3'), pw('GND.3', 'gnd'), gp('D5', 14, 'in out pwm'), gp('D6', 12, 'in out pwm'), gp('D7', 13, 'in out pwm'), gp('D8', 15, 'in out pwm strap'), gp('RX', 3, 'in out serial'), gp('TX', 1, 'in out serial')],
  },
  'arduino-uno': {
    nome: 'Arduino Uno R3', mcu: 'ATmega328P', logica: 5, tolerante5v: true, wifi: false, bluetooth: false, preco: 70,
    wokwi: 'wokwi-arduino-uno', pio: { platform: 'atmelavr', board: 'uno' }, fqbn: 'arduino:avr:uno',
    corrente: { pino: 20, total: 200 }, consumo: 50,
    i2c: { sda: 18, scl: 19, livre: false }, spi: { mosi: 11, miso: 12, sck: 13, cs: 10 },
    fontes: { '3.3V': { tensao: 3.3, capacidade: 50, nota: 'o pino de 3,3 V do Uno dá só 50 mA' }, '5V': { tensao: 5, capacidade: 400 } },
    notas: { 0: 'D0 é a serial do USB: usar aqui atrapalha gravar e o monitor serial.', 1: 'D1 é a serial do USB: usar aqui atrapalha gravar e o monitor serial.', 13: 'D13 tem o LED da placa.' },
    esquerda: [pw('IOREF', 'nc', { wokwi: 'IOREF' }), pw('RESET', 'reset', { wokwi: 'RESET' }), pw('3.3V', '3v3', { wokwi: '3.3V' }), pw('5V', '5v', { wokwi: '5V' }), pw('GND', 'gnd', { wokwi: 'GND.2' }), pw('GND.2', 'gnd', { wokwi: 'GND.3' }), pw('VIN', 'vin', { wokwi: 'VIN' }),
      ...[0, 1, 2, 3, 4, 5].map((n) => gp('A' + n, 14 + n, 'in out adc' + (n === 4 ? ' sda' : n === 5 ? ' scl' : ''), { wokwi: 'A' + n, alias: ['A' + n] }))],
    direita: [pw('AREF', 'nc', { wokwi: 'AREF' }), pw('GND.3', 'gnd', { wokwi: 'GND.1' }), ...[13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((n) => gp('D' + n, n, 'in out' + ([3, 5, 6, 9, 10, 11].includes(n) ? ' pwm' : '') + ([0, 1].includes(n) ? ' serial' : ''), { wokwi: String(n) }))],
  },
  'arduino-nano': {
    nome: 'Arduino Nano (ATmega328P)', mcu: 'ATmega328P', logica: 5, tolerante5v: true, wifi: false, bluetooth: false, preco: 35,
    wokwi: null, pio: { platform: 'atmelavr', board: 'nanoatmega328new' }, fqbn: 'arduino:avr:nano',
    corrente: { pino: 20, total: 200 }, consumo: 40,
    i2c: { sda: 18, scl: 19, livre: false }, spi: { mosi: 11, miso: 12, sck: 13, cs: 10 },
    fontes: { '3V3': { tensao: 3.3, capacidade: 50, nota: 'o 3,3 V do Nano dá pouco mais de 50 mA' }, '5V': { tensao: 5, capacidade: 400 } },
    notas: { 0: 'D0 é a serial do USB.', 1: 'D1 é a serial do USB.', 13: 'D13 tem o LED da placa.' },
    esquerda: [gp('D13', 13, 'in out'), pw('3V3', '3v3'), pw('AREF', 'nc'), ...[0, 1, 2, 3, 4, 5].map((n) => gp('A' + n, 14 + n, 'in out adc' + (n === 4 ? ' sda' : n === 5 ? ' scl' : ''), { alias: ['A' + n] })),
      gp('A6', 20, 'in adc', { analogico: true, alias: ['A6'], nota: 'A6 e A7 só leem tensão (analogRead): não servem como digitais.' }), gp('A7', 21, 'in adc', { analogico: true, alias: ['A7'], nota: 'A6 e A7 só leem tensão (analogRead): não servem como digitais.' }), pw('5V', '5v'), pw('RST', 'reset'), pw('GND', 'gnd'), pw('VIN', 'vin')],
    direita: [...[12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((n) => gp('D' + n, n, 'in out' + ([3, 5, 6, 9, 10, 11].includes(n) ? ' pwm' : ''))), pw('GND.2', 'gnd'), pw('RST.2', 'reset'), gp('D0', 0, 'in out serial'), gp('D1', 1, 'in out serial')],
  },
  'rpi-pico': {
    nome: 'Raspberry Pi Pico', mcu: 'RP2040', logica: 3.3, tolerante5v: false, wifi: false, bluetooth: false, preco: 40,
    wokwi: 'wokwi-pi-pico', pio: { platform: 'https://github.com/maxgerhardt/platform-raspberrypi.git', board: 'pico', core: 'earlephilhower' }, fqbn: 'rp2040:rp2040:rpipico',
    corrente: { pino: 12, total: 50 }, consumo: 30,
    i2c: { sda: 4, scl: 5, livre: true }, spi: { mosi: 19, miso: 16, sck: 18, cs: 17 },
    fontes: { '3V3': { tensao: 3.3, capacidade: 300 }, VBUS: { tensao: 5, capacidade: 450, nota: 'VBUS tem os 5 V do USB' } },
    notas: { 0: 'GP0 e GP1 são a serial (UART0) padrão.', 1: 'GP0 e GP1 são a serial (UART0) padrão.' },
    esquerda: picoLado([0, 1, 'GND', 2, 3, 4, 5, 'GND', 6, 7, 8, 9, 'GND', 10, 11, 12, 13, 'GND', 14, 15], 1),
    direita: picoLado(['VBUS', 'VSYS', 'GND', '3V3_EN', '3V3', 'ADC_VREF', 28, 'AGND', 27, 26, 'RUN', 22, 'GND', 21, 20, 19, 18, 'GND', 17, 16], 5),
  },
  'rpi-pico-w': null, // preenchida abaixo: igual ao Pico, com Wi-Fi
};
function s3(g) {
  const c = ['in', 'out', 'pwm'];
  if (g >= 1 && g <= 10) c.push('adc');
  if (g >= 11 && g <= 20) c.push('adc2');
  if ([0, 3, 45, 46].includes(g)) c.push('strap');
  if ([19, 20, 43, 44].includes(g)) c.push('serial');
  if ([35, 36, 37].includes(g)) c.push('evitar');
  return gp(String(g), g, c.join(' '), { alias: ['GPIO' + g] });
}
function c3(g) {
  const c = ['in', 'out', 'pwm'];
  if (g <= 4) c.push('adc');
  if (g === 5) c.push('adc2');
  if ([2, 8, 9].includes(g)) c.push('strap');
  if ([20, 21].includes(g)) c.push('serial');
  return gp(String(g), g, c.join(' '), { alias: ['GPIO' + g] });
}
function picoLado(lista, gndBase) {
  let ng = gndBase;
  return lista.map((x) => {
    if (typeof x === 'number') return gp('GP' + x, x, 'in out pwm' + ([26, 27, 28].includes(x) ? ' adc' : ''), { wokwi: 'GP' + x, alias: ['GPIO' + x] });
    if (x === 'AGND') return pw('AGND', 'gnd', { wokwi: 'AGND' });
    if (x === 'GND') return pw('GND' + (ng > 1 ? '.' + ng : ''), 'gnd', { wokwi: 'GND.' + ng++ });
    if (x === '3V3') return pw('3V3', '3v3', { wokwi: '3V3' });
    if (x === 'VBUS') return pw('VBUS', '5v', { wokwi: 'VBUS' });
    if (x === 'VSYS') return pw('VSYS', 'vin', { wokwi: 'VSYS' });
    return pw(x, x === 'RUN' ? 'reset' : 'nc', { wokwi: x });
  });
}
PLACAS['rpi-pico-w'] = { ...PLACAS['rpi-pico'], nome: 'Raspberry Pi Pico W', wifi: true, bluetooth: true, preco: 60, wokwi: 'wokwi-pi-pico-w', pio: { ...PLACAS['rpi-pico'].pio, board: 'rpipicow' }, fqbn: 'rp2040:rp2040:rpipicow', consumo: 120 };

// todos os pinos de uma placa, com o lado
export function pinosDa(placa) {
  const p = typeof placa === 'string' ? PLACAS[placa] : placa;
  if (!p) return [];
  return [...p.esquerda.map((x) => ({ ...x, lado: 'e' })), ...p.direita.map((x) => ({ ...x, lado: 'd' }))];
}
// acha o pino da placa por nome, apelido (GPIO4, D4, 4, A0) ou número de GPIO
export function acharPinoPlaca(placa, nome) {
  const lista = pinosDa(placa), n = String(nome || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!n) return null;
  const igual = (x) => x.nome.toUpperCase() === n || (x.alias || []).some((a) => a.toUpperCase() === n);
  let p = lista.find(igual);
  if (p) return p;
  // GND, 3V3, 5V genéricos: qualquer pino desse tipo
  const tipo = { GND: 'gnd', '3V3': '3v3', '3.3V': '3v3', '5V': '5v', VIN: '5v', VBUS: '5v' }[n];
  if (tipo) return lista.find((x) => x.tipo === tipo) || (tipo === '5v' ? lista.find((x) => x.tipo === 'vin') : null);
  const m = n.match(/^(?:GPIO|GP|IO|D)?(\d{1,2})$/);
  if (m) {
    const g = Number(m[1]);
    // no Arduino "D4" e "4" são o pino digital 4; no ESP "D4" é GPIO4 no DevKit, mas no NodeMCU D4 é o rótulo da placa
    p = lista.find((x) => x.gpio === g && !(x.alias || []).some((a) => /^A\d$/.test(a)));
    if (p) return p;
  }
  return null;
}

// ---------- peças ----------
// papel de um pino: vcc, gnd, in (a placa manda), out (a peça manda), analog (a peça manda uma tensão), io (dos dois
// lados), sda, scl, mosi, miso, sck, cs, passivo (resistor, botão, LED), carga (saída de potência, nunca na placa),
// fonte (entrega tensão), nc (não ligar). vcc tem a faixa [min, max] em volts. nivel: tensão fixa do sinal de saída.
const P = (nome, papel, extra = {}) => ({ nome, papel, ...extra });
const VCC = (min, max, nome = 'VCC') => P(nome, 'vcc', { faixa: [min, max] });
const GND = (nome = 'GND') => P(nome, 'gnd');

export const PECAS = {
  led: { nome: 'LED 5 mm', grupo: 'Saída', preco: 0.5, consumo: 0, wokwi: { tipo: 'wokwi-led', pinos: { A: 'A', K: 'C' } },
    pinos: [P('A', 'passivo', { desc: 'ânodo (perna longa, +)' }), P('K', 'passivo', { desc: 'cátodo (perna curta, −)' })], ledCorrente: 15,
    dica: 'Sempre com um resistor em série (220 Ω a 330 Ω no 3,3 V e no 5 V).' },
  resistor: { nome: 'Resistor', grupo: 'Passivo', preco: 0.2, consumo: 0, wokwi: { tipo: 'wokwi-resistor', pinos: { 1: '1', 2: '2' } },
    pinos: [P('1', 'passivo'), P('2', 'passivo')], valor: true },
  botao: { nome: 'Botão de pressão', grupo: 'Entrada', preco: 0.5, consumo: 0, wokwi: { tipo: 'wokwi-pushbutton', pinos: { 1: '1.l', 2: '2.l' } },
    pinos: [P('1', 'passivo'), P('2', 'passivo')], dica: 'Ligue entre o GPIO e o GND e use INPUT_PULLUP: dispensa resistor.' },
  potenciometro: { nome: 'Potenciômetro 10 kΩ', grupo: 'Entrada', preco: 3, consumo: 1, wokwi: { tipo: 'wokwi-potentiometer', pinos: { VCC: 'VCC', SIG: 'SIG', GND: 'GND' } },
    pinos: [VCC(1.8, 5.5), P('SIG', 'analog'), GND()] },
  ldr: { nome: 'Módulo sensor de luz (LDR)', grupo: 'Sensor', preco: 6, consumo: 5, wokwi: { tipo: 'wokwi-photoresistor-sensor', pinos: { VCC: 'VCC', GND: 'GND', DO: 'DO', AO: 'AO' } },
    pinos: [VCC(3.3, 5), GND(), P('DO', 'out', { opcional: true }), P('AO', 'analog', { opcional: true })], umDe: ['DO', 'AO'] },
  dht11: { nome: 'Sensor DHT11 (módulo)', grupo: 'Sensor', preco: 10, consumo: 3,
    pinos: [VCC(3.3, 5.5), P('DATA', 'io', { pullupNoModulo: true }), GND()], dica: 'Temperatura de 0 a 50 °C, umidade de 20 a 90%; lê no máximo uma vez por segundo.' },
  dht22: { nome: 'Sensor DHT22 / AM2302 (módulo)', grupo: 'Sensor', preco: 25, consumo: 2, wokwi: { tipo: 'wokwi-dht22', pinos: { VCC: 'VCC', DATA: 'SDA', GND: 'GND' } },
    pinos: [VCC(3.3, 6), P('DATA', 'io', { pullupNoModulo: true }), GND()], dica: 'Lê no máximo a cada 2 segundos.' },
  ds18b20: { nome: 'Sonda de temperatura DS18B20', grupo: 'Sensor', preco: 15, consumo: 2, wokwi: { tipo: 'board-ds18b20', pinos: { VCC: 'VCC', DQ: 'DQ', GND: 'GND' } },
    pinos: [VCC(3, 5.5), P('DQ', 'io', { precisaPullup: 4700 }), GND()], dica: 'Precisa de um resistor de 4,7 kΩ entre DQ e VCC.' },
  bme280: { nome: 'Sensor BME280 (temperatura, umidade, pressão)', grupo: 'Sensor', preco: 30, consumo: 1,
    pinos: [VCC(3.3, 5, 'VIN'), GND(), P('SCL', 'scl'), P('SDA', 'sda')], i2c: [0x76, 0x77] },
  bmp280: { nome: 'Sensor BMP280 (pressão e temperatura)', grupo: 'Sensor', preco: 12, consumo: 1,
    pinos: [VCC(3.3, 3.6), GND(), P('SCL', 'scl'), P('SDA', 'sda')], i2c: [0x76, 0x77], dica: 'O módulo roxo comum é só 3,3 V.' },
  mpu6050: { nome: 'Acelerômetro e giroscópio MPU-6050 (GY-521)', grupo: 'Sensor', preco: 18, consumo: 4, wokwi: { tipo: 'wokwi-mpu6050', pinos: { VCC: 'VCC', GND: 'GND', SCL: 'SCL', SDA: 'SDA', INT: 'INT' } },
    pinos: [VCC(3.3, 5), GND(), P('SCL', 'scl'), P('SDA', 'sda'), P('INT', 'out', { opcional: true, nivel: 3.3 })], i2c: [0x68, 0x69], dica: 'AD0 em nível alto muda o endereço para 0x69.' },
  ds3231: { nome: 'Relógio RTC DS3231', grupo: 'Sensor', preco: 20, consumo: 1,
    pinos: [VCC(3.3, 5.5), GND(), P('SCL', 'scl'), P('SDA', 'sda')], i2c: [0x68], dica: 'Também ocupa o endereço 0x57 (memória do módulo).' },
  'hc-sr04': { nome: 'Sensor ultrassônico HC-SR04', grupo: 'Sensor', preco: 10, consumo: 15, wokwi: { tipo: 'wokwi-hc-sr04', pinos: { VCC: 'VCC', TRIG: 'TRIG', ECHO: 'ECHO', GND: 'GND' } },
    pinos: [VCC(4.5, 5.5), P('TRIG', 'in'), P('ECHO', 'out'), GND()], dica: 'O ECHO sai com 5 V: numa placa de 3,3 V use divisor (1 kΩ e 2 kΩ) ou conversor de nível.' },
  pir: { nome: 'Sensor de presença PIR HC-SR501', grupo: 'Sensor', preco: 10, consumo: 1, wokwi: { tipo: 'wokwi-pir-motion-sensor', pinos: { VCC: 'VCC', OUT: 'OUT', GND: 'GND' } },
    pinos: [VCC(4.5, 20), P('OUT', 'out', { nivel: 3.3 }), GND()], dica: 'Leva cerca de 1 minuto para estabilizar depois de ligar. A saída é de 3,3 V.' },
  'umidade-solo': { nome: 'Sensor capacitivo de umidade do solo v1.2', grupo: 'Sensor', preco: 12, consumo: 5,
    pinos: [VCC(3.3, 5.5), GND(), P('AOUT', 'analog', { nivel: 3 })] },
  mq2: { nome: 'Sensor de gás e fumaça MQ-2', grupo: 'Sensor', preco: 12, consumo: 150,
    pinos: [VCC(4.8, 5.2), GND(), P('AO', 'analog', { opcional: true }), P('DO', 'out', { opcional: true })], umDe: ['AO', 'DO'],
    dica: 'O aquecedor gasta uns 150 mA e precisa de 24 a 48 h de uso para a leitura firmar. AO chega a 5 V.' },
  hx711: { nome: 'Célula de carga com HX711', grupo: 'Sensor', preco: 30, consumo: 2, wokwi: { tipo: 'wokwi-hx711', pinos: { VCC: 'VCC', GND: 'GND', DT: 'DT', SCK: 'SCK' } },
    pinos: [VCC(2.6, 5.5), GND(), P('DT', 'out'), P('SCK', 'in')] },
  ina219: { nome: 'Medidor de corrente INA219', grupo: 'Sensor', preco: 18, consumo: 1,
    pinos: [VCC(3, 5.5), GND(), P('SCL', 'scl'), P('SDA', 'sda')], i2c: [0x40, 0x41, 0x44, 0x45] },
  rc522: { nome: 'Leitor RFID RC522', grupo: 'Sensor', preco: 18, consumo: 26,
    pinos: [VCC(3.3, 3.3, '3.3V'), P('RST', 'in'), GND(), P('IRQ', 'out', { opcional: true, nivel: 3.3 }), P('MISO', 'miso', { nivel: 3.3 }), P('MOSI', 'mosi'), P('SCK', 'sck'), P('SDA', 'cs')],
    so33: true, dica: 'Só 3,3 V: no Arduino use o pino 3.3V e de preferência conversor de nível nos sinais.' },
  ssd1306: { nome: 'Display OLED 0,96" SSD1306 (I2C)', grupo: 'Saída', preco: 25, consumo: 20, wokwi: { tipo: 'board-ssd1306', pinos: { GND: 'GND', VCC: 'VCC', SCL: 'SCL', SDA: 'SDA' } },
    pinos: [GND(), VCC(3.3, 5), P('SCL', 'scl'), P('SDA', 'sda')], i2c: [0x3c, 0x3d] },
  'lcd-i2c': { nome: 'Display LCD 16x2 com módulo I2C', grupo: 'Saída', preco: 30, consumo: 30, wokwi: { tipo: 'wokwi-lcd1602', atributos: { pins: 'i2c' }, pinos: { GND: 'GND', VCC: 'VCC', SDA: 'SDA', SCL: 'SCL' } },
    pinos: [GND(), VCC(4.5, 5.5), P('SDA', 'sda'), P('SCL', 'scl')], i2c: [0x27, 0x3f], pullup5v: true,
    dica: 'Ajuste o contraste no trimpot azul atrás. Endereço 0x27 ou 0x3F, conforme o chip.' },
  tm1637: { nome: 'Display 4 dígitos TM1637', grupo: 'Saída', preco: 12, consumo: 30, wokwi: { tipo: 'wokwi-tm1637-7segment', pinos: { CLK: 'CLK', DIO: 'DIO', VCC: 'VCC', GND: 'GND' } },
    pinos: [P('CLK', 'in'), P('DIO', 'io'), VCC(3.3, 5.5), GND()] },
  'buzzer-ativo': { nome: 'Buzzer ativo 5 V', grupo: 'Saída', preco: 3, consumo: 30, wokwi: { tipo: 'wokwi-buzzer', pinos: { '+': '2', '-': '1' } },
    pinos: [P('+', 'in', { corrente: 30 }), P('-', 'gnd')], dica: 'Gasta uns 30 mA direto do pino: fica no limite; com transistor é mais seguro.' },
  'fita-ws2812b': { nome: 'Fita de LED endereçável WS2812B', grupo: 'Saída', preco: 45, consumo: 0, porLed: 60, qtdLeds: 30, wokwi: { tipo: 'wokwi-led-ring', pinos: { '5V': 'VCC', GND: 'GND', DIN: 'DIN' } },
    pinos: [VCC(3.5, 5.3, '5V'), GND(), P('DIN', 'in')], dica: 'Cada LED no branco máximo gasta 60 mA. Resistor de 330 Ω no DIN e capacitor de 1000 µF na alimentação.' },
  rele: { nome: 'Módulo relé 1 canal 5 V', grupo: 'Potência', preco: 10, consumo: 75,
    wokwi: { tipo: 'wokwi-relay-module', pinos: { VCC: 'VCC', GND: 'GND', IN: 'IN', COM: 'COM', NO: 'NO', NC: 'NC' } },
    pinos: [VCC(4.5, 5.5), GND(), P('IN', 'in'), P('COM', 'carga', { opcional: true }), P('NO', 'carga', { opcional: true }), P('NC', 'carga', { opcional: true })],
    dica: 'Muitos módulos ligam com IN em nível baixo. Tomada (127/220 V) mata: caixa fechada, fios presos e nunca mexer ligado.' },
  servo: { nome: 'Micro servo SG90', grupo: 'Motor', preco: 15, consumo: 250, pico: 650, wokwi: { tipo: 'wokwi-servo', pinos: { PWM: 'PWM', 'V+': 'V+', GND: 'GND' } },
    pinos: [P('PWM', 'in'), VCC(4.8, 6, 'V+'), GND()], motor: true, dica: 'Parado gasta pouco, mas no arranque passa de 600 mA: fonte de 5 V própria com o GND junto ao da placa.' },
  'motor-dc': { nome: 'Motor DC 3–6 V com caixa de redução', grupo: 'Motor', preco: 8, consumo: 0, pico: 0,
    pinos: [P('M+', 'carga'), P('M-', 'carga')], motorCarga: 250, dica: 'Nunca direto no GPIO: sempre por um driver (DRV8833, L298N).' },
  drv8833: { nome: 'Driver de motor DRV8833', grupo: 'Potência', preco: 15, consumo: 1,
    pinos: [VCC(2.7, 10.8, 'VM'), GND(), P('IN1', 'in'), P('IN2', 'in'), P('IN3', 'in', { opcional: true }), P('IN4', 'in', { opcional: true }), P('OUT1', 'cargaSaida'), P('OUT2', 'cargaSaida'), P('OUT3', 'cargaSaida', { opcional: true }), P('OUT4', 'cargaSaida', { opcional: true })],
    driver: true, dica: 'Lê sinais de 3,3 V e 5 V. Até 1,5 A por canal.' },
  l298n: { nome: 'Driver de motor L298N', grupo: 'Potência', preco: 25, consumo: 36,
    pinos: [VCC(7, 35, '12V'), GND(), P('5V', 'fonte', { tensao: 5, capacidade: 400, desc: 'saída de 5 V (com o jumper e até 12 V na entrada)' }), P('ENA', 'in', { opcional: true }), P('IN1', 'in'), P('IN2', 'in'), P('IN3', 'in', { opcional: true }), P('IN4', 'in', { opcional: true }), P('ENB', 'in', { opcional: true }), P('OUT1', 'cargaSaida'), P('OUT2', 'cargaSaida'), P('OUT3', 'cargaSaida', { opcional: true }), P('OUT4', 'cargaSaida', { opcional: true })],
    driver: true, dica: 'Perde uns 2 V no caminho até o motor. Para motores pequenos, o DRV8833 é melhor.' },
  'passo-28byj48': { nome: 'Motor de passo 28BYJ-48 com driver ULN2003', grupo: 'Motor', preco: 22, consumo: 240,
    pinos: [VCC(5, 12, 'VCC'), GND(), P('IN1', 'in'), P('IN2', 'in'), P('IN3', 'in'), P('IN4', 'in')], motor: true,
    dica: 'O motor gasta uns 240 mA: fonte de 5 V própria com o GND junto ao da placa.' },
  encoder: { nome: 'Encoder rotativo KY-040', grupo: 'Entrada', preco: 8, consumo: 1, wokwi: { tipo: 'wokwi-ky-040', pinos: { CLK: 'CLK', DT: 'DT', SW: 'SW', '+': 'VCC', GND: 'GND' } },
    pinos: [P('CLK', 'out', { nivelVcc: true }), P('DT', 'out', { nivelVcc: true }), P('SW', 'out', { opcional: true, nivelVcc: true }), VCC(3.3, 5, '+'), GND()] },
  microsd: { nome: 'Módulo cartão microSD (SPI)', grupo: 'Armazenamento', preco: 8, consumo: 80, wokwi: { tipo: 'wokwi-microsd-card', pinos: { CS: 'CS', SCK: 'SCK', MOSI: 'DI', MISO: 'DO', VCC: 'VCC', GND: 'GND' } },
    pinos: [GND(), VCC(4.5, 5.5), P('MISO', 'miso', { nivel: 3.3 }), P('MOSI', 'mosi'), P('SCK', 'sck'), P('CS', 'cs')],
    dica: 'O módulo comum tem regulador e conversor de nível: alimente com 5 V.' },
  'conversor-nivel': { nome: 'Conversor de nível lógico 3,3 V ↔ 5 V (4 canais)', grupo: 'Passivo', preco: 6, consumo: 0, conversor: true,
    dica: 'HV no 5 V, LV no 3,3 V e GND comum; cada canal (HV1↔LV1...) leva um sinal nos dois sentidos, e serve para I2C.',
    pinos: [P('HV', 'vcc', { faixa: [3.3, 5.5] }), P('LV', 'vcc', { faixa: [1.8, 3.6] }), GND(), ...[1, 2, 3, 4].flatMap((n) => [P('HV' + n, 'passivo', { opcional: true, lado: 'hv' }), P('LV' + n, 'passivo', { opcional: true, lado: 'lv' })])] },
  'fonte-5v': { nome: 'Fonte 5 V 2 A', grupo: 'Alimentação', preco: 25, consumo: 0,
    pinos: [P('+5V', 'fonte', { tensao: 5, capacidade: 2000 }), P('GND', 'gnd')] },
  'fonte-12v': { nome: 'Fonte 12 V 2 A', grupo: 'Alimentação', preco: 35, consumo: 0,
    pinos: [P('+12V', 'fonte', { tensao: 12, capacidade: 2000 }), P('GND', 'gnd')] },
  lm2596: { nome: 'Regulador step-down LM2596 (ajustado em 5 V)', grupo: 'Alimentação', preco: 12, consumo: 0,
    pinos: [P('IN+', 'vcc', { faixa: [7, 35] }), P('IN-', 'gnd'), P('OUT+', 'fonte', { tensao: 5, capacidade: 2000 }), P('OUT-', 'gnd')],
    dica: 'Gire o trimpot e confira 5 V no multímetro antes de ligar qualquer coisa na saída.' },
  'bateria-18650': { nome: 'Bateria 18650 com carregador TP4056 e elevador para 5 V', grupo: 'Alimentação', preco: 35, consumo: 0,
    pinos: [P('5V', 'fonte', { tensao: 5, capacidade: 1000 }), P('GND', 'gnd')], dica: 'Use bateria com proteção e nunca deixe carregando sem ninguém por perto.' },
};

// sempre na lista de compras de um protótipo de bancada
export const EXTRAS = [
  { id: 'protoboard', nome: 'Protoboard 830 furos', preco: 15, qtd: 1 },
  { id: 'jumpers', nome: 'Jumpers macho-macho e macho-fêmea (kit)', preco: 15, qtd: 1 },
  { id: 'cabo-usb', nome: 'Cabo USB de dados (não só de carga)', preco: 15, qtd: 1 },
];

export const LINGUAGENS = {
  arduino: { nome: 'Arduino (C++)', arquivo: 'src/main.cpp' },
  micropython: { nome: 'MicroPython', arquivo: 'main.py' },
  esphome: { nome: 'ESPHome (Home Assistant)', arquivo: 'dispositivo.yaml' },
};

// o catálogo em texto curto, para a IA saber exatamente o que pode usar
export function catalogoParaIA() {
  const placas = Object.entries(PLACAS).map(([id, p]) => {
    const sinais = pinosDa(p).filter((x) => x.gpio != null && !x.caps.includes('evitar')).map((x) => x.nome + (x.caps.includes('adc') ? '(adc)' : '') + (x.caps.includes('in') && !x.caps.includes('out') ? '(só entrada)' : '')).join(' ');
    const forca = pinosDa(p).filter((x) => ['3v3', '5v', 'vin', 'gnd'].includes(x.tipo)).map((x) => x.nome).join(' ');
    return `- ${id}: ${p.nome}; lógica ${String(p.logica).replace('.', ',')} V${p.wifi ? ', Wi-Fi' : ''}; I2C padrão SDA=${nomeGpio(p, p.i2c.sda)} SCL=${nomeGpio(p, p.i2c.scl)}${p.i2c.livre ? ' (outros pinos também servem)' : ' (fixo)'}; sinais: ${sinais}; força: ${forca}`;
  }).join('\n');
  const pecas = Object.entries(PECAS).map(([id, c]) => `- ${id}: ${c.nome}; pinos: ${c.pinos.map((x) => x.nome + (x.opcional ? '?' : '')).join(' ')}${c.i2c ? '; I2C ' + c.i2c.map((a) => '0x' + a.toString(16)).join('/') : ''}${c.valor ? '; tem "valor" (ex.: 220Ω)' : ''}${c.qtdLeds ? '; tem "leds" (quantidade)' : ''}`).join('\n');
  return { placas, pecas };
}
export function nomeGpio(placa, gpio) {
  const p = pinosDa(placa).find((x) => x.gpio === gpio);
  return p ? p.nome : String(gpio);
}
