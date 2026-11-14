// Bluetego: localizar uma empresa pelo nome e pela cidade ("Oficina de Costura Neca tramandai"), como o Google faz:
// separa a cidade (lista de municípios do IBGE), procura na web (DuckDuckGo, Bing de reserva e, com a chave gratuita
// no Cofre, o Brave), fica só com as páginas que citam o nome inteiro, lê os dados estruturados (schema.org) das
// páginas de diretório (telefone, endereço com CEP, coordenadas, perfis) e confere na Receita os CNPJs achados: só
// entra o CNPJ cuja cidade bate e cujo nome parece o mesmo.
import { normalizar, extrair, cnpjValido } from './entidades.mjs';
import { buscaWeb, lerJsonLd, contatosDaPagina } from './transformacoes.mjs';

const ent = (tipo, valor, ligacao, extra = {}) => ({ tipo, valor: normalizar(tipo, valor), ligacao, ...extra });
const unicos = (lista) => { const v = new Set(); return lista.filter((e) => { const k = e.tipo + ':' + e.valor + ':' + (e.de ? e.de.valor : ''); if (!e.valor || v.has(k)) return false; v.add(k); return true; }); };
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'a', 'o', 'the', 'and', 'ltda', 'me', 'epp', 'sa', 'cia', 'eireli']);
export const palavras = (s) => semAcento(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((p) => p.length > 1 && !VAZIAS.has(p));
const SOCIAL = /^https?:\/\/(?:www\.|m\.|pt-br\.)?(facebook|instagram|linkedin|tiktok|x|twitter|youtube)\.com\/(?!sharer|share|hashtag|tag\/|p\/|reel|watch|search)[^?#]+/i;
// o perfil sem a subpágina: facebook.com/loja/about e facebook.com/loja são o mesmo
const perfil = (u) => u.replace(/[?#].*$/, '').replace(/\/(about|photos|posts|videos|reviews|events|mentions|followers|reels|community)(\/.*)?$/i, '').replace(/\/$/, '');
// páginas de hashtag e de busca citam o nome sem serem da empresa
const LISTAGEM = /\/(tag|hashtag|explore|search|busca|discover)\//i;
const UFS = new Set('ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to'.split(' '));

// ---------- a cidade no fim do texto (pela lista de municípios do IBGE) ----------
let MUNICIPIOS = null;
async function municipios(ctx) {
  if (MUNICIPIOS && Date.now() - MUNICIPIOS.em < 30 * 86400000) return MUNICIPIOS.v;
  const l = await ctx.json('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado', { timeout: 40000 });
  const m = new Map();
  for (const x of l || []) { const k = semAcento(x['municipio-nome']); (m.get(k) || m.set(k, []).get(k)).push({ nome: x['municipio-nome'], uf: x['UF-sigla'] }); }
  MUNICIPIOS = { em: Date.now(), v: m };
  return m;
}
export function separarCidade(texto, mapa) {
  let ws = String(texto).trim().replace(/[,;]/g, ' ').split(/\s+/).filter((w) => w && w !== '-');
  let uf = '';
  if (ws.length > 2 && UFS.has(semAcento(ws[ws.length - 1]).replace(/[^a-z]/g, ''))) uf = ws.pop().replace(/[^A-Za-z]/g, '').toUpperCase();
  // a cidade mais longa que fecha o texto ("Capão da Canoa" antes de "Canoa"); o nome do negócio fica com o resto
  for (let k = Math.min(5, ws.length - 1); k >= 1; k--) {
    const cand = mapa.get(semAcento(ws.slice(-k).join(' ')));
    if (!cand) continue;
    const c = cand.find((x) => !uf || x.uf === uf) || (uf ? null : cand[0]);
    if (!c) continue;
    return { nome: ws.slice(0, -k).join(' '), cidade: c.nome, uf: c.uf, outras: uf ? [] : cand.filter((x) => x !== c).map((x) => x.uf) };
  }
  return { nome: ws.join(' '), cidade: '', uf, outras: [] };
}

// a página cita o nome inteiro (todas as palavras, em qualquer ordem; o endereço da página também conta)
const alvoDe = (r) => { const t = semAcento(`${r.titulo} ${r.trecho} ${decodeURIComponent(String(r.url).replace(/%(?![0-9a-f]{2})/gi, '')).replace(/[-_/.]+/g, ' ')}`); return { t, junto: t.replace(/\s+/g, '') }; };
export const citaNome = (r, nome) => { const a = alvoDe(r), ps = palavras(nome); return ps.length > 0 && ps.every((p) => a.t.includes(p) || a.junto.includes(p)); };
// a cidade conta só fora de um município maior que a contém ("Osório" dentro de "Pedro Osório" é outra cidade)
export const citaCidade = (r, cidade, maiores = []) => {
  if (!cidade) return true;
  let j = alvoDe(r).junto;
  for (const m of maiores) j = j.split(m).join(' ');
  return j.includes(semAcento(cidade).replace(/\s+/g, ''));
};
const municipiosQueContem = (cidade, mapa) => { const c = semAcento(cidade); return cidade ? [...mapa.keys()].filter((k) => k !== c && ` ${k} `.includes(` ${c} `)).map((k) => k.replace(/\s+/g, '')) : []; };
// endereço escrito no trecho: "R. Madalena da Conceição, 365"
const ENDERECO = /\b(R\s?\.|Rua|Av\s?\.?|Avenida|Alameda|Al\s?\.|Travessa|Tv\s?\.|Estrada|Rodovia|Rod\s?\.|Praça|Pça\s?\.?)\s+[A-ZÀ-Úa-zà-ú0-9 .'ºª-]{2,60}?,?\s*(?:n[ºo°.]?\s*)?\d{1,5}\b/g;
const nomeParecido = (nome, outro) => { const ps = palavras(nome), a = new Set(palavras(outro)); return ps.length ? ps.filter((p) => a.has(p)).length / ps.length : 0; };

async function brave(ctx, q) {
  try {
    const r = await ctx.cofre(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&country=BR&search_lang=pt-br&count=20`, { 'X-Subscription-Token': '{{vault:bluetego.brave}}', accept: 'application/json' });
    if (!r.ok) return null;
    const j = await r.json();
    return ((j.web && j.web.results) || []).map((x) => ({ url: x.url, titulo: String(x.title || '').replace(/<[^>]+>/g, ''), trecho: String(x.description || '').replace(/<[^>]+>/g, '') }));
  } catch { return null; } // sem a chave (opcional), segue só com o DuckDuckGo e o Bing
}

export async function localizarEmpresa(ctx, valor) {
  const mapa = await municipios(ctx).catch(() => new Map());
  const { nome, cidade, uf, outras } = separarCidade(valor, mapa);
  if (palavras(nome).length < 1) return { entidades: [], aviso: 'Escreva o nome da empresa (e a cidade, se souber).' };
  const onde = cidade ? `${cidade} ${uf}` : '';
  // primeiro o nome exato com a cidade; depois o nome com "CNPJ" (traz as páginas de cadastro)
  const consultas = [`"${nome}" ${onde}`.trim(), `${nome} ${onde} CNPJ`.trim()];
  const achados = new Map();
  let bloqueado = false, usouBrave = false;
  for (const q of consultas) {
    const [w, b] = await Promise.all([buscaWeb(ctx, q).catch(() => ({ res: [], bloqueado: true })), brave(ctx, q)]);
    bloqueado = bloqueado || w.bloqueado;
    if (b) usouBrave = true;
    for (const r of [...(b || []), ...w.res]) if (r && r.url && !achados.has(r.url.replace(/[?#].*$/, ''))) achados.set(r.url.replace(/[?#].*$/, ''), r);
  }
  const todos = [...achados.values()];
  // só o que cita o nome inteiro; quem cita também a cidade vem primeiro
  const maiores = municipiosQueContem(cidade, mapa);
  const relevantes = todos.filter((r) => citaNome(r, nome)).map((r) => ({ ...r, naCidade: citaCidade(r, cidade, maiores) })).sort((a, b) => Number(b.naCidade) - Number(a.naCidade));
  const daCidade = cidade ? relevantes.filter((r) => r.naCidade) : relevantes;
  // com a cidade informada, página de outra cidade não entra no grafo (seria outra empresa com o mesmo nome)
  const base = daCidade;
  const out = [], props = {}, enderecos = new Map(), telefones = new Map(), cnpjs = new Set();
  const conta = (m, k, fonte) => { if (!k) return; const x = m.get(k) || { n: 0, fontes: new Set() }; x.n++; x.fontes.add(fonte); m.set(k, x); };
  for (const r of base) {
    const host = (() => { try { return new URL(r.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    if (SOCIAL.test(r.url)) out.push(ent('conta', perfil(r.url), 'perfil da empresa (pela busca)'));
    for (const m of `${r.titulo} ${r.trecho}`.matchAll(ENDERECO)) conta(enderecos, m[0].replace(/\s+\./g, '.').replace(/\s+/g, ' ').trim(), host);
    for (const e of extrair(`${r.titulo} ${r.trecho}`)) { if (e.tipo === 'telefone' && e.valor.replace(/\D/g, '').length >= 10) conta(telefones, e.valor, host); if (e.tipo === 'cnpj') cnpjs.add(e.valor); }
    const d = (String(r.url).match(/\b\d{14}\b/) || [])[0];
    if (d && cnpjValido(d)) cnpjs.add(normalizar('cnpj', d));
  }
  // as páginas de diretório publicam a ficha da empresa em schema.org: telefone inteiro, endereço com CEP, mapa
  let site = '', geo = null;
  const paginas = base.filter((r) => !SOCIAL.test(r.url) && !LISTAGEM.test(r.url)).slice(0, 4);
  await Promise.all(paginas.map(async (r) => {
    const p = await ctx.pagina(r.url, { navegador: true, timeout: 20000 }).catch(() => null);
    if (!p || p.status >= 400) return;
    const host = new URL(r.url).hostname.replace(/^www\./, '');
    let fichas = 0;
    for (const o of lerJsonLd(p.texto)) {
      if (!o.name || nomeParecido(nome, o.name) < 0.6) continue;
      fichas++;
      for (const t of [].concat(o.telephone || []).filter((x) => typeof x === 'string')) conta(telefones, normalizar('telefone', t), host);
      const a = o.address && typeof o.address === 'object' ? [o.address.streetAddress, o.address.addressLocality, o.address.postalCode].filter((x) => typeof x === 'string' && x.trim()).join(', ') : typeof o.address === 'string' ? o.address : '';
      if (a) conta(enderecos, a, host);
      if (o.geo && o.geo.latitude && !geo) geo = { lat: o.geo.latitude, lon: o.geo.longitude };
      if (typeof o.taxID === 'string' && cnpjValido(o.taxID)) cnpjs.add(normalizar('cnpj', o.taxID));
      for (const s of [].concat(o.sameAs || []).filter((x) => typeof x === 'string' && SOCIAL.test(x))) out.push(ent('conta', perfil(s), 'perfil da empresa (pela ficha do diretório)'));
      if (typeof o.url === 'string' && /^https?:/.test(o.url) && !o.url.includes(host) && !SOCIAL.test(o.url)) site = o.url;
    }
    // sem ficha estruturada: os telefones da página, se ela é a ficha da empresa (uma listagem traz dezenas de números)
    if (!fichas) {
      const c = contatosDaPagina(p.texto, p.url || r.url);
      const tels = [...new Set(c.telefones.map((t) => normalizar('telefone', t)).filter((t) => t.replace(/\D/g, '').length >= 10))];
      if (tels.length && tels.length <= 2) for (const t of tels) conta(telefones, t, host);
      if (c.enderecos.length === 1) conta(enderecos, c.enderecos[0], host);
    }
  }));
  // o endereço e o telefone mais citados (e de mais de um site) primeiro
  const ordena = (m) => [...m.entries()].sort((a, b) => b[1].fontes.size - a[1].fontes.size || b[1].n - a[1].n);
  const ends = ordena(enderecos);
  // o endereço com CEP (da ficha) representa os outros do mesmo logradouro
  const principal = ends.find(([e]) => /\d{5}-?\d{3}/.test(e)) || ends[0];
  if (principal) out.push(ent('local', principal[0], `endereço da empresa (${principal[1].fontes.size} ${principal[1].fontes.size === 1 ? 'site' : 'sites'})`, { props: { fontes: [...principal[1].fontes].join(', '), ...(geo ? { coordenadas: `${geo.lat}, ${geo.lon}`, mapa: `https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lon}#map=18/${geo.lat}/${geo.lon}` } : {}) } }));
  for (const [t, x] of ordena(telefones).slice(0, 3)) out.push(ent('telefone', t, `telefone da empresa (${x.fontes.size} ${x.fontes.size === 1 ? 'site' : 'sites'})`, { props: { fontes: [...x.fontes].join(', ') } }));
  if (site) out.push(ent('url', site, 'site da empresa (pela ficha do diretório)'));
  // CNPJ: só o que a Receita confirma (mesma cidade e nome parecido)
  const conferidos = [];
  for (const c of [...cnpjs].slice(0, 5)) {
    const d = await ctx.json(`https://brasilapi.com.br/api/cnpj/v1/${c.replace(/\D/g, '')}`, { nulo404: true, timeout: 20000 }).catch(() => null);
    if (!d) continue;
    const mesmaCidade = !cidade || semAcento(d.municipio) === semAcento(cidade);
    const parecido = Math.max(nomeParecido(nome, d.razao_social), nomeParecido(nome, d.nome_fantasia || ''));
    if (mesmaCidade && parecido >= 0.5) conferidos.push({ c, d, parecido });
  }
  for (const { c, d, parecido } of conferidos.sort((a, b) => b.parecido - a.parecido).slice(0, 2)) out.push(ent('cnpj', c, `CNPJ provável (a Receita confere ${cidade ? 'a cidade e ' : ''}o nome)`, { rotulo: d.nome_fantasia || d.razao_social, props: { 'razão social': d.razao_social || '', 'nome fantasia': d.nome_fantasia || '', situação: d.descricao_situacao_cadastral || '', confiança: parecido >= 0.99 ? 'alta' : 'média' } }));
  for (const r of base.filter((r) => !SOCIAL.test(r.url) && !LISTAGEM.test(r.url)).slice(0, 5)) { let h = ''; try { h = new URL(r.url).hostname.replace(/^www\./, ''); } catch {} out.push(ent('url', r.url, 'página que cita a empresa', { rotulo: `${h} · ${String(r.titulo).slice(0, 40)}` })); }
  if (cidade) props['cidade procurada'] = `${cidade} - ${uf}${outras.length ? ` (há cidade com o mesmo nome em ${outras.join(', ')}: escreva a UF no fim para escolher)` : ''}`;
  props['nome procurado'] = nome;
  props['páginas que citam a empresa'] = `${base.length} de ${todos.length} resultados`;
  const fora = relevantes.filter((r) => !r.naCidade);
  // citam o nome mas não a cidade: outra empresa com o mesmo nome, ou a mesma num trecho que cortou a cidade
  if (cidade && fora.length) props['citam o nome sem citar a cidade'] = fora.slice(0, 3).map((r) => String(r.titulo).slice(0, 70)).join(' · ');
  props.CNPJ = conferidos.length ? `${conferidos.length} ${conferidos.length === 1 ? 'confere' : 'conferem'} na Receita` : cnpjs.size ? `${cnpjs.size} achados na busca, nenhum confere com o nome e a cidade (negócio informal, MEI com o nome do dono ou outro nome)` : 'nenhum na busca';
  props.buscadores = usouBrave ? 'Brave, DuckDuckGo/Bing' : 'DuckDuckGo/Bing (guarde a chave gratuita do Brave no Cofre para buscas melhores)';
  props['abrir a busca no navegador'] = `https://duckduckgo.com/?q=${encodeURIComponent(consultas[0])}`;
  // buscador bloqueado: o Bing de reserva costuma trazer páginas sem relação, então "nada" aqui não quer dizer nada
  const aviso = base.length ? '' : bloqueado && !usouBrave ? 'O DuckDuckGo pediu verificação de robô (muitas buscas seguidas deste PC) e o Bing de reserva não trouxe páginas da empresa. Tente daqui a alguns minutos, ou guarde a chave gratuita do Brave Search no Cofre (bluetego.brave).' : fora.length ? `Nenhuma página cita "${nome}" junto com ${cidade}; veja "citam o nome sem citar a cidade" nas propriedades.` : `Nenhuma página cita "${nome}"${cidade ? ` em ${cidade}` : ''}. Confira a grafia, ou abra a busca no navegador pelas propriedades.`;
  if (bloqueado && !usouBrave) props.buscadores = 'DuckDuckGo bloqueou; Bing de reserva (guarde a chave gratuita do Brave no Cofre para não depender deles)';
  return { entidades: unicos(out), props, aviso };
}
