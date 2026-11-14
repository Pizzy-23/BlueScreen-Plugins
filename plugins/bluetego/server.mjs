// Bluetego: servidor do plugin. Roda as transformações (a página não consegue: CORS, e a rede fica num lugar só),
// guarda as respostas por alguns minutos para não repetir consultas e abre links no navegador.
// As investigações não passam por aqui: a página grava direto em plugin.files.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { TIPOS, detectar, extrair, normalizar, chave, tipoValido } from './lib/entidades.mjs';
import { TRANSFORMACOES, rodar, Falha } from './lib/transformacoes.mjs';
import { MAQUINAS } from './lib/maquinas.mjs';
import { pensar } from './lib/pistas.mjs';
import { montarPedido, lerResposta } from './lib/ia.mjs';

const require = createRequire(import.meta.url);
const { Plugin } = require(path.join(process.env.BLUESCREEN_SDK, 'bluescreen.js'));
const p = new Plugin();
const AGENTE = 'Bluetego/0.2 (BlueScreen; +https://github.com/martindevbr/BlueScreen-Plugins)';
// busca na web e páginas que só respondem a navegador (DuckDuckGo, Telegram, Steam)
const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAX_PAGINA = 2_000_000;

// ---------- rede ----------
// disjuntor: um site fora do ar faz cada consulta seguinte esperar o tempo inteiro (30 subdomínios × 25 s). Depois de
// uma falha de conexão, o mesmo site falha na hora por 2 minutos, com o motivo
const FORA = new Map();
async function pedir(url, opt = {}) {
  let host = url;
  try { host = new URL(url).host; } catch { throw new Falha('endereço inválido: ' + url); }
  const fora = FORA.get(host);
  if (fora && Date.now() < fora.ate) throw new Falha(`${fora.motivo} (pulado: tento de novo às ${new Date(fora.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})`, { status: 503 });
  try {
    const r = await fetch(url, { headers: { 'user-agent': AGENTE, ...(opt.headers || {}) }, redirect: opt.redirect || 'follow', signal: AbortSignal.timeout(opt.timeout || 25000) });
    FORA.delete(host);
    return r;
  } catch (e) {
    const motivo = e.name === 'TimeoutError' ? `${host} demorou demais para responder.` : `Sem conexão com ${host}.`;
    // é por site: um subdomínio do alvo que não responde só pula a si mesmo
    FORA.set(host, { ate: Date.now() + 120000, motivo });
    throw new Falha(motivo, { status: e.name === 'TimeoutError' ? 504 : 503 });
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
    const r = await pedir(url, { redirect: opt.seguir === false ? 'manual' : 'follow', timeout: opt.timeout, headers: { accept: 'text/html,*/*;q=0.8', ...(opt.navegador ? { 'user-agent': NAVEGADOR, 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7' } : {}), ...(opt.headers || {}) } });
    const headers = Object.fromEntries([...r.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));
    let texto = '';
    // texto também quando o tipo é de chave PGP ou JavaScript (o keys.openpgp.org responde application/pgp-keys)
    if (/text|html|json|xml|javascript|pgp/i.test(headers['content-type'] || '') && r.body) {
      // lê no máximo 2 MB: uma página enorme (ou um download) não trava o servidor
      const leitor = r.body.getReader(), partes = [];
      let total = 0;
      while (total < MAX_PAGINA) { const { done, value } = await leitor.read(); if (done) break; partes.push(value); total += value.length; }
      leitor.cancel().catch(() => {});
      texto = Buffer.concat(partes.map((x) => Buffer.from(x))).toString('utf8');
    } else r.body?.cancel().catch(() => {});
    return { status: r.status, url: r.url || url, headers, texto };
  },
  // arquivo inteiro (documentos para ler os metadados), até "max" bytes: maior que isso, desiste sem baixar o resto
  async binario(url, opt = {}) {
    const max = opt.max || 15_000_000;
    const r = await pedir(url, { timeout: opt.timeout || 40000, headers: { 'user-agent': NAVEGADOR, accept: '*/*' } });
    if (!r.ok || !r.body) { r.body?.cancel().catch(() => {}); return { status: r.status, tipo: '', dados: null }; }
    const tam = Number(r.headers.get('content-length') || 0);
    if (tam > max) { r.body.cancel().catch(() => {}); return { status: r.status, tipo: r.headers.get('content-type') || '', dados: null, grande: true }; }
    const leitor = r.body.getReader(), partes = [];
    let total = 0;
    while (true) { const { done, value } = await leitor.read(); if (done) break; total += value.length; if (total > max) { leitor.cancel().catch(() => {}); return { status: r.status, dados: null, grande: true }; } partes.push(value); }
    return { status: r.status, url: r.url || url, tipo: r.headers.get('content-type') || '', dados: Buffer.concat(partes.map((x) => Buffer.from(x))) };
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
  // GitHub: com o token do Cofre (5.000 consultas por hora), pelo plugin.fetch da IDE; sem ele, direto (60 por hora)
  async gh(caminho, opt = {}) {
    const url = 'https://api.github.com/' + caminho;
    const cab = { 'user-agent': AGENTE, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(opt.headers || {}) };
    if (await temTokenGithub()) {
      try {
        const r = await p.fetch(url, { headers: { ...cab, authorization: 'Bearer {{vault:bluetego.github}}' }, timeout: 25000 });
        if (r.status === 404) return null;
        if (r.status >= 200 && r.status < 300) return r.json();
        if (r.status === 401) { tokenGithub = { em: Date.now(), tem: false }; throw new Falha('O GitHub recusou o token guardado no Cofre (bluetego.github). Troque o valor no Cofre.', { status: 403, codigo: 'cofre', cofre: 'bluetego.github' }); }
        if (r.status !== 403 && r.status !== 429) throw new Falha(`api.github.com respondeu ${r.status}.`, { status: 502 });
      } catch (e) { if (e instanceof Falha) throw e; tokenGithub = { em: Date.now(), tem: false }; }
    }
    const r = await pedir(url, { headers: cab, timeout: opt.timeout });
    if (r.status === 404) return null;
    if ((r.status === 403 || r.status === 429) && r.headers.get('x-ratelimit-remaining') === '0') {
      const volta = Number(r.headers.get('x-ratelimit-reset')) * 1000;
      throw new Falha(`Acabou a cota da API do GitHub sem token (60 consultas por hora)${volta ? `, volta às ${new Date(volta).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}. Guarde um token do GitHub no Cofre (bluetego.github) para ter 5.000 por hora.`, { status: 429, codigo: 'cofre', cofre: 'bluetego.github' });
    }
    if (!r.ok) throw new Falha(`api.github.com respondeu ${r.status}.`, { status: 502 });
    return r.json();
  },
};
// se há token do GitHub liberado no Cofre: conferido a cada 5 minutos (o usuário pode guardar um a qualquer hora)
let tokenGithub = { em: 0, tem: false };
async function temTokenGithub() {
  if (Date.now() - tokenGithub.em < 5 * 60 * 1000) return tokenGithub.tem;
  let tem = false;
  try { tem = !!((await p.vault.status()) || []).find((k) => k.key === 'bluetego.github' && k.exists && k.granted); } catch {}
  tokenGithub = { em: Date.now(), tem };
  return tem;
}

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
      return Plugin.reply(e.status || 500, { error: e.message || String(e), codigo: e.codigo || '', cofre: e.cofre || '' });
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
  const cfg = await p.settings().catch(() => ({}));
  // as entidades ligadas (só as que a transformação usa, como os domínios para os e-mails prováveis)
  const vizinhos = Array.isArray(b.vizinhos) ? b.vizinhos.slice(0, 40).map((v) => ({ tipo: String(v.tipo || ''), valor: String(v.valor || '') })) : [];
  const k = [b.t, b.tipo, b.valor, lim, b.t === 'emails-provaveis' ? JSON.stringify(vizinhos) : ''].join('|');
  const guardada = CACHE.get(k);
  if (guardada && Date.now() - guardada.em < VALIDADE && !b.deNovo) return { ...guardada.v, guardada: true };
  const r = await rodar(String(b.t || ''), String(b.tipo || ''), String(b.valor || ''), { ...ctxRede, limite: lim, vizinhos, sitesAmplo: Number(cfg.sitesAmplo) || 500 }, b.completo);
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
// o grafo pensando sem IA: pistas com a ação pronta (ligar, rodar)
rota('pensar', (b) => ({ pistas: pensar(b.grafo || {}, TRANSFORMACOES, b.aprendizado || {}) }));
// IA: o pedido sai daqui (a página manda para o provedor escolhido) e a resposta volta para ser conferida
rota('ia-pedido', (b) => montarPedido({ ...b, transformacoes: TRANSFORMACOES.filter((t) => !t.cofre) }));
rota('ia-ler', (b) => lerResposta(b.texto, b.mapa || {}, b.grafo || {}, TRANSFORMACOES));
rota('abrir', (b) => {
  const u = String(b.url || '');
  if (!/^https?:\/\/[^\s"]+$/i.test(u)) throw new Falha('só abro endereços http e https');
  spawn('rundll32.exe', ['url.dll,FileProtocolHandler', u], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  return { ok: true };
});

p.run();
