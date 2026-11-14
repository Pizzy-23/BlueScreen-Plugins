// Bluetego: servidor do plugin. Roda as transformações (a página não consegue: CORS, e a rede fica num lugar só),
// guarda as respostas por alguns minutos para não repetir consultas e abre links no navegador.
// As investigações não passam por aqui: a página grava direto em plugin.files.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { TIPOS, detectar, extrair, normalizar, chave, tipoValido } from './lib/entidades.mjs';
import { TRANSFORMACOES, rodar, Falha } from './lib/transformacoes.mjs';
import { MAQUINAS } from './lib/maquinas.mjs';

const require = createRequire(import.meta.url);
const { Plugin } = require(path.join(process.env.BLUESCREEN_SDK, 'bluescreen.js'));
const p = new Plugin();
const AGENTE = 'Bluetego/0.1 (BlueScreen; +https://github.com/martindevbr/BlueScreen-Plugins)';
const MAX_PAGINA = 2_000_000;

// ---------- rede ----------
async function pedir(url, opt = {}) {
  let host = url;
  try { host = new URL(url).host; } catch { throw new Falha('endereço inválido: ' + url); }
  try {
    return await fetch(url, { headers: { 'user-agent': AGENTE, ...(opt.headers || {}) }, redirect: opt.redirect || 'follow', signal: AbortSignal.timeout(opt.timeout || 25000) });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Falha(`${host} demorou demais para responder.`, { status: 504 });
    throw new Falha(`Sem conexão com ${host}.`, { status: 503 });
  }
}
const ctxRede = {
  async json(url, opt = {}) {
    const r = await pedir(url, { ...opt, headers: { accept: 'application/json', ...(opt.headers || {}) } });
    const host = new URL(url).host;
    if (r.status === 404 && opt.nulo404) return null;
    if (r.status === 429) throw new Falha(`${host} pediu para esperar (limite de consultas). Tente daqui a pouco.`, { status: 429 });
    if (!r.ok) throw new Falha(`${host} respondeu ${r.status}.`, { status: 502 });
    const t = await r.text();
    try { return JSON.parse(t); } catch { throw new Falha(`${host} não devolveu JSON.`, { status: 502 }); }
  },
  async pagina(url, opt = {}) {
    const r = await pedir(url, { redirect: opt.seguir === false ? 'manual' : 'follow', headers: { accept: 'text/html,*/*;q=0.8' } });
    const headers = Object.fromEntries([...r.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));
    let texto = '';
    if (/text|html|json|xml/i.test(headers['content-type'] || '') && r.body) {
      // lê no máximo 2 MB: uma página enorme (ou um download) não trava o servidor
      const leitor = r.body.getReader(), partes = [];
      let total = 0;
      while (total < MAX_PAGINA) { const { done, value } = await leitor.read(); if (done) break; partes.push(value); total += value.length; }
      leitor.cancel().catch(() => {});
      texto = Buffer.concat(partes.map((x) => Buffer.from(x))).toString('utf8');
    } else r.body?.cancel().catch(() => {});
    return { status: r.status, url: r.url || url, headers, texto };
  },
  // pelo plugin.fetch da IDE: o {{vault:...}} é trocado lá dentro, e a chave nunca passa por este processo
  async cofre(url, headers) {
    try {
      const r = await p.fetch(url, { headers: { 'user-agent': AGENTE, ...headers }, timeout: 25000 });
      return { status: r.status, ok: r.status >= 200 && r.status < 300, json: () => r.json() };
    } catch (e) {
      throw new Falha('Falta liberar a chave do VirusTotal no Cofre (' + (e.message || e) + ').', { status: 403, codigo: 'cofre' });
    }
  },
};

// ---------- respostas guardadas ----------
const CACHE = new Map();
const VALIDADE = 10 * 60 * 1000;
function lembrar(k, v) {
  CACHE.set(k, { em: Date.now(), v });
  if (CACHE.size > 800) CACHE.delete(CACHE.keys().next().value);
}
async function limite() {
  const v = Number((await p.settings().catch(() => ({}))).limite);
  return Number.isFinite(v) && v > 0 ? Math.min(500, Math.round(v)) : 40;
}

// ---------- rotas ----------
function rota(nome, fn) {
  p.route('bluetego/' + nome, async (req) => {
    if (req.remote) return Plugin.reply(403, { error: 'O Bluetego só responde no próprio PC.' });
    try { return (await fn(req.method === 'POST' ? req.json() : {}, req.query, req)) ?? { ok: true }; } catch (e) {
      if (!e.status) console.error(e);
      return Plugin.reply(e.status || 500, { error: e.message || String(e), codigo: e.codigo || '' });
    }
  });
}
rota('catalogo', () => ({
  tipos: TIPOS,
  transformacoes: TRANSFORMACOES.map(({ id, de, nome, fonte, rapida, cofre }) => ({ id, de, nome, fonte, rapida: !!rapida, cofre: cofre || '' })),
  maquinas: MAQUINAS,
}));
rota('transformar', async (b) => {
  const lim = await limite();
  const k = [b.t, b.tipo, b.valor, lim].join('|');
  const guardada = CACHE.get(k);
  if (guardada && Date.now() - guardada.em < VALIDADE && !b.deNovo) return { ...guardada.v, guardada: true };
  const r = await rodar(String(b.t || ''), String(b.tipo || ''), String(b.valor || ''), { ...ctxRede, limite: lim }, b.completo);
  lembrar(k, r);
  return r;
});
rota('extrair', (b) => ({ entidades: extrair(String(b.texto || '')).filter((e) => e.tipo !== 'texto').map((e) => ({ ...e, id: chave(e.tipo, e.valor) })) }));
// o que a pessoa digitou: o tipo (o escolhido ou o adivinhado), o valor na forma canônica e o id
rota('entidade', (b) => {
  const bruto = String(b.valor || '').trim();
  if (!bruto) throw new Falha('Escreva um valor.');
  const tipo = tipoValido(b.tipo) ? b.tipo : detectar(bruto);
  const valor = normalizar(tipo, bruto);
  return { tipo, valor, id: chave(tipo, valor), adivinhado: detectar(bruto) };
});
rota('abrir', (b) => {
  const u = String(b.url || '');
  if (!/^https?:\/\/[^\s"]+$/i.test(u)) throw new Falha('só abro endereços http e https');
  spawn('rundll32.exe', ['url.dll,FileProtocolHandler', u], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  return { ok: true };
});

p.run();
