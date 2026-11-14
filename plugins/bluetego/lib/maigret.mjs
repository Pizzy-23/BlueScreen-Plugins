// Bluetego: o nome de usuário em até 2.434 sites, com as regras de detecção do Maigret (MIT, vendor/maigret).
// Cada site diz como saber se o perfil existe: o status HTTP, um texto na página ou se houve redirecionamento.
// Um achado só vale depois de reconferido com um nome que o próprio site garante não existir: se o site responde
// "existe" também para ele, o site está quebrado (ou bloqueou) e o achado sai. Assim não entra falso positivo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ARQ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'maigret', 'sites.json');
const ADULTO = /^(porn|nsfw|adult|erotic|sex|xxx|webcam|escort)$/i;
let base = null;
export function sitesMaigret() {
  if (!base) base = JSON.parse(fs.readFileSync(ARQ, 'utf8')).sites.filter((s) => !(s.t || []).some((t) => ADULTO.test(t)));
  return base;
}

// confere um site para um nome: true (existe), false (não existe) ou null (não deu para saber: erro, bloqueio, captcha)
export async function confere(ctx, s, nome) {
  if (s.r) { try { if (!new RegExp(s.r).test(nome)) return false; } catch {} }
  const url = (s.p || s.u).replace(/\{username\}/g, encodeURIComponent(nome));
  let r;
  try { r = await ctx.pagina(url, { navegador: true, seguir: s.c !== 'response_url', headers: s.h, timeout: 12000 }); } catch { return null; }
  const texto = String(r.texto || '');
  if ((s.x || []).some((e) => texto.includes(e))) return null;
  // bloqueio e limite de consultas não dizem nada sobre o perfil
  if (r.status === 429 || r.status === 503 || r.status === 403) return null;
  if (s.c === 'status_code') return r.status >= 200 && r.status < 300;
  if (s.c === 'response_url') return r.status >= 200 && r.status < 300;
  if (r.status >= 500) return null;
  const ausente = (s.a || []).some((a) => texto.includes(a));
  const presente = !(s.e || []).length || (s.e || []).some((e) => texto.includes(e));
  return !ausente && presente;
}

async function emLotes(lista, n, fn) {
  const out = new Array(lista.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => { while (i < lista.length) { const k = i++; out[k] = await fn(lista[k]); } }));
  return out;
}

// procura o nome nos sites (os mais conhecidos primeiro, até "max") e reconfere cada achado
export async function procurar(ctx, nome, opt = {}) {
  const max = Math.max(20, Math.min(opt.max || 500, 5000));
  const sites = (opt.lista || sitesMaigret()).slice(0, max);
  const primeira = await emLotes(sites, opt.paralelo || 24, async (s) => ({ s, ok: await confere(ctx, s, nome) }));
  const candidatos = primeira.filter((x) => x.ok === true);
  const reconferidos = await emLotes(candidatos, 12, async (x) => ({ ...x, falso: (await confere(ctx, x.s, x.s.z)) !== false }));
  const achados = reconferidos.filter((x) => !x.falso).map(({ s }) => ({ site: s.n, url: s.u.replace(/\{username\}/g, encodeURIComponent(nome)), tags: s.t || [] }));
  return {
    achados,
    conferidos: sites.length,
    semResposta: primeira.filter((x) => x.ok === null).length,
    descartados: reconferidos.filter((x) => x.falso).map((x) => x.s.n),
  };
}
