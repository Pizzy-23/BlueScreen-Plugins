// Testes do pedido para a IA, da leitura da resposta, da exportação e do desenho (sem rede, sem IA):
// node tests/ia.test.mjs
import assert from 'node:assert/strict';
import { montarPedido, lerResposta, extrairJson, normalizar } from '../lib/ia.mjs';
import { arquivos, wokwi, listaDeCompras, platformioIni, slug } from '../lib/exportar.mjs';
import { layout } from '../lib/desenho.mjs';
import { conferir } from '../lib/conferir.mjs';

let ok = 0;
const caso = (nome, fn) => { try { fn(); ok++; } catch (e) { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; } };

// uma resposta típica de IA: texto antes, JSON num bloco, apelidos e formatos variados
const RESPOSTA = `Claro! Aqui está o projeto:
\`\`\`json
{
  "nome": "Estação de clima",
  "resumo": "Lê temperatura e umidade e mostra no OLED.",
  "mensagem": "Projetei com ESP32 e DHT22.",
  "placa": "ESP32",
  "linguagem": "Arduino",
  "wifi": true,
  "pecas": [
    { "id": "dht1", "tipo": "DHT22", "rotulo": "Temperatura e umidade" },
    { "id": "oled", "tipo": "OLED", "rotulo": "Tela" },
    { "id": "led1", "tipo": "led", "rotulo": "LED verde de status" },
    { "id": "r1", "tipo": "resistor", "valor": "220Ω" }
  ],
  "ligacoes": [
    ["placa:3V3", "dht1:VCC"], ["placa:GND", "dht1:GND"], ["placa:GPIO4", "dht1:DATA"],
    { "from": "placa:3V3", "to": "oled:VCC" }, { "de": "placa:GND", "para": "oled:GND" },
    { "de": "placa:D21", "para": "oled:SDA" }, { "de": "placa:D22", "para": "oled:SCL" },
    { "de": "placa:D2", "para": "r1:1" }, { "de": "r1:2", "para": "led1:A" }, { "de": "led1:K", "para": "placa:GND" },
  ],
  "fluxo": ["Liga e conecta no Wi-Fi", "Lê o sensor", "Mostra no display"],
  "firmware": { "codigo": "#include <DHT.h>\\n#define DHT_PIN 4\\nconst int LED_PIN = 2;\\nDHT dht(DHT_PIN, DHT22);\\nvoid setup(){ pinMode(LED_PIN, OUTPUT); Wire.begin(); }\\nvoid loop(){}", "bibliotecas": ["adafruit/DHT sensor library@^1.4.6", "Wire"] },
  "montagem": ["Encaixe o ESP32 na protoboard"],
  "testes": "Abra o monitor serial"
}
\`\`\`
Qualquer dúvida, é só falar.`;

caso('pedido novo traz catálogo, regras e o pedido', () => {
  const { prompt } = montarPedido({ modo: 'novo', pedido: 'regar o vaso', placa: 'esp32-devkit' });
  assert.match(prompt, /regar o vaso/);
  assert.match(prompt, /esp32-devkit: ESP32 DevKit/);
  assert.match(prompt, /hc-sr04/);
  assert.match(prompt, /Use a placa esp32-devkit/);
  assert.match(prompt, /```json/);
});

caso('pedido de correção leva os problemas e o projeto, sem conversa nem posições', () => {
  const { prompt } = montarPedido({ modo: 'corrigir', projeto: { nome: 'x', placa: 'esp32-devkit', pecas: [], ligacoes: [], conversa: [{ texto: 'segredo da conversa' }], posicoes: { a: 1 } }, problemas: [{ nivel: 'erro', texto: 'LED sem resistor' }] });
  assert.match(prompt, /1\. \[erro\] LED sem resistor/);
  assert.doesNotMatch(prompt, /segredo da conversa/);
  assert.doesNotMatch(prompt, /posicoes/);
});

caso('lê a resposta com apelidos e formatos variados', () => {
  const p = lerResposta(RESPOSTA, {});
  assert.equal(p.placa, 'esp32-devkit');
  assert.equal(p.linguagem, 'arduino');
  assert.deepEqual(p.pecas.map((x) => x.tipo), ['dht22', 'ssd1306', 'led', 'resistor']);
  assert.equal(p.ligacoes.length, 10);
  assert.deepEqual(p.ligacoes[3], { de: 'placa:3V3', para: 'oled:VCC' });
  assert.equal(p.fluxo.length, 3);
  assert.deepEqual(p.fluxo[0].depois, ['f2']);
  assert.deepEqual(p.testes, ['Abra o monitor serial']);
  // e a conferência passa limpa
  const c = conferir(p);
  assert.deepEqual(c.problemas.filter((x) => x.nivel === 'erro').map((x) => x.texto), []);
});

caso('resposta sem JSON vira erro legível; JSON com vírgula sobrando é aceito', () => {
  assert.throws(() => lerResposta('Não consigo ajudar com isso.', {}), /não devolveu o projeto em JSON/);
  assert.deepEqual(extrairJson('{"a": [1, 2,],}'), { a: [1, 2] });
});

caso('alteração parcial mantém o que a IA não mandou', () => {
  const antes = lerResposta(RESPOSTA, {});
  const depois = normalizar({ mensagem: 'Só troquei o nome', nome: 'Clima 2' }, antes);
  assert.equal(depois.nome, 'Clima 2');
  assert.equal(depois.pecas.length, 4);
  assert.equal(depois.firmware.codigo, antes.firmware.codigo);
});

caso('exportação: PlatformIO, Wokwi, LEIA-ME e projeto', () => {
  const p = lerResposta(RESPOSTA, {});
  const a = arquivos(p, conferir(p));
  assert.deepEqual(Object.keys(a).sort(), ['LEIA-ME.md', 'bluecircuito.json', 'diagram.json', 'platformio.ini', 'src/main.cpp', 'wokwi.toml']);
  assert.match(a['platformio.ini'], /board = esp32dev/);
  assert.match(a['platformio.ini'], /adafruit\/DHT sensor library/);
  assert.doesNotMatch(a['platformio.ini'], /^\s+Wire$/m, 'Wire vem com o framework');
  const d = JSON.parse(a['diagram.json']);
  assert.equal(d.parts[0].type, 'wokwi-esp32-devkit-v1');
  assert.ok(d.connections.some((c) => c[0] === 'placa:D4' && c[1] === 'dht1:SDA'), 'DATA do DHT22 vira SDA no Wokwi');
  assert.ok(d.connections.some((c) => c[0] === 'r1:2' && c[1] === 'led1:A'));
  assert.ok(d.connections.some((c) => c[0] === 'led1:C'), 'cátodo K vira C no Wokwi');
  assert.match(a['wokwi.toml'], /\.pio\/build\/esp32_devkit\/firmware\.bin/);
  assert.match(a['LEIA-ME.md'], /## Lista de compras/);
  assert.match(a['LEIA-ME.md'], /sem erros/);
  assert.equal(JSON.parse(a['bluecircuito.json']).placa, 'esp32-devkit');
});

caso('Wokwi: placa sem simulação e peça sem equivalente', () => {
  assert.equal(wokwi({ placa: 'esp8266-nodemcu', pecas: [], ligacoes: [] }).diagrama, null);
  const w = wokwi({ placa: 'arduino-uno', pecas: [{ id: 'rf', tipo: 'rc522' }, { id: 'l', tipo: 'led' }], ligacoes: [{ de: 'placa:D13', para: 'l:A' }, { de: 'rf:RST', para: 'placa:D9' }] });
  assert.deepEqual(w.faltam, ['rf']);
  assert.equal(w.pulados, 1);
  assert.deepEqual(w.diagrama.connections[0].slice(0, 2), ['placa:13', 'l:A']);
});

caso('lista de compras soma e junta repetidas', () => {
  const c = listaDeCompras({ placa: 'esp32-devkit', pecas: [{ id: 'a', tipo: 'led' }, { id: 'b', tipo: 'led' }, { id: 'r1', tipo: 'resistor', valor: '220Ω' }, { id: 'r2', tipo: 'resistor', valor: '4,7kΩ' }] });
  const led = c.itens.find((i) => i.id === 'led');
  assert.equal(led.qtd, 2);
  assert.equal(c.itens.filter((i) => i.id === 'resistor').length, 2);
  assert.ok(c.total > 45);
  assert.match(led.lojas.mercadolivre, /^https:\/\/lista\.mercadolivre\.com\.br\/led-5-mm$/);
});

caso('PlatformIO do Pico usa o core da comunidade', () => {
  assert.match(platformioIni({ placa: 'rpi-pico', firmware: { bibliotecas: [] } }), /board_build\.core = earlephilhower/);
  assert.equal(slug('Estação de Clima!'), 'estacao-de-clima');
  assert.match(platformioIni({ placa: 'esp32-c3', firmware: { bibliotecas: [] } }), /build_flags =\n {4}-DARDUINO_USB_MODE=1\n {4}-DARDUINO_USB_CDC_ON_BOOT=1/);
});

caso('desenho: peças do lado dos pinos em que estão ligadas, sem sobrepor', () => {
  const p = lerResposta(RESPOSTA, {});
  const L = layout(p, conferir(p));
  const dht = L.pecas.find((x) => x.id === 'dht1'), oled = L.pecas.find((x) => x.id === 'oled');
  assert.equal(dht.lado, 'd'); // D4 fica do lado direito do DevKit
  assert.ok(oled.x > L.placa.w);
  const lado = L.pecas.filter((x) => x.lado === 'd' && x.x === dht.x).sort((a, b) => a.y - b.y);
  for (let i = 1; i < lado.length; i++) assert.ok(lado[i].y >= lado[i - 1].y + lado[i - 1].h, 'peças sobrepostas');
  const L2 = layout({ ...p, posicoes: { dht1: { x: -500, y: 10 } } }, null);
  const d2 = L2.pecas.find((x) => x.id === 'dht1');
  assert.equal(d2.x, -500); assert.equal(d2.pinoX, d2.w);
});

console.log(`${ok} casos passaram.`);
