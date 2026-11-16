// Do projeto para arquivos de verdade: PlatformIO (compila e grava), MicroPython, ESPHome, o diagrama do Wokwi
// (simular antes de montar) e um LEIA-ME com lista de compras, tabela de ligações e passo a passo.
import { PLACAS, PECAS, EXTRAS, LINGUAGENS, acharPinoPlaca } from './catalogo.mjs';

export const slug = (s) => String(s || 'projeto').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'projeto';
const brl = (n) => 'R$ ' + n.toFixed(2).replace('.', ',');

// ---------- lista de compras ----------
export function listaDeCompras(p) {
  const itens = [];
  const placa = PLACAS[p.placa];
  if (placa) itens.push({ id: p.placa, nome: placa.nome, qtd: 1, preco: placa.preco, busca: placa.nome });
  const por = new Map();
  for (const pc of p.pecas || []) {
    const c = PECAS[pc.tipo]; if (!c) continue;
    const k = pc.tipo + (pc.tipo === 'resistor' ? ':' + (pc.valor || '') : '');
    if (!por.has(k)) por.set(k, { id: pc.tipo, nome: c.nome + (pc.tipo === 'resistor' && pc.valor ? ' ' + pc.valor : '') + (pc.leds ? ` (${pc.leds} LEDs)` : ''), qtd: 0, preco: c.preco * (c.porLed && pc.leds ? Math.max(1, pc.leds / 60) : 1), busca: c.nome.replace(/\(.*?\)/g, '') + (pc.tipo === 'resistor' && pc.valor ? ' ' + pc.valor : ''), usos: [] });
    const x = por.get(k); x.qtd++; if (pc.rotulo) x.usos.push(pc.rotulo);
  }
  itens.push(...por.values());
  for (const e of EXTRAS) itens.push({ ...e, busca: e.nome.replace(/\(.*?\)/g, '') });
  for (const i of itens) i.lojas = lojas(i.busca);
  const total = itens.reduce((s, i) => s + i.preco * i.qtd, 0);
  return { itens, total: Math.round(total * 100) / 100 };
}
export function lojas(termo) {
  const t = String(termo).trim().replace(/\s+/g, ' ');
  const h = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    mercadolivre: 'https://lista.mercadolivre.com.br/' + h,
    aliexpress: 'https://pt.aliexpress.com/w/wholesale-' + h + '.html',
    shopee: 'https://shopee.com.br/search?keyword=' + encodeURIComponent(t),
  };
}

// ---------- PlatformIO ----------
export function platformioIni(p) {
  const placa = PLACAS[p.placa]; if (!placa) return '';
  const env = slug(p.placa).replace(/-/g, '_');
  const linhas = ['; Gerado pelo BlueCircuito. Compilar: pio run   Gravar: pio run -t upload   Monitor: pio device monitor', '', `[env:${env}]`, `platform = ${placa.pio.platform}`, `board = ${placa.pio.board}`, 'framework = arduino'];
  if (placa.pio.core) linhas.push(`board_build.core = ${placa.pio.core}`);
  // Serial pelo USB nativo (C3 SuperMini, S3): sem isso o monitor serial fica mudo
  if (placa.pio.flags) linhas.push('build_flags =', ...placa.pio.flags.map((f) => '    ' + f));
  linhas.push('monitor_speed = 115200');
  if (/^esp/.test(p.placa)) linhas.push('monitor_filters = esp32_exception_decoder'.replace('esp32', p.placa === 'esp8266-nodemcu' ? 'esp8266' : 'esp32'));
  const libs = ((p.firmware && p.firmware.bibliotecas) || []).filter((l) => !/^(Wire|SPI|WiFi|Arduino|EEPROM|Preferences|HTTPClient|WebServer|ESP8266WiFi)(\.h)?$/i.test(l));
  if (libs.length) linhas.push('lib_deps =', ...libs.map((l) => '    ' + l));
  return linhas.join('\n') + '\n';
}
export const envDe = (p) => slug(p.placa).replace(/-/g, '_');

// ---------- Wokwi ----------
// diagram.json do Wokwi (wokwi.com ou a extensão do VS Code). Peças sem equivalente ficam de fora, com aviso.
export function wokwi(p) {
  const placa = PLACAS[p.placa];
  if (!placa || !placa.wokwi) return { diagrama: null, faltam: [], motivo: `O Wokwi não tem a ${placa ? placa.nome : 'placa'}: dá para simular trocando por ESP32 DevKit, Arduino Uno ou Raspberry Pi Pico.` };
  const parts = [{ type: placa.wokwi, id: 'placa', top: 0, left: 0, attrs: {} }];
  const faltam = [];
  const pos = p.posicoes || {};
  (p.pecas || []).forEach((pc, i) => {
    const c = PECAS[pc.tipo];
    if (!c || !c.wokwi) { faltam.push(pc.id); return; }
    const attrs = { ...(c.wokwi.atributos || {}) };
    if (pc.tipo === 'resistor') { const n = String(pc.valor || '220').replace(',', '.').match(/([\d.]+)\s*([kKmM]?)/); attrs.value = n ? String(Math.round(parseFloat(n[1]) * ({ k: 1e3, K: 1e3, m: 1e6, M: 1e6 }[n[2]] || 1))) : '220'; }
    if (pc.tipo === 'led') attrs.color = /verde|green/i.test(pc.rotulo || '') ? 'green' : /azul|blue/i.test(pc.rotulo || '') ? 'blue' : /amarel|yellow/i.test(pc.rotulo || '') ? 'yellow' : 'red';
    if (pc.tipo === 'fita-ws2812b') attrs.pixels = String(pc.leds || c.qtdLeds || 16);
    if (pc.tipo === 'lcd-i2c' && pc.endereco) attrs.i2cAddress = pc.endereco;
    const q = pos[pc.id] || { x: 260 + (i % 3) * 140, y: -120 + Math.floor(i / 3) * 140 };
    parts.push({ type: c.wokwi.tipo, id: pc.id, top: Math.round(q.y), left: Math.round(q.x), attrs });
  });
  const ponto = (txt) => {
    const s = String(txt), i = s.lastIndexOf(':'), quem = s.slice(0, i), pino = s.slice(i + 1);
    if (/^(placa|board|mcu|esp|esp32|arduino|uno|pico)$/i.test(quem)) { const pp = acharPinoPlaca(placa, pino); return pp && pp.wokwi ? 'placa:' + pp.wokwi : null; }
    const pc = (p.pecas || []).find((x) => x.id === quem); const c = pc && PECAS[pc.tipo];
    if (!c || !c.wokwi) return null;
    const nome = Object.keys(c.wokwi.pinos).find((k) => k.toLowerCase() === pino.toLowerCase());
    return nome ? pc.id + ':' + c.wokwi.pinos[nome] : null;
  };
  const connections = [];
  let pulados = 0;
  for (const l of p.ligacoes || []) {
    const a = ponto(l.de), b = ponto(l.para);
    if (!a || !b) { pulados++; continue; }
    connections.push([a, b, corFio(l), []]);
  }
  if (/^esp|pico/.test(p.placa)) connections.unshift(['placa:TX0', '$serialMonitor:RX', '', []], ['placa:RX0', '$serialMonitor:TX', '', []]);
  if (/pico/.test(p.placa)) connections.splice(0, 2, ['placa:GP0', '$serialMonitor:RX', '', []], ['placa:GP1', '$serialMonitor:TX', '', []]);
  return { diagrama: { version: 1, author: 'BlueCircuito', editor: 'wokwi', parts, connections, dependencies: {} }, faltam, pulados };
}
function corFio(l) {
  const s = (l.de + ' ' + l.para).toUpperCase();
  if (/GND|:K\b|:-$/.test(s)) return 'black';
  if (/3V3|3\.3V/.test(s)) return 'orange';
  if (/5V|VIN|VBUS|V\+/.test(s)) return 'red';
  if (/SDA/.test(s)) return 'blue';
  if (/SCL/.test(s)) return 'gold';
  return 'green';
}

// ---------- LEIA-ME ----------
export function leiaMe(p, conferencia) {
  const placa = PLACAS[p.placa] || { nome: p.placa };
  const compras = listaDeCompras(p);
  const L = [`# ${p.nome || 'Projeto'}`, '', p.resumo || '', '', `Placa: **${placa.nome}** · Linguagem: **${(LINGUAGENS[p.linguagem] || {}).nome || p.linguagem}**${p.wifi ? ' · usa Wi-Fi' : ''}`, ''];
  if (conferencia) {
    const r = conferencia.resumo;
    L.push(`Conferência elétrica do BlueCircuito: ${r.erro ? `**${r.erro} erro(s)**` : 'sem erros'}, ${r.aviso} aviso(s).`, '');
    for (const x of conferencia.problemas.filter((x) => x.nivel !== 'dica')) L.push(`- ${x.nivel === 'erro' ? '❌' : '⚠️'} ${x.texto}`);
    if (conferencia.problemas.length) L.push('');
  }
  L.push('## Lista de compras', '', '| Qtd | Peça | Preço estimado |', '|---|---|---|');
  for (const i of compras.itens) L.push(`| ${i.qtd} | [${i.nome}](${i.lojas.mercadolivre}) | ${brl(i.preco * i.qtd)} |`);
  L.push(`| | **Total estimado** | **${brl(compras.total)}** |`, '', 'Preços aproximados, só para ter ideia.', '');
  L.push('## Ligações', '', '| De | Para | Nota |', '|---|---|---|');
  for (const l of p.ligacoes || []) L.push(`| \`${l.de}\` | \`${l.para}\` | ${l.nota || ''} |`);
  L.push('');
  if ((p.montagem || []).length) L.push('## Montagem', '', ...p.montagem.map((x, i) => `${i + 1}. ${x}`), '');
  const f = p.firmware || {};
  if ((f.configurar || []).length) L.push('## Antes de gravar', '', ...f.configurar.map((x) => '- ' + x), '');
  if (p.linguagem === 'arduino') L.push('## Compilar e gravar', '', 'Com o [PlatformIO](https://platformio.org/install/cli) instalado, nesta pasta:', '', '```', 'pio run               # compila', 'pio run -t upload     # grava na placa (USB)', 'pio device monitor    # mostra o Serial', '```', '');
  if (p.linguagem === 'micropython') L.push('## Gravar', '', 'Com o MicroPython na placa e o `mpremote` instalado (`pip install mpremote`):', '', '```', 'mpremote connect auto cp main.py :main.py + reset', '```', '');
  if (p.linguagem === 'esphome') L.push('## Gravar', '', '```', `esphome run ${slug(p.nome)}.yaml`, '```', '');
  if ((p.testes || []).length) L.push('## Testar', '', ...p.testes.map((x) => '- ' + x), '');
  if ((p.seguranca || []).length) L.push('## Segurança', '', ...p.seguranca.map((x) => '- ' + x), '');
  if ((p.fluxo || []).length) L.push('## Como o programa funciona', '', ...p.fluxo.map((x, i) => `${i + 1}. ${x.texto}`), '');
  if (placa.wokwi) L.push('## Simular', '', 'O `diagram.json` abre no [Wokwi](https://wokwi.com) (crie um projeto da placa e cole o diagrama e o código) ou na extensão Wokwi do VS Code, que usa o `wokwi.toml` depois do `pio run`.', '');
  L.push('---', '', 'Feito com o BlueCircuito, plugin do BlueScreen. Confira as ligações com a placa desligada antes de energizar.');
  return L.join('\n') + '\n';
}

// ---------- todos os arquivos ----------
export function arquivos(p, conferencia) {
  const out = {};
  const f = p.firmware || {};
  const codigo = String(f.codigo || '');
  if (p.linguagem === 'micropython') out['main.py'] = codigo;
  else if (p.linguagem === 'esphome') out[slug(p.nome) + '.yaml'] = codigo;
  else { out['platformio.ini'] = platformioIni(p); out['src/main.cpp'] = codigo; }
  const w = wokwi(p);
  if (w.diagrama) {
    out['diagram.json'] = JSON.stringify(w.diagrama, null, 2) + '\n';
    if (p.linguagem === 'arduino') out['wokwi.toml'] = `[wokwi]\nversion = 1\nfirmware = '.pio/build/${envDe(p)}/firmware.${/pico/.test(p.placa) ? 'uf2' : 'bin'}'\nelf = '.pio/build/${envDe(p)}/firmware.elf'\n`;
  }
  out['LEIA-ME.md'] = leiaMe(p, conferencia);
  const { mensagem, conversa, ...salvo } = p;
  out['bluecircuito.json'] = JSON.stringify(salvo, null, 2) + '\n';
  return out;
}
