// O pedido para a IA e a leitura da resposta. A IA devolve o projeto inteiro em JSON; o BlueCircuito normaliza
// (ids, apelidos de placa e peça, formatos de ligação), junta com o que já existia e manda para a conferência.
// Quando a conferência acha erro, o pedido de correção leva a lista exata dos problemas.
import { PLACAS, PECAS, LINGUAGENS, catalogoParaIA } from './catalogo.mjs';

const ESQUEMA = `{
  "nome": "nome curto do projeto",
  "resumo": "uma ou duas frases: o que faz",
  "mensagem": "o que você fez ou respondeu nesta rodada, em 1 a 3 frases, para a pessoa ler",
  "placa": "id de uma placa do catálogo",
  "linguagem": "arduino | micropython | esphome",
  "wifi": true,
  "pecas": [{ "id": "dht1", "tipo": "id de uma peça do catálogo", "rotulo": "para que serve aqui", "valor": "só resistor, ex.: 220Ω", "leds": 30, "endereco": "só I2C quando não for o padrão, ex.: 0x69" }],
  "ligacoes": [{ "de": "placa:D4", "para": "dht1:DATA", "nota": "opcional" }],
  "fluxo": [{ "id": "f1", "tipo": "inicio | gatilho | leitura | decisao | acao | espera | rede", "texto": "o que acontece", "depois": ["f2"], "rotulos": ["sim", "não"] }],
  "firmware": { "codigo": "o código completo", "bibliotecas": ["dono/nome@^versão no registro do PlatformIO"], "configurar": ["o que a pessoa troca antes de gravar, ex.: nome e senha do Wi-Fi"] },
  "montagem": ["passo a passo para montar na protoboard, um item por passo"],
  "testes": ["como conferir que cada parte funciona"],
  "seguranca": ["cuidados que importam neste projeto (tomada, bateria, motor); vazio se não houver"]
}`;

const REGRAS = `Regras (a conferência automática recusa o que fugir delas):
- Use só placas e peças do catálogo, pelos ids exatos. Ponto de ligação é "placa:<pino>" ou "<id da peça>:<pino>", com os nomes de pino do catálogo.
- Uma ligação por fio. Todo VCC e todo GND de cada peça ligado. GND de fonte externa ligado ao GND da placa.
- LED sempre com resistor em série (220Ω a 330Ω): placa → resistor → ânodo A; cátodo K → GND.
- Placa de 3,3 V não recebe sinal de 5 V: HC-SR04, MQ-2 e outros de 5 V passam por "conversor-nivel" (HV1↔LV1, HV no 5 V, LV no 3V3) ou por divisor de resistores.
- ESP32 com Wi-Fi: leitura analógica só nos pinos de ADC1 (VP, VN, D32, D33, D34, D35). D34, D35, VP e VN são só entrada.
- Evite pinos de boot (ESP32: D0, D2, D5, D12, D15) e os da serial (TX0, RX0) quando houver outro livre.
- Servo, motor de passo e fita de LED com muitos LEDs: fonte de 5 V própria ("fonte-5v"), com GND junto ao da placa. Motor DC só pelas saídas OUT de um driver.
- I2C: todas as peças no mesmo SDA/SCL (no Uno e no Nano, só A4/A5). Dois aparelhos com o mesmo endereço não podem: mude o "endereco" quando a peça permitir.
- DS18B20 precisa de resistor de 4,7kΩ do DQ ao VCC.
- O código usa exatamente os pinos das ligações, em constantes com nome (const int PINO_RELE = 26;), compila sem mudar nada além do que está em "configurar", e trata erro de leitura dos sensores. Arduino: framework Arduino para PlatformIO, com Serial a 115200 mostrando o que acontece. ESPHome: o YAML completo do dispositivo.
- O platformio.ini é gerado pelo BlueCircuito (placa, framework, ajustes de USB da placa e as "bibliotecas"): não peça para a pessoa mexer nele. Em "configurar" só vai o que está no código (Wi-Fi, endereço, calibração).
- O fluxo descreve o comportamento do programa (do início ao laço), com decisões que têm dois caminhos.
- Responda SÓ com o JSON, dentro de um bloco \`\`\`json, sem texto antes ou depois.`;

export function montarPedido({ modo = 'novo', pedido = '', projeto = null, problemas = [], placa = '', linguagem = '' } = {}) {
  const cat = catalogoParaIA();
  const partes = [
    'Você é o BlueCircuito, engenheiro de eletrônica que projeta protótipos de automação com ESP32, Arduino e Raspberry Pi Pico para alguém montar na bancada. Projete algo que funcione de primeira, seguro e barato, com peças comuns no Brasil.',
    `Formato da resposta (JSON):\n${ESQUEMA}`,
    REGRAS,
    `Placas do catálogo:\n${cat.placas}`,
    `Peças do catálogo (pino? = opcional):\n${cat.pecas}`,
  ];
  if (modo === 'novo') {
    const escolha = [placa && PLACAS[placa] ? `Use a placa ${placa}.` : 'Escolha a placa mais simples e barata que resolva.', linguagem && LINGUAGENS[linguagem] ? `Use a linguagem ${linguagem}.` : 'Use arduino, a não ser que a pessoa peça outra.'].join(' ');
    partes.push(`# O que a pessoa quer montar\n${pedido}\n\n${escolha}`);
  } else {
    partes.push(`# Projeto atual (JSON)\n\`\`\`json\n${JSON.stringify(limpar(projeto), null, 1)}\n\`\`\``);
    if (modo === 'corrigir') partes.push(`# A conferência elétrica achou estes problemas\n${problemas.map((p, i) => `${i + 1}. [${p.nivel}] ${p.texto}`).join('\n')}\n\nCorrija todos os erros (e os avisos que der) mexendo só no necessário. Devolva o projeto inteiro corrigido e diga em "mensagem" o que mudou.`);
    else partes.push(`# O que a pessoa pede agora\n${pedido}\n\nSe for uma mudança, devolva o projeto inteiro já alterado. Se for só uma pergunta, devolva o projeto como está e responda em "mensagem".`);
  }
  return { prompt: partes.join('\n\n') };
}

// o que não precisa ir para a IA de volta
function limpar(p) {
  if (!p) return p;
  const { mensagem, posicoes, conversa, criado, alterado, id, ...resto } = p;
  return resto;
}

// ---------- resposta ----------
export function extrairJson(texto) {
  const t = String(texto || '');
  const blocos = [...t.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const candidatos = [...blocos.sort((a, b) => b.length - a.length)];
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) candidatos.push(t.slice(i, j + 1));
  for (const c of candidatos) {
    for (const tentativa of [c, c.replace(/,\s*([}\]])/g, '$1')]) {
      try { const o = JSON.parse(tentativa); if (o && typeof o === 'object' && !Array.isArray(o)) return o; } catch {}
    }
  }
  return null;
}

const PLACA_APELIDO = { esp32: 'esp32-devkit', 'esp32-devkit-v1': 'esp32-devkit', esp32dev: 'esp32-devkit', 'esp32-wroom': 'esp32-devkit', 'esp32-s3-devkitc': 'esp32-s3', esp32s3: 'esp32-s3', esp32c3: 'esp32-c3', 'esp32-c3-supermini': 'esp32-c3', esp8266: 'esp8266-nodemcu', nodemcu: 'esp8266-nodemcu', uno: 'arduino-uno', 'arduino-uno-r3': 'arduino-uno', nano: 'arduino-nano', pico: 'rpi-pico', 'raspberry-pi-pico': 'rpi-pico', 'pico-w': 'rpi-pico-w', picow: 'rpi-pico-w' };
const PECA_APELIDO = { hcsr04: 'hc-sr04', ultrassonico: 'hc-sr04', 'hc-sr501': 'pir', oled: 'ssd1306', 'oled-ssd1306': 'ssd1306', lcd: 'lcd-i2c', lcd1602: 'lcd-i2c', 'lcd-1602-i2c': 'lcd-i2c', relay: 'rele', 'rele-5v': 'rele', 'modulo-rele': 'rele', sg90: 'servo', 'servo-sg90': 'servo', ws2812b: 'fita-ws2812b', neopixel: 'fita-ws2812b', 'level-shifter': 'conversor-nivel', 'conversor-de-nivel': 'conversor-nivel', button: 'botao', 'botão': 'botao', pushbutton: 'botao', potentiometer: 'potenciometro', 'potenciômetro': 'potenciometro', buzzer: 'buzzer-ativo', 'gy-521': 'mpu6050', 'mpu-6050': 'mpu6050', rtc: 'ds3231', 'ds-3231': 'ds3231', 'rc-522': 'rc522', rfid: 'rc522', 'sensor-solo': 'umidade-solo', 'mq-2': 'mq2', 'ky-040': 'encoder', 'sd-card': 'microsd', 'fonte-5v-2a': 'fonte-5v', 'fonte5v': 'fonte-5v', 'lm-2596': 'lm2596', 'dht-22': 'dht22', 'dht-11': 'dht11', 'ds-18b20': 'ds18b20', 'motor': 'motor-dc', '28byj-48': 'passo-28byj48', 'uln2003': 'passo-28byj48' };
const chaveDe = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_]+/g, '-');
const idValido = (s, i) => (String(s || '').trim().replace(/[^\w-]/g, '').slice(0, 24) || 'p' + (i + 1));
const lista = (x) => (Array.isArray(x) ? x : x == null || x === '' ? [] : [x]).map((y) => (typeof y === 'string' ? y.trim() : y)).filter((y) => y !== '' && y != null);

// junta a resposta ao projeto que existia: o que a IA não mandou continua como estava
export function normalizar(bruto, anterior = {}) {
  const o = { ...(anterior || {}) };
  const b = bruto || {};
  for (const k of ['nome', 'resumo', 'mensagem']) if (typeof b[k] === 'string') o[k] = b[k].trim().slice(0, k === 'mensagem' ? 2000 : 300);
  if (b.placa != null) { const k = chaveDe(b.placa); o.placa = PLACAS[k] ? k : PLACA_APELIDO[k] || k; }
  if (b.linguagem != null) { const k = chaveDe(b.linguagem); o.linguagem = LINGUAGENS[k] ? k : /python/.test(k) ? 'micropython' : /esphome|yaml/.test(k) ? 'esphome' : 'arduino'; }
  if (!o.linguagem) o.linguagem = 'arduino';
  if (typeof b.wifi === 'boolean') o.wifi = b.wifi;
  if (Array.isArray(b.pecas)) o.pecas = b.pecas.filter((x) => x && typeof x === 'object').map((x, i) => {
    const k = chaveDe(x.tipo);
    const pc = { id: idValido(x.id, i), tipo: PECAS[k] ? k : PECA_APELIDO[k] || k };
    if (x.rotulo) pc.rotulo = String(x.rotulo).slice(0, 80);
    if (x.valor != null && x.valor !== '') pc.valor = String(x.valor).slice(0, 20);
    if (x.leds != null && Number(x.leds) > 0) pc.leds = Math.min(1000, Math.round(Number(x.leds)));
    if (x.endereco != null && x.endereco !== '') pc.endereco = String(x.endereco).slice(0, 6);
    return pc;
  });
  if (Array.isArray(b.ligacoes)) o.ligacoes = b.ligacoes.map((l) => {
    if (Array.isArray(l)) return { de: String(l[0] || ''), para: String(l[1] || '') };
    if (!l || typeof l !== 'object') return null;
    const x = { de: String(l.de ?? l.from ?? l.a ?? ''), para: String(l.para ?? l.to ?? l.b ?? '') };
    if (l.nota) x.nota = String(l.nota).slice(0, 120);
    return x;
  }).filter((l) => l && l.de && l.para);
  if (Array.isArray(b.fluxo)) o.fluxo = b.fluxo.map((f, i) => typeof f === 'string' ? { id: 'f' + (i + 1), tipo: i ? 'acao' : 'inicio', texto: f, depois: [] } : f && typeof f === 'object' ? {
    id: idValido(f.id, i), tipo: ['inicio', 'gatilho', 'leitura', 'decisao', 'acao', 'espera', 'rede'].includes(f.tipo) ? f.tipo : 'acao',
    texto: String(f.texto || f.text || '').slice(0, 200), depois: lista(f.depois || f.next).map(String), rotulos: lista(f.rotulos).map(String),
  } : null).filter(Boolean);
  // fluxo sem "depois": segue a ordem
  if (o.fluxo && o.fluxo.length && o.fluxo.every((f) => !f.depois.length)) o.fluxo.forEach((f, i, a) => { if (a[i + 1]) f.depois = [a[i + 1].id]; });
  if (b.firmware != null) {
    const f = typeof b.firmware === 'string' ? { codigo: b.firmware } : b.firmware;
    o.firmware = { codigo: String(f.codigo || f.code || '').replace(/^```\w*\n|```\s*$/g, ''), bibliotecas: lista(f.bibliotecas || f.libs).map(String), configurar: lista(f.configurar).map(String) };
  }
  for (const k of ['montagem', 'testes', 'seguranca']) if (b[k] != null) o[k] = lista(b[k]).map(String);
  return o;
}

export function lerResposta(texto, anterior) {
  const j = extrairJson(texto);
  if (!j) {
    const curto = String(texto || '').trim().slice(0, 400);
    throw Object.assign(new Error(curto ? 'A IA não devolveu o projeto em JSON. Ela disse: ' + curto : 'A IA não respondeu nada.'), { status: 422 });
  }
  return normalizar(j, anterior);
}
