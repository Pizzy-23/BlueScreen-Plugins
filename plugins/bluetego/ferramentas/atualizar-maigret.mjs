#!/usr/bin/env node
// Atualiza vendor/maigret/sites.json a partir da base do Maigret (https://github.com/soxoj/maigret, licença MIT).
// Fica só o que o Bluetego sabe conferir sem navegador e sem falso positivo: sites ativos, com regra explícita
// (status HTTP, texto na página ou redirecionamento), GET simples, sem proteção anti-robô, e com um usuário que existe
// e um que não existe (o Bluetego reconfere cada achado com o que não existe).
//   node ferramentas/atualizar-maigret.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, 'vendor', 'maigret');
const BASE = 'https://raw.githubusercontent.com/soxoj/maigret/main/';
// os 18 sites que o Bluetego confere pela API (com os dados do perfil) não se repetem aqui
const JA_TEM = /(^|\.)(github\.com|gitlab\.com|reddit\.com|keybase\.io|news\.ycombinator\.com|dev\.to|hub\.docker\.com|chess\.com|lichess\.org|bsky\.app|mastodon\.social|duolingo\.com|wikipedia\.org|codewars\.com|speedrun\.com|gravatar\.com|steamcommunity\.com|t\.me)$/i;

const host = (u) => { try { return new URL(String(u).replace('{username}', 'x').replace(/\{urlMain\}/, 'https://x.com').replace(/\{urlSubpath\}/, '')).hostname.replace(/^www\./, ''); } catch { return ''; } };
const dados = await (await fetch(BASE + 'maigret/resources/data.json')).json();
const licenca = await (await fetch(BASE + 'LICENSE')).text();
const sites = [];
for (const [nome, s] of Object.entries(dados.sites)) {
  if (s.disabled || !['status_code', 'message', 'response_url'].includes(s.checkType)) continue;
  if (!s.url || !s.usernameClaimed || !s.usernameUnclaimed || s.protection || s.requestMethod || s.requestPayload || s.activation || s.engine) continue;
  if (s.type && s.type !== 'username') continue;
  const url = s.url.replace('{urlMain}', (s.urlMain || '').replace(/\/$/, '')).replace('{urlSubpath}', s.urlSubpath || '');
  const sonda = s.urlProbe ? s.urlProbe.replace('{urlMain}', (s.urlMain || '').replace(/\/$/, '')).replace('{urlSubpath}', s.urlSubpath || '') : '';
  if (!/^https?:\/\/.*\{username\}/.test(url) || JA_TEM.test(host(url))) continue;
  if (s.checkType === 'message' && !(s.absenceStrs || []).length && !(s.presenseStrs || []).length) continue;
  sites.push({
    n: nome, u: url, ...(sonda && sonda !== url ? { p: sonda } : {}), c: s.checkType,
    ...(s.absenceStrs && s.absenceStrs.length ? { a: s.absenceStrs } : {}), ...(s.presenseStrs && s.presenseStrs.length ? { e: s.presenseStrs } : {}),
    ...(s.errors && Object.keys(s.errors).length ? { x: Object.keys(s.errors) } : {}), ...(s.regexCheck ? { r: s.regexCheck } : {}),
    ...(s.headers ? { h: s.headers } : {}), ...(s.tags && s.tags.length ? { t: s.tags } : {}), k: s.alexaRank || 9e9, y: s.usernameClaimed, z: s.usernameUnclaimed,
  });
}
// os mais conhecidos primeiro: a busca ampla confere do topo da lista para baixo
sites.sort((a, b) => a.k - b.k);
fs.mkdirSync(DESTINO, { recursive: true });
fs.writeFileSync(path.join(DESTINO, 'sites.json'), JSON.stringify({ fonte: 'https://github.com/soxoj/maigret', gerado: new Date().toISOString().slice(0, 10), sites }));
fs.writeFileSync(path.join(DESTINO, 'LICENSE'), licenca);
console.log(`${sites.length} sites em vendor/maigret/sites.json (${Math.round(fs.statSync(path.join(DESTINO, 'sites.json')).size / 1024)} KB)`);
