// BlueCircuito: servidor do plugin. Tem o catálogo, a conferência elétrica, o pedido para a IA e a leitura da
// resposta, o desenho das ligações e a exportação (grava a pasta do projeto). A IA roda pela página (plugin.spawn),
// com os Agentes de IA da IDE, para dar para acompanhar e parar.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { PLACAS, PECAS, LINGUAGENS, EXTRAS, pinosDa } from './lib/catalogo.mjs';
import { conferir } from './lib/conferir.mjs';
import { montarPedido, lerResposta } from './lib/ia.mjs';
import { layout } from './lib/desenho.mjs';
import { arquivos, listaDeCompras, wokwi, slug, envDe } from './lib/exportar.mjs';

const require = createRequire(import.meta.url);
const { Plugin } = require(path.join(process.env.BLUESCREEN_SDK, 'bluescreen.js'));
const p = new Plugin();

class Falha extends Error { constructor(m, status = 400) { super(m); this.status = status; } }

function rota(nome, fn) {
  p.route('bluecircuito/' + nome, async (req) => {
    if (req.remote) return Plugin.reply(403, { error: 'O BlueCircuito só responde no próprio PC.' });
    try { return (await fn(req.method === 'POST' ? req.json() : {}, req.query)) ?? { ok: true }; } catch (e) {
      if (!e.status) console.error(e);
      return Plugin.reply(e.status || 500, { error: e.message || String(e) });
    }
  });
}

rota('catalogo', () => ({
  placas: Object.entries(PLACAS).map(([id, x]) => ({ id, nome: x.nome, mcu: x.mcu, logica: x.logica, wifi: x.wifi, bluetooth: x.bluetooth, preco: x.preco, wokwi: !!x.wokwi, sinais: pinosDa(x).filter((y) => y.gpio != null).length })),
  pecas: Object.entries(PECAS).map(([id, x]) => ({ id, nome: x.nome, grupo: x.grupo, preco: x.preco, dica: x.dica || '', pinos: x.pinos.map((y) => ({ nome: y.nome, papel: y.papel, opcional: !!y.opcional, faixa: y.faixa || null, desc: y.desc || '' })), i2c: x.i2c || null })),
  linguagens: LINGUAGENS,
  extras: EXTRAS,
}));

// tudo o que a tela precisa de um projeto, numa ida só
rota('analisar', (b) => {
  const pr = b.projeto || {};
  const c = conferir(pr);
  const w = wokwi(pr);
  return { conferencia: c, layout: layout(pr, c), compras: listaDeCompras(pr), wokwi: { ok: !!w.diagrama, faltam: w.faltam, motivo: w.motivo || '' } };
});
rota('pedido', (b) => montarPedido(b));
rota('ler', (b) => {
  const projeto = lerResposta(b.texto, b.anterior || {});
  return { projeto, conferencia: conferir(projeto) };
});
rota('wokwi', (b) => {
  const w = wokwi(b.projeto || {});
  if (!w.diagrama) throw new Falha(w.motivo || 'Esta placa não tem simulação no Wokwi.');
  return { json: JSON.stringify(w.diagrama, null, 2), faltam: w.faltam, pulados: w.pulados };
});

// grava a pasta do projeto: <pasta>/<nome-do-projeto>/...
rota('exportar', (b) => {
  const pr = b.projeto || {};
  const base = String(b.pasta || '').trim();
  if (!base || !path.isAbsolute(base)) throw new Falha('Escolha uma pasta (caminho completo) para salvar o projeto.');
  const dir = path.join(base, slug(pr.nome));
  const lista = arquivos(pr, conferir(pr));
  const gravados = [];
  for (const [rel, conteudo] of Object.entries(lista)) {
    const f = path.join(dir, rel);
    if (!f.startsWith(dir + path.sep)) continue;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    // código que a pessoa mexeu na pasta não some: a versão antiga fica ao lado, com .antes
    if (/\.(cpp|py|yaml|ino)$/.test(rel) && fs.existsSync(f) && fs.readFileSync(f, 'utf8') !== conteudo) fs.copyFileSync(f, f + '.antes');
    fs.writeFileSync(f, conteudo);
    gravados.push(rel);
  }
  return { dir, arquivos: gravados, env: envDe(pr) };
});
// o que está gravado na pasta (para trazer de volta o código que a pessoa mexeu)
rota('ler-pasta', (b) => {
  const dir = String(b.dir || '');
  if (!path.isAbsolute(dir)) throw new Falha('pasta inválida');
  const ler = (rel) => { try { return fs.readFileSync(path.join(dir, rel), 'utf8'); } catch { return null; } };
  return { codigo: ler('src/main.cpp') ?? ler('main.py'), projeto: (() => { try { return JSON.parse(ler('bluecircuito.json') || 'null'); } catch { return null; } })() };
});

// ferramentas de compilar e gravar instaladas no PC
const onde = (prog) => {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [prog], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)[0] || null : null;
};
rota('ferramentas', () => {
  // a extensão PlatformIO do VS Code instala o pio fora do PATH
  const pioVsCode = path.join(os.homedir(), '.platformio', 'penv', process.platform === 'win32' ? 'Scripts\\pio.exe' : 'bin/pio');
  return {
    pio: onde('pio') || onde('platformio') || (fs.existsSync(pioVsCode) ? pioVsCode : null),
    arduinoCli: onde('arduino-cli'),
    mpremote: onde('mpremote'),
    esphome: onde('esphome'),
    python: onde('python') || onde('py'),
  };
});

rota('abrir', (b) => {
  const u = String(b.url || '');
  if (!/^https?:\/\/[^\s"]+$/i.test(u)) throw new Falha('só abro endereços http e https');
  if (process.platform === 'win32') spawn('rundll32.exe', ['url.dll,FileProtocolHandler', u], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [u], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true };
});
rota('mostrar-pasta', (b) => {
  const d = String(b.dir || '');
  if (!path.isAbsolute(d) || !fs.existsSync(d)) throw new Falha('a pasta não existe');
  if (process.platform === 'win32') spawn('explorer.exe', [d], { detached: true, stdio: 'ignore' }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [d], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true };
});
rota('pasta-padrao', () => {
  const docs = path.join(os.homedir(), 'Documents');
  return { pasta: path.join(fs.existsSync(docs) ? docs : os.homedir(), 'BlueCircuito') };
});

p.run();
