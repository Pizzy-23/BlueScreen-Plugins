// Bluetego: as transformações. Cada uma recebe o valor de uma entidade e devolve entidades novas ligadas a ela
// (e propriedades para a própria entidade). Só usam fontes públicas e gratuitas, sem conta; o VirusTotal é opcional,
// com a chave guardada no Cofre da IDE. A rede chega por ctx (o servidor passa o fetch de verdade, os testes um falso).
//
// ctx.json(url, { headers, nulo404 })  -> objeto (ou null em 404 com nulo404)
// ctx.pagina(url, { seguir })          -> { status, url, headers, texto } (seguir: false devolve o redirecionamento)
// ctx.cofre(url, headers)              -> { status, ok, json() } pelo plugin.fetch da IDE, com {{vault:..}} trocado lá
// ctx.limite                           -> no máximo quantas entidades novas por transformação
import crypto from 'node:crypto';
import tls from 'node:tls';
import { metadados } from './metadados.mjs';
import { procurar as procurarMaigret, sitesMaigret } from './maigret.mjs';
import { numeracao } from './numeracao.mjs';
import { normalizar, chave, cnpjValido, regiaoCPF, telefoneInfo, nomeReverso, extrair, apelidosDeNome, ehIP, detectar } from './entidades.mjs';

export class Falha extends Error {
  constructor(msg, extra = {}) { super(msg); Object.assign(this, { status: 400 }, extra); }
}
const ent = (tipo, valor, ligacao, extra = {}) => ({ tipo, valor: normalizar(tipo, valor), ligacao, ...extra });
const unicos = (lista) => { const v = new Set(); return lista.filter((e) => { const k = e.tipo + ':' + e.valor + ':' + (e.de ? e.de.valor : ''); if (!e.valor || v.has(k)) return false; v.add(k); return true; }); };
const corta = (lista, ctx, total = lista.length) => {
  const max = Math.max(1, Number(ctx.limite) || 40);
  return { entidades: lista.slice(0, max), aviso: total > max ? `Mostrando ${max} de ${total}. Aumente o limite nas configurações para ver mais.` : '' };
};
const data = (s) => (s ? String(s).slice(0, 10) : '');

// ---------- DNS (DNS sobre HTTPS do Google, com o da Cloudflare de reserva) ----------
const TIPOS_DNS = { A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16, AAAA: 28, CAA: 257 };
export async function dns(ctx, nome, tipo) {
  const q = `name=${encodeURIComponent(nome)}&type=${tipo}`;
  let r;
  try { r = await ctx.json(`https://dns.google/resolve?${q}`); } catch { r = await ctx.json(`https://cloudflare-dns.com/dns-query?${q}`, { headers: { accept: 'application/dns-json' } }); }
  if (r.Status === 3) return [];
  if (r.Status && r.Status !== 0) throw new Falha(`o DNS respondeu com erro (${r.Status}) para ${nome}`);
  return (r.Answer || []).filter((a) => a.type === TIPOS_DNS[tipo]).map((a) => String(a.data));
}
const semPonto = (s) => s.replace(/\.$/, '');
const tiraAspas = (s) => s.replace(/^"|"$/g, '').replace(/"\s*"/g, '');

// ---------- RDAP (o WHOIS com JSON) ----------
function vcard(e) {
  const out = {};
  for (const [nome, , , valor] of (e.vcardArray && e.vcardArray[1]) || []) {
    if (nome === 'fn' && valor) out.nome = String(valor).trim();
    if (nome === 'org' && valor) out.org = String(Array.isArray(valor) ? valor[0] : valor).trim();
    if (nome === 'email' && valor) out.email = String(valor).trim();
    if (nome === 'tel' && valor) out.tel = String(valor).replace(/^tel:/, '').trim();
    if (nome === 'kind' && valor) out.tipo = String(valor).toLowerCase();
    if (nome === 'adr') { const a = Array.isArray(valor) ? valor.flat().filter(Boolean) : []; if (a.length) out.endereco = a.join(', '); }
  }
  return out;
}
const OCULTO = /redacted|privacy|private|withheld|not disclosed|data protected|gdpr|proxy|whoisguard|contact privacy|domains by proxy/i;
// as entidades de contato (registrante, admin, abuso, registrador), também as aninhadas
function contatos(rdap) {
  const out = [];
  // o registro.br põe o CNPJ do titular em publicIds
  const visitar = (lista) => { for (const e of lista || []) { out.push({ papeis: e.roles || [], ...vcard(e), handle: e.handle || '', cnpj: ((e.publicIds || []).find((x) => /cnpj/i.test(x.type)) || {}).identifier || '' }); visitar(e.entities); } };
  visitar(rdap.entities);
  return out;
}
const FUNCAO = /^(abuse|noc|admin(istrator)?|tech(nical)?|hostmaster|support|security|network|dns|billing|registry|domain)\b/i;
const EMPRESA = /\b(ltda|s\.?\/?a\.?|eireli|me|epp|inc|llc|ltd|limited|gmbh|ag|corp(oration)?|co\.|company|group|grupo|holdings?|associa[çc][ãa]o|funda[çc][ãa]o|instituto|universidade|minist[ée]rio|prefeitura|governo|n[úu]cleo|registro)\b\.?/i;
const PAPEL = { registrant: 'registrante', administrative: 'contato administrativo', technical: 'contato técnico', abuse: 'contato de abuso', registrar: 'registrador', billing: 'cobrança', noc: 'NOC' };
function entidadesDeContatos(cs) {
  const out = [];
  for (const c of cs) {
    const papel = c.papeis.map((p) => PAPEL[p] || p).join(', ') || 'contato';
    // sem "kind", o nome diz: registrante pessoa física (comum no registro.br) é pessoa; "Ltda", "Inc." é empresa
    const grupo = c.tipo === 'org' || c.tipo === 'group' || (c.tipo !== 'individual' && EMPRESA.test(c.nome || ''));
    const nomeOrg = c.org || (grupo || c.papeis.includes('registrar') ? c.nome : '');
    if (nomeOrg && !OCULTO.test(nomeOrg)) out.push(ent('organizacao', nomeOrg, papel));
    // "Abuse", "NOC", "Hostmaster": nome de função, não de pessoa
    if (c.nome && c.nome !== nomeOrg && !OCULTO.test(c.nome) && !grupo && !c.papeis.includes('registrar') && !FUNCAO.test(c.nome)) out.push(ent('pessoa', c.nome, papel));
    if (c.email && !OCULTO.test(c.email) && /@/.test(c.email)) out.push(ent('email', c.email, papel));
    if (c.tel && /\d{6,}/.test(c.tel.replace(/\D/g, ''))) out.push(ent('telefone', c.tel, papel));
    if (c.cnpj && cnpjValido(c.cnpj)) out.push(ent('cnpj', c.cnpj, `CNPJ do ${papel}`));
  }
  // o registro.br marca todo titular como "org", mesmo pessoa física: se o nome também aparece como pessoa, é pessoa
  const pessoas = new Set(out.filter((e) => e.tipo === 'pessoa').map((e) => e.valor.toLowerCase()));
  return out.filter((e) => !(e.tipo === 'organizacao' && pessoas.has(e.valor.toLowerCase())));
}
const eventos = (rdap) => Object.fromEntries((rdap.events || []).map((e) => [e.eventAction, data(e.eventDate)]));

export async function rdapDominio(ctx, dominio) {
  const r = await ctx.json(`https://rdap.org/domain/${encodeURIComponent(dominio)}`, { nulo404: true });
  if (!r) return { entidades: [], aviso: 'O RDAP não conhece este domínio (TLD sem RDAP ou domínio não registrado).' };
  const ev = eventos(r);
  const props = { registro: ev.registration || '', expira: ev.expiration || '', 'alterado em': ev['last changed'] || '', situação: (r.status || []).join(', ') };
  const ns = (r.nameservers || []).map((n) => ent('dominio', n.ldhName || '', 'servidor de nomes'));
  return { entidades: unicos([...entidadesDeContatos(contatos(r)), ...ns]), props };
}
export async function rdapIP(ctx, ip) {
  const r = await ctx.json(`https://rdap.org/ip/${ip}`, { nulo404: true });
  if (!r) return { entidades: [], aviso: 'O RDAP não achou o bloco deste endereço.' };
  const cidrs = (r.cidr0_cidrs || []).map((c) => `${c.v4prefix || c.v6prefix}/${c.length}`);
  const props = { bloco: r.name || '', handle: r.handle || '', país: r.country || '', faixa: r.startAddress ? `${r.startAddress} – ${r.endAddress}` : '', tipo: r.type || '' };
  const redes = /\//.test(ip) ? [] : cidrs.map((c) => ent('rede', c, 'bloco registrado'));
  return { entidades: unicos([...redes, ...entidadesDeContatos(contatos(r))]), props };
}

// ---------- RIPEstat (ASN, prefixos) ----------
const ripe = (ctx, rec, r) => ctx.json(`https://stat.ripe.net/data/${rec}/data.json?resource=${encodeURIComponent(r)}&sourceapp=bluetego`);
async function donoAS(ctx, asn) {
  try { return (await ripe(ctx, 'as-overview', asn)).data.holder || ''; } catch { return ''; }
}
export async function ipParaASN(ctx, ip) {
  let d;
  try { d = (await ripe(ctx, 'network-info', ip)).data || {}; } catch {
    // reserva: o Team Cymru responde por DNS ("15169 | 8.8.8.0/24 | US | arin | 1992-12-01")
    const t = (await dns(ctx, nomeReverso(ip).replace(/\.(in-addr|ip6)\.arpa$/, ip.includes(':') ? '.origin6.asn.cymru.com' : '.origin.asn.cymru.com'), 'TXT').catch(() => []))[0] || '';
    const [asn, prefixo] = tiraAspas(t).split('|').map((x) => x.trim());
    d = asn ? { asns: asn.split(' ').filter(Boolean), prefix: prefixo } : {};
  }
  if (!d.asns || !d.asns.length) return { entidades: [], aviso: 'Este endereço não é anunciado por nenhum sistema autônomo (IP privado ou reservado?).' };
  const out = [];
  const rede = d.prefix ? ent('rede', d.prefix, 'anunciado no prefixo') : null;
  if (rede) out.push(rede);
  for (const n of d.asns) {
    const dono = await donoAS(ctx, 'AS' + n);
    out.push(ent('asn', 'AS' + n, rede ? 'anunciado por' : 'sistema autônomo', { rotulo: dono ? `AS${n} · ${dono.split(/[\s,-]/)[0]}` : '', props: { dono }, de: rede ? { tipo: 'rede', valor: rede.valor } : undefined }));
  }
  return { entidades: out };
}
export async function asnPrefixos(ctx, asn) {
  const d = (await ripe(ctx, 'announced-prefixes', asn)).data || {};
  const lista = (d.prefixes || []).map((p) => ent('rede', p.prefix, 'anuncia'));
  return corta(lista, ctx);
}
export async function asnDono(ctx, asn) {
  const d = (await ripe(ctx, 'as-overview', asn)).data || {};
  if (!d.holder) return { entidades: [], aviso: 'O RIPEstat não conhece este sistema autônomo.' };
  // "GOOGLE - Google LLC" -> a organização é a parte depois do traço
  const org = d.holder.includes(' - ') ? d.holder.split(' - ').slice(1).join(' - ') : d.holder;
  return { entidades: [ent('organizacao', org.replace(/,\s*[A-Z]{2}$/, ''), 'operado por')], props: { dono: d.holder, anunciado: d.announced ? 'sim' : 'não' } };
}

// ---------- IP ----------
export async function geo(ctx, ip) {
  const d = await ctx.json(`https://ipwho.is/${ip}`);
  if (!d || d.success === false) return { entidades: [], aviso: d && d.message ? `ipwho.is: ${d.message}` : 'Sem localização para este endereço.' };
  const lugar = [d.city, d.region, d.country].filter(Boolean).join(', ');
  const c = d.connection || {};
  const out = [];
  if (lugar) out.push(ent('local', lugar, 'localizado em', { props: { latitude: d.latitude, longitude: d.longitude, mapa: d.latitude != null ? `https://www.openstreetmap.org/?mlat=${d.latitude}&mlon=${d.longitude}#map=10/${d.latitude}/${d.longitude}` : '' } }));
  if (c.isp || c.org) out.push(ent('organizacao', c.isp || c.org, 'provedor'));
  if (c.domain) out.push(ent('dominio', c.domain, 'domínio do provedor'));
  return { entidades: out, props: { país: d.country || '', cidade: d.city || '', provedor: c.isp || c.org || '', 'fuso horário': (d.timezone && d.timezone.id) || '', aproximado: 'a localização por IP é aproximada (cidade do provedor)' } };
}
const SERVICOS = { 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3', 111: 'RPC', 135: 'MSRPC', 139: 'NetBIOS', 143: 'IMAP', 161: 'SNMP', 389: 'LDAP', 443: 'HTTPS', 445: 'SMB', 465: 'SMTPS', 587: 'SMTP', 993: 'IMAPS', 995: 'POP3S', 1433: 'MSSQL', 1521: 'Oracle', 2049: 'NFS', 2375: 'Docker', 3306: 'MySQL', 3389: 'RDP', 5432: 'PostgreSQL', 5900: 'VNC', 5985: 'WinRM', 6379: 'Redis', 8080: 'HTTP alt', 8443: 'HTTPS alt', 9200: 'Elasticsearch', 11211: 'Memcached', 27017: 'MongoDB' };
// portas que não deveriam estar abertas para a internet
const ARRISCADAS = new Set([23, 135, 139, 445, 1433, 1521, 2375, 3306, 3389, 5432, 5900, 5985, 6379, 9200, 11211, 27017]);
export async function internetdb(ctx, ip) {
  const d = await ctx.json(`https://internetdb.shodan.io/${ip}`, { nulo404: true });
  if (!d) return { entidades: [], aviso: 'O Shodan não tem nada sobre este endereço (nenhuma porta vista).' };
  const portas = (d.ports || []).map((p) => ent('porta', `${ip}:${p}`, 'porta aberta', { rotulo: `${p}${SERVICOS[p] ? ' ' + SERVICOS[p] : ''}`, props: { porta: p, serviço: SERVICOS[p] || '', risco: ARRISCADAS.has(p) ? 'serviço que não deveria ficar exposto à internet' : '' }, alerta: ARRISCADAS.has(p) }));
  const nomes = (d.hostnames || []).map((h) => ent('dominio', h, 'nome no Shodan'));
  const cves = (d.vulns || []).map((c) => ent('cve', c, 'vulnerável a', { alerta: true }));
  const r = corta(unicos([...portas, ...cves, ...nomes]), ctx);
  return { ...r, props: { tags: (d.tags || []).join(', '), cpes: (d.cpes || []).join(', '), portas: (d.ports || []).join(', ') } };
}
export async function ptr(ctx, ip) {
  const nomes = await dns(ctx, nomeReverso(ip), 'PTR');
  return { entidades: nomes.map((n) => ent('dominio', semPonto(n), 'DNS reverso')), aviso: nomes.length ? '' : 'Este IP não tem DNS reverso.' };
}

// ---------- domínio ----------
export async function dnsIPs(ctx, dominio) {
  const [a, aaaa, cname] = await Promise.all([dns(ctx, dominio, 'A'), dns(ctx, dominio, 'AAAA').catch(() => []), dns(ctx, dominio, 'CNAME').catch(() => [])]);
  const out = [...cname.map((c) => ent('dominio', semPonto(c), 'apelido de (CNAME)')), ...[...a, ...aaaa].filter(ehIP).map((ip) => ent('ip', ip, 'resolve para'))];
  return { entidades: unicos(out), aviso: out.length ? '' : 'O domínio não resolve para nenhum IP.' };
}
export async function dnsMX(ctx, dominio) {
  const mx = await dns(ctx, dominio, 'MX');
  const out = mx.map((m) => { const [pri, host] = m.split(/\s+/); return ent('dominio', semPonto(host || pri), 'servidor de e-mail', { props: { prioridade: host ? Number(pri) : '' } }); }).filter((e) => e.valor && e.valor !== '.');
  return { entidades: unicos(out), props: { 'recebe e-mail': out.length ? 'sim' : 'não' }, aviso: out.length ? '' : 'O domínio não tem MX: não recebe e-mail.' };
}
export async function dnsNS(ctx, dominio) {
  const ns = await dns(ctx, dominio, 'NS');
  return { entidades: unicos(ns.map((n) => ent('dominio', semPonto(n), 'servidor de nomes'))), aviso: ns.length ? '' : 'Sem registros NS (talvez seja um subdomínio: tente no domínio pai).' };
}
// TXT: as verificações de serviços (Google, Microsoft, Atlassian...) e o SPF dizem quem atende a empresa
const VERIFICACOES = [[/^google-site-verification=/i, 'Google Workspace / Search Console'], [/^MS=/i, 'Microsoft 365'], [/^atlassian-domain-verification=/i, 'Atlassian'], [/^facebook-domain-verification=/i, 'Facebook'], [/^apple-domain-verification=/i, 'Apple'], [/^docusign=/i, 'DocuSign'], [/^adobe-idp-site-verification=/i, 'Adobe'], [/^stripe-verification=/i, 'Stripe'], [/^zoom-domain-verification/i, 'Zoom'], [/^slack-domain-verification/i, 'Slack'], [/^globalsign-domain-verification/i, 'GlobalSign'], [/^amazonses:/i, 'Amazon SES'], [/^hubspot-developer-verification/i, 'HubSpot'], [/^dropbox-domain-verification/i, 'Dropbox'], [/^cisco-ci-domain-verification/i, 'Cisco Webex'], [/^miro-verification/i, 'Miro'], [/^openai-domain-verification/i, 'OpenAI'], [/^anthropic-domain-verification/i, 'Anthropic'], [/^notion-domain-verification/i, 'Notion'], [/^zapier-domain-verification/i, 'Zapier'], [/^onetrust-domain-verification/i, 'OneTrust'], [/^mailru-verification/i, 'Mail.ru'], [/^yandex-verification/i, 'Yandex'], [/^teamviewer-sso-verification/i, 'TeamViewer'], [/^Sendinblue-code/i, 'Brevo (Sendinblue)'], [/^mailchimp/i, 'Mailchimp']];
export async function dnsTXT(ctx, dominio) {
  const txt = (await dns(ctx, dominio, 'TXT')).map(tiraAspas);
  const dmarc = (await dns(ctx, '_dmarc.' + dominio, 'TXT').catch(() => [])).map(tiraAspas).find((t) => /^v=DMARC1/i.test(t)) || '';
  const out = [];
  const props = { SPF: '', DMARC: dmarc || 'não tem (o domínio pode ser falsificado em e-mails)' };
  for (const t of txt) {
    if (/^v=spf1/i.test(t)) {
      props.SPF = t;
      for (const m of t.matchAll(/\binclude:([^\s]+)/gi)) out.push(ent('dominio', m[1], 'SPF autoriza'));
      for (const m of t.matchAll(/\bip4:([^\s]+)/gi)) out.push(m[1].includes('/') ? ent('rede', m[1], 'SPF autoriza') : ent('ip', m[1], 'SPF autoriza'));
      continue;
    }
    const v = VERIFICACOES.find(([re]) => re.test(t));
    if (v) out.push(ent('organizacao', v[1], 'serviço verificado (TXT)', { props: { registro: t } }));
    else out.push(ent('texto', t.length > 120 ? t.slice(0, 117) + '…' : t, 'registro TXT', { props: { completo: t } }));
  }
  return { ...corta(unicos(out), ctx), props };
}
// o site: título, tecnologia, e-mails, telefones, perfis sociais e domínios para onde ele aponta
const SOCIAIS = /^https?:\/\/(?:www\.)?(?:(?:twitter|x|github|gitlab|instagram|facebook)\.com\/|linkedin\.com\/(?:company|in|school)\/|youtube\.com\/(?:@|c\/|channel\/|user\/)|tiktok\.com\/@|t\.me\/|medium\.com\/@|mastodon\.social\/@|bsky\.app\/profile\/)[^\s"'<>/]+/i;
const IGNORAR_LINK = /(^|\.)(w3\.org|schema\.org|googleapis\.com|gstatic\.com|google-analytics\.com|googletagmanager\.com|doubleclick\.net|jsdelivr\.net|cloudflare\.com|cdnjs\.cloudflare\.com|unpkg\.com|jquery\.com|bootstrapcdn\.com|fontawesome\.com|ogp\.me|gravatar\.com|wp\.com|wordpress\.org|youtube\.com|facebook\.com|twitter\.com|x\.com|instagram\.com|linkedin\.com|github\.com|gitlab\.com|tiktok\.com|t\.me|medium\.com|mastodon\.social|bsky\.app)$/i;
export function lerPagina(html, base) {
  const s = String(html || '').slice(0, 2_000_000);
  const pega = (re) => { const m = s.match(re); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; };
  const titulo = pega(/<title[^>]*>([^<]{1,300})<\/title>/i);
  const descricao = pega(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,400})/i) || pega(/<meta[^>]+content=["']([^"']{1,400})["'][^>]+name=["']description["']/i);
  const gerador = pega(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']{1,120})/i);
  const hrefs = [...s.matchAll(/(?:href|src)=["']([^"'#\s]+)["']/gi)].map((m) => { try { return new URL(m[1].replace(/&amp;/g, '&'), base).href; } catch { return ''; } }).filter(Boolean);
  const host = (() => { try { return new URL(base).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const emails = [...new Set([...s.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => decodeURIComponent(m[1])).concat(extrair(s.replace(/<[^>]+>/g, ' ')).filter((e) => e.tipo === 'email').map((e) => e.valor)).map((e) => e.toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e) && !/\.(png|jpe?g|gif|svg|webp)$/i.test(e) && !/sentry|wixpress|example\.|@(domain|email|seudominio|yourdomain|dominio|empresa)\.com$|^(you|your|seu|seuemail|meuemail|nome|name|email|exemplo|example|teste|test|fulano)@/i.test(e)))];
  const telefones = [...new Set([...s.matchAll(/href=["']tel:([^"']+)["']/gi)].map((m) => decodeURIComponent(m[1]).trim()))];
  // perfis do próprio site (o github.com lendo o github.com) e arquivos (manifest.json, ícones) não são perfis
  const doSite = (h) => { try { const x = new URL(h).hostname.replace(/^www\./, ''); return x === host || x.endsWith('.' + host); } catch { return true; } };
  const sociais = [...new Set(hrefs.filter((h) => SOCIAIS.test(h) && !doSite(h) && !/\.(xml|json|png|jpe?g|svg|ico|css|js)$/i.test(h.replace(/[?#].*$/, ''))).map((h) => h.replace(/[?#].*$/, '').replace(/\/$/, '')))].filter((h) => !/\/(sharer|share|intent|plugins|dialog|hashtag)\b/i.test(h));
  const externos = [...new Set(hrefs.map((h) => { try { return new URL(h).hostname.toLowerCase(); } catch { return ''; } }).filter((h) => h && h.includes('.') && !ehIP(h) && h.replace(/^www\./, '') !== host && !h.endsWith('.' + host) && !IGNORAR_LINK.test(h)))];
  const internos = [...new Set(hrefs.map((h) => { try { return new URL(h).hostname.toLowerCase(); } catch { return ''; } }).filter((h) => h.endsWith('.' + host) && h !== 'www.' + host))];
  return { titulo, descricao, gerador, emails, telefones, sociais, externos, internos };
}
export async function site(ctx, dominio) {
  let r;
  try { r = await ctx.pagina(`https://${dominio}/`); } catch { r = await ctx.pagina(`http://${dominio}/`); }
  const p = lerPagina(r.texto, r.url);
  const out = [];
  if (r.url && r.url.replace(/\/$/, '') !== `https://${dominio}`) out.push(ent('url', r.url, 'site abre em'));
  for (const e of p.emails) out.push(ent('email', e, 'e-mail no site'));
  for (const t of p.telefones) out.push(ent('telefone', t, 'telefone no site'));
  for (const s of p.sociais) out.push(ent('conta', s, 'perfil no site'));
  for (const d of p.internos) out.push(ent('dominio', d, 'subdomínio citado no site'));
  for (const d of p.externos.slice(0, 25)) out.push(ent('dominio', d, 'o site aponta para'));
  const h = r.headers || {};
  const props = { título: p.titulo, descrição: p.descricao, 'status HTTP': r.status, servidor: h.server || '', 'feito com': [p.gerador, h['x-powered-by']].filter(Boolean).join(', '), HSTS: h['strict-transport-security'] ? 'sim' : 'não' };
  return { ...corta(unicos(out), ctx), props };
}
// ---------- dados de contato do site: telefones, WhatsApp, e-mails, CNPJ, endereço e redes sociais ----------
// lê a página inicial e as páginas de contato, institucionais e de privacidade linkadas nela (onde a empresa põe CNPJ e endereço)
const PAGINA_CONTATO = /contato|contact|fale|atendimento|sac\b|ouvidoria|sobre|quem-somos|about|empresa|institucional|nossa-loja|lojas|endereco|localiza|privacidade|privacy|termos|terms|lgpd|politica/i;
const LOGRADOURO = /\b(rua|r\.|avenida|av\.?|alameda|al\.|rodovia|rod\.|estrada|est\.|praça|pça\.?|travessa|tv\.|largo|via|servidão|setor|quadra|sq[ns]|shis|shin|cln|cls)\s/i;
export function textoDaPagina(html) {
  return String(html || '').slice(0, 2_000_000)
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|address|section|footer)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n');
}
// schema.org em JSON-LD: Organization, LocalBusiness, Store… com telefone, endereço, CNPJ e perfis
export function lerJsonLd(html) {
  const objs = [];
  const visita = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(visita);
    if (o.telephone || o.address || o.taxID || o.vatID || o.legalName || o.sameAs || o.contactPoint) objs.push(o);
    for (const k of ['@graph', 'publisher', 'provider', 'author', 'brand', 'seller', 'organization', 'parentOrganization']) if (o[k]) visita(o[k]);
  };
  for (const m of String(html || '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) { try { visita(JSON.parse(m[1].trim())); } catch {} }
  return objs;
}
const textoEndereco = (a) => (typeof a === 'string' ? a : a && typeof a === 'object' ? [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter((x) => typeof x === 'string' && x.trim()).join(', ') : '');
// endereço escrito na página: a linha do CEP (e a anterior, se a rua estiver nela)
export function enderecosNoTexto(texto) {
  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  const out = [];
  linhas.forEach((l, i) => {
    if (!/\b\d{5}-?\d{3}\b/.test(l)) return;
    let e = l;
    if (!LOGRADOURO.test(e) && i > 0 && LOGRADOURO.test(linhas[i - 1])) e = linhas[i - 1] + ', ' + e;
    if (!LOGRADOURO.test(e)) return;
    e = e.slice(Math.max(0, e.search(LOGRADOURO))).replace(/\s*[|•·]\s*/g, ' - ').replace(/\b(tel|telefone|fone|whatsapp|e-?mail|cnpj)\b[\s\S]*$/i, '').replace(/[\s,;–—-]+$/, '');
    if (e.length >= 12 && e.length <= 220) out.push(e);
  });
  return [...new Set(out)];
}
const PERFIL_NAO = /\/(sharer|share|intent|plugins|dialog|hashtag|p|reel|reels|tv|explore|watch|embed|status|events|groups|login|signup|search)(\/|$)|\/(sharer\.php|share\.php)/i;
const SOCIAIS_SITE = /^https?:\/\/(?:www\.|m\.|br\.|pt-br\.)?(?:(?:twitter|x|instagram|facebook|fb|pinterest|threads|kwai|vimeo|soundcloud|twitch|behance|dribbble|flickr|tumblr|reddit|spotify|discord|snapchat)\.(?:com|net|tv|gg|me)\/|linkedin\.com\/(?:company|in|school|showcase)\/|youtube\.com\/(?:@|c\/|channel\/|user\/)|tiktok\.com\/@|t\.me\/|medium\.com\/@|bsky\.app\/profile\/|threads\.net\/@)[^\s"'<>?#]+/i;
export function contatosDaPagina(html, base) {
  const p = lerPagina(html, base);
  const texto = textoDaPagina(html);
  const achados = extrair(texto, 300);
  const hrefs = [...String(html || '').matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
  const whats = [...new Set(hrefs.map((h) => { const m = h.match(/(?:wa\.me\/|whatsapp\.com\/send\/?\?(?:[^"']*&)?phone=|whatsapp:\/\/send\?(?:[^"']*&)?phone=)\+?(\d{10,15})/i); return m ? '+' + m[1] : ''; }).filter(Boolean))];
  const sociais = [...new Set(hrefs.map((h) => { try { return new URL(h, base).href; } catch { return ''; } }).filter((h) => SOCIAIS_SITE.test(h) && !PERFIL_NAO.test(new URL(h).pathname)).map((h) => h.replace(/[?#].*$/, '').replace(/\/$/, '')))];
  const ld = lerJsonLd(html);
  return {
    telefones: [...new Set([...p.telefones, ...achados.filter((e) => e.tipo === 'telefone').map((e) => e.valor), ...ld.flatMap((o) => [o.telephone, ...[].concat(o.contactPoint || []).map((c) => c && c.telephone)]).filter((t) => typeof t === 'string')])],
    whats,
    emails: [...new Set([...p.emails, ...ld.map((o) => o.email).filter((e) => typeof e === 'string').map((e) => e.replace(/^mailto:/i, '').toLowerCase())])],
    cnpjs: [...new Set([...achados.filter((e) => e.tipo === 'cnpj').map((e) => e.valor), ...ld.flatMap((o) => [o.taxID, o.vatID]).filter((x) => typeof x === 'string' && cnpjValido(x)).map((x) => normalizar('cnpj', x))])],
    ceps: [...new Set(achados.filter((e) => e.tipo === 'cep').map((e) => e.valor))],
    enderecos: [...new Set([...ld.map((o) => textoEndereco(o.address)).filter((e) => e.length >= 8), ...enderecosNoTexto(texto)])],
    nomes: [...new Set(ld.map((o) => o.legalName).filter((n) => typeof n === 'string' && n.trim()))],
    sociais: [...new Set([...p.sociais, ...sociais, ...ld.flatMap((o) => [].concat(o.sameAs || [])).filter((u) => typeof u === 'string' && SOCIAIS_SITE.test(u)).map((u) => u.replace(/[?#].*$/, '').replace(/\/$/, ''))])].filter((u) => { try { return !PERFIL_NAO.test(new URL(u).pathname); } catch { return false; } }),
    links: hrefs,
  };
}
export async function contatosSite(ctx, valor, tipo) {
  const inicio = tipo === 'url' ? valor : `https://${valor}/`;
  let r;
  try { r = await ctx.pagina(inicio); } catch (e) { if (tipo === 'url') throw e; r = await ctx.pagina(`http://${valor}/`); }
  if (r.status >= 400) return { entidades: [], props: { 'status HTTP': r.status }, aviso: `O site recusou a leitura (HTTP ${r.status}${r.status === 403 || r.status === 429 ? ', provável proteção contra robôs' : ''}). Abra no navegador para ver os contatos.` };
  const base = r.url || inicio;
  const host = new URL(base).hostname.replace(/^www\./, '');
  const primeira = contatosDaPagina(r.texto, base);
  // as páginas de contato do mesmo site linkadas na inicial (no máximo 5)
  const candidatas = [...new Set(primeira.links.map((h) => { try { const u = new URL(h, base); return u.hostname.replace(/^www\./, '') === host && /^https?:$/.test(u.protocol) ? u.href.replace(/#.*$/, '') : ''; } catch { return ''; } }).filter((u) => u && u !== base && PAGINA_CONTATO.test(new URL(u).pathname) && !/\.(pdf|jpe?g|png|zip|docx?)$/i.test(u)))]
    .sort((a, b) => Number(/contato|contact|fale|atendimento/i.test(b)) - Number(/contato|contact|fale|atendimento/i.test(a))).slice(0, 5);
  const outras = await Promise.all(candidatas.map((u) => ctx.pagina(u).then((x) => ({ u, c: contatosDaPagina(x.texto, x.url || u) })).catch(() => null)));
  const paginas = [{ u: base, c: primeira }, ...outras.filter(Boolean)];
  const out = [], onde = (u) => ({ props: { página: u } });
  const curtoU = (u) => { try { return new URL(u).pathname === '/' ? 'página inicial' : new URL(u).pathname; } catch { return u; } };
  for (const { u, c } of paginas) {
    for (const t of c.whats) out.push(ent('telefone', t, 'WhatsApp do site', onde(curtoU(u))));
    for (const t of c.telefones) out.push(ent('telefone', t, 'telefone no site', onde(curtoU(u))));
    for (const e of c.emails) out.push(ent('email', e, 'e-mail no site', onde(curtoU(u))));
    for (const x of c.cnpjs) out.push(ent('cnpj', x, 'CNPJ no site', onde(curtoU(u))));
    for (const e of c.enderecos) out.push(ent('local', e, 'endereço no site', onde(curtoU(u))));
    for (const x of c.ceps) out.push(ent('cep', x, 'CEP no site'));
    for (const n of c.nomes) out.push(ent('organizacao', n, 'razão social no site (schema.org)'));
    for (const s of c.sociais) out.push(ent('conta', s, 'perfil do site'));
  }
  const ents = unicos(out.filter((e) => e.valor));
  const conta = (t) => ents.filter((e) => e.tipo === t).length;
  return {
    ...corta(ents, ctx),
    props: { 'páginas lidas': paginas.map((p) => curtoU(p.u)).join(', '), telefones: conta('telefone'), CNPJ: conta('cnpj'), endereços: conta('local'), 'redes sociais': conta('conta') },
    aviso: ents.length ? '' : 'Nenhum dado de contato nas páginas lidas (o site pode montar o conteúdo com JavaScript).',
  };
}
// Wayback Machine: endereços que o site já teve (páginas apagadas, painéis, arquivos esquecidos)
const CURIOSOS = /\.(env|sql|bak|zip|tar|gz|rar|7z|config|conf|ini|log|xml|json|yml|yaml|old|backup|swp|key|pem|csv|xls|xlsx|docx?|pdf)(\?|$)|\/(admin|wp-admin|login|painel|api|swagger|graphql|debug|phpinfo|\.git|server-status|actuator|console|jenkins|grafana|kibana)\b/i;
export async function wayback(ctx, dominio) {
  const max = Math.max(1, Number(ctx.limite) || 40);
  const linhas = await ctx.json(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(dominio + '/*')}&output=json&fl=original,timestamp,statuscode&collapse=urlkey&limit=3000`, { timeout: 60000 });
  const regs = (Array.isArray(linhas) ? linhas.slice(1) : []).map(([u, t, s]) => ({ u, t, s })).filter((r) => r.u && !/\.(css|js|png|jpe?g|gif|svg|woff2?|ttf|ico|webp)(\?|$)/i.test(r.u));
  // primeiro os endereços que costumam interessar (backups, painéis, APIs), depois o resto
  regs.sort((a, b) => Number(CURIOSOS.test(b.u)) - Number(CURIOSOS.test(a.u)));
  const quando = (t) => (t ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : '');
  const out = regs.slice(0, max).map((r) => ent('url', r.u, 'arquivado (Wayback)', { props: { arquivado: quando(r.t), status: r.s, cópia: `https://web.archive.org/web/${r.t}/${r.u}` }, alerta: CURIOSOS.test(r.u) }));
  return { entidades: out, aviso: regs.length > max ? `Mostrando ${max} de ${regs.length} endereços arquivados (os que mais interessam primeiro).` : regs.length ? '' : 'Nada arquivado na Wayback Machine.' };
}

// ---------- URL ----------
export function urlDominio(_ctx, url) {
  const u = new URL(url);
  return { entidades: [ent(ehIP(u.hostname) ? 'ip' : 'dominio', u.hostname, 'hospedado em')], props: { caminho: u.pathname, protocolo: u.protocol.replace(':', '') } };
}
export async function urlSeguir(ctx, url) {
  const out = [];
  let atual = url, ultima = null;
  for (let i = 0; i < 8; i++) {
    const r = await ctx.pagina(atual, { seguir: false });
    ultima = r;
    const destino = r.headers && r.headers.location;
    if (r.status >= 300 && r.status < 400 && destino) {
      const prox = new URL(destino, atual).href;
      out.push(ent('url', prox, `redireciona (${r.status})`, { de: i === 0 ? undefined : { tipo: 'url', valor: normalizar('url', atual) } }));
      atual = prox;
      continue;
    }
    break;
  }
  const p = lerPagina(ultima && ultima.texto, atual);
  const h = (ultima && ultima.headers) || {};
  return { entidades: out, props: { 'status HTTP': ultima ? ultima.status : '', título: p.titulo, servidor: h.server || '', 'tipo de conteúdo': h['content-type'] || '', 'destino final': atual !== url ? atual : '' } };
}

// ---------- e-mail ----------
export async function emailDominio(ctx, email) {
  const d = email.split('@')[1];
  const mx = await dns(ctx, d, 'MX').catch(() => null);
  const PUBLICOS = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|aol|proton|protonmail|pm|gmx|zoho|yandex|mail|uol|bol|terra|ig|r7)\.[a-z.]+$/i;
  return { entidades: [ent('dominio', d, 'domínio do e-mail')], props: { 'domínio aceita e-mail': mx == null ? '?' : mx.length ? 'sim' : 'não (o endereço não recebe mensagens)', provedor: PUBLICOS.test(d) ? 'e-mail gratuito (pessoal)' : 'domínio próprio (empresa ou pessoa)' } };
}
export async function gravatar(ctx, email) {
  const h = crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  const d = await ctx.json(`https://api.gravatar.com/v3/profiles/${h}`, { nulo404: true });
  if (!d) return { entidades: [], aviso: 'Nenhum perfil no Gravatar com este e-mail.' };
  const out = [];
  if (d.display_name) out.push(ent('pessoa', d.display_name, 'perfil Gravatar'));
  if (d.location) out.push(ent('local', d.location, 'diz morar em'));
  if (d.company) out.push(ent('organizacao', d.company, 'trabalha em'));
  if (d.profile_url) out.push(ent('conta', d.profile_url, 'perfil Gravatar'));
  for (const c of d.verified_accounts || []) if (c.url) out.push(ent('conta', c.url, `conta verificada (${c.service_label || c.service_type || 'site'})`));
  for (const l of d.links || []) if (l.url) out.push(ent('url', l.url, l.label || 'link do perfil'));
  return { entidades: unicos(out), props: { avatar: d.avatar_url || '', cargo: d.job_title || '', sobre: d.description || '' } };
}

// ---------- pessoa / apelido ----------
export function nomeApelidos(_ctx, nome) {
  return { entidades: apelidosDeNome(nome).map((a) => ent('apelido', a, 'apelido provável', { props: { palpite: 'gerado a partir do nome: confirme procurando as contas' } })) };
}
// sites que dizem com certeza se o usuário existe (API com 404, lista vazia ou marca na página): sem falso positivo.
// De cada conta achada sai também o que o perfil mostra: nome, cidade, site, empresa.
// (npm, PyPI, Bitbucket e Codeberg ficaram de fora: respondem igual para quem existe e para quem não existe)
const tira = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const cdata = (t, tag) => tira(((String(t).match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`)) || [])[1]));
const SITES = [
  { nome: 'GitHub', url: (u) => `https://api.github.com/users/${u}`, gh: true, achou: (d) => d && d.login, perfil: (d) => d.html_url, dados: (d) => ({ nome: d.name, local: d.location, site: d.blog, empresa: d.company, bio: d.bio }) },
  { nome: 'GitLab', url: (u) => `https://gitlab.com/api/v4/users?username=${u}`, achou: (d) => Array.isArray(d) && d.length, perfil: (d) => d[0].web_url, dados: (d) => ({ nome: d[0].name }) },
  { nome: 'Reddit', url: (u) => `https://www.reddit.com/user/${u}/about.json`, achou: (d) => d && d.data && d.data.name, perfil: (d) => `https://www.reddit.com/user/${d.data.name}`, dados: (d) => ({ bio: d.data.subreddit && d.data.subreddit.public_description }) },
  { nome: 'Keybase', url: (u) => `https://keybase.io/_/api/1.0/user/lookup.json?usernames=${u}&fields=basics,profile,proofs_summary`, achou: (d) => d && d.them && d.them[0], perfil: (d) => `https://keybase.io/${d.them[0].basics.username}`, dados: (d) => ({ nome: d.them[0].profile && d.them[0].profile.full_name, local: d.them[0].profile && d.them[0].profile.location, bio: d.them[0].profile && d.them[0].profile.bio, provas: ((d.them[0].proofs_summary && d.them[0].proofs_summary.all) || []).filter((p) => p.state === 1 && /^https?:/.test(p.service_url || '')).map((p) => ({ url: p.service_url, tipo: p.proof_type, prova: p.proof_url })) }) },
  { nome: 'Hacker News', url: (u) => `https://hacker-news.firebaseio.com/v0/user/${u}.json`, achou: (d) => d && d.id, perfil: (d) => `https://news.ycombinator.com/user?id=${d.id}`, dados: (d) => ({ bio: tira(d.about) }) },
  { nome: 'dev.to', url: (u) => `https://dev.to/api/users/by_username?url=${u}`, achou: (d) => d && d.username, perfil: (d) => `https://dev.to/${d.username}`, dados: (d) => ({ nome: d.name, local: d.location, site: d.website_url, bio: d.summary }) },
  { nome: 'Docker Hub', url: (u) => `https://hub.docker.com/v2/users/${u}/`, achou: (d) => d && d.username, perfil: (d) => `https://hub.docker.com/u/${d.username}`, dados: (d) => ({ nome: d.full_name, local: d.location, empresa: d.company, site: d.profile_url }) },
  { nome: 'Chess.com', url: (u) => `https://api.chess.com/pub/player/${u.toLowerCase()}`, achou: (d) => d && d.username, perfil: (d) => d.url, dados: (d) => ({ nome: d.name, local: d.location }) },
  { nome: 'Lichess', url: (u) => `https://lichess.org/api/user/${u}`, achou: (d) => d && d.id && !d.disabled, perfil: (d) => d.url, dados: (d) => ({ nome: d.profile && [d.profile.firstName, d.profile.lastName].filter(Boolean).join(' '), local: d.profile && d.profile.location, bio: d.profile && d.profile.bio }) },
  { nome: 'Bluesky', url: (u) => `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${u.includes('.') ? u : u + '.bsky.social'}`, achou: (d) => d && d.did, perfil: (d) => `https://bsky.app/profile/${d.handle}`, dados: (d) => ({ nome: d.displayName, bio: d.description }) },
  { nome: 'Mastodon', url: (u) => `https://mastodon.social/api/v1/accounts/lookup?acct=${u}`, achou: (d) => d && d.id, perfil: (d) => d.url, dados: (d) => ({ nome: d.display_name, bio: tira(d.note), site: ((d.fields || []).map((f) => (String(f.value).match(/href="(https?:\/\/[^"]+)"/) || [])[1] || (tira(f.value).match(/https?:\/\/\S+/) || [])[0]).find(Boolean)) || '' }) },
  { nome: 'Duolingo', url: (u) => `https://www.duolingo.com/2017-06-30/users?username=${u}&fields=users%7Busername,name,bio%7D`, achou: (d) => d && d.users && d.users[0], perfil: (d) => `https://www.duolingo.com/profile/${d.users[0].username}`, dados: (d) => ({ nome: d.users[0].name, bio: d.users[0].bio }) },
  { nome: 'Wikipédia', url: (u) => `https://pt.wikipedia.org/w/api.php?action=query&list=users&ususers=${u}&usprop=editcount%7Cregistration&format=json`, achou: (d) => { const x = d && d.query && d.query.users && d.query.users[0]; return x && !('missing' in x) && !('invalid' in x); }, perfil: (d) => `https://pt.wikipedia.org/wiki/Usu%C3%A1rio:${encodeURIComponent(d.query.users[0].name.replace(/ /g, '_'))}`, dados: (d) => ({ bio: `${d.query.users[0].editcount} edições desde ${data(d.query.users[0].registration)}` }) },
  { nome: 'Codewars', url: (u) => `https://www.codewars.com/api/v1/users/${u}`, achou: (d) => d && d.username, perfil: (d) => `https://www.codewars.com/users/${d.username}`, dados: (d) => ({ nome: d.name, empresa: d.clan && d.clan !== 'None' ? d.clan : '' }) },
  { nome: 'Speedrun.com', url: (u) => `https://www.speedrun.com/api/v1/users/${u}`, achou: (d) => d && d.data && d.data.id, perfil: (d) => d.data.weblink, dados: (d) => ({ local: d.data.location && d.data.location.country && d.data.location.country.names && d.data.location.country.names.international }) },
  { nome: 'Gravatar', url: (u) => `https://api.gravatar.com/v3/profiles/${u}`, achou: (d) => d && d.profile_url, perfil: (d) => d.profile_url, dados: (d) => ({ nome: d.display_name, local: d.location, empresa: d.company, bio: d.description }) },
  { nome: 'Steam', url: (u) => `https://steamcommunity.com/id/${u}?xml=1`, html: true, achou: (t) => /<steamID64>\d+<\/steamID64>/.test(t), perfil: (_t, u) => `https://steamcommunity.com/id/${u}`, dados: (t) => ({ nome: cdata(t, 'realname'), local: cdata(t, 'location'), bio: cdata(t, 'summary') }) },
  { nome: 'Hugging Face', url: (u) => `https://huggingface.co/api/users/${u}/overview`, achou: (d) => d && (d.user || d.fullname), perfil: (d) => `https://huggingface.co/${d.user || ''}`, dados: (d) => ({ nome: d.fullname, empresa: (d.orgs || []).map((o) => o.fullname || o.name).filter(Boolean).slice(0, 3).join(', ') }) },
  { nome: 'Telegram', url: (u) => `https://t.me/${u}`, html: true, valido: (u) => /^[a-z][a-z0-9_]{4,31}$/i.test(u), achou: (t) => /tgme_page_title/.test(t), perfil: (_t, u) => `https://t.me/${u}`, dados: (t) => ({ nome: tira((String(t).match(/<meta property="og:title" content="([^"]*)"/) || [])[1]), bio: tira((String(t).match(/<meta property="og:description" content="([^"]*)"/) || [])[1]) }) },
];
// a API do GitHub sem token aceita 60 consultas por hora; com o token do Cofre, 5.000
const ghJson = (ctx, caminho, opt = {}) => (ctx.gh ? ctx.gh(caminho, opt) : ctx.json('https://api.github.com/' + caminho, { nulo404: true, ...opt }));
// o que o perfil de uma conta mostra vira entidade ligada à própria conta
function doPerfil(conta, site, x = {}) {
  const de = { tipo: 'conta', valor: conta.valor }, out = [];
  if (x.nome && tira(x.nome).length > 1 && !/^[a-z0-9_.-]+$/.test(x.nome)) out.push(ent('pessoa', tira(x.nome), `nome no ${site}`, { de }));
  if (x.local && tira(x.local).length > 1) out.push(ent('local', tira(x.local), 'diz morar em', { de }));
  if (x.empresa) for (const c of String(x.empresa).split(/[,&]/)) { const n = c.trim().replace(/^@/, ''); if (n.length > 1) out.push(ent('organizacao', n, 'trabalha em', { de })); }
  if (x.site && /\./.test(x.site)) out.push(ent('url', /^https?:/.test(x.site) ? x.site : 'https://' + x.site, 'site no perfil', { de }));
  if (x.bio) for (const e of extrair(x.bio)) if (['email', 'telefone', 'url', 'dominio'].includes(e.tipo)) out.push(ent(e.tipo, e.valor, `citado no perfil do ${site}`, { de }));
  // prova do Keybase: o dono assinou que as duas contas são dele (é a ligação mais forte que existe entre contas)
  for (const p of x.provas || []) out.push(ent(/^https?:\/\/[^/]+\/?$/.test(p.url) ? 'dominio' : 'conta', /^https?:\/\/[^/]+\/?$/.test(p.url) ? new URL(p.url).hostname : p.url, `provada no Keybase (${p.tipo})`, { de, props: { prova: p.prova || '', certeza: 'o dono assinou que esta conta é dele' } }));
  return out;
}
export async function contas(ctx, apelido) {
  const u = encodeURIComponent(apelido.replace(/^@/, ''));
  const res = await Promise.all(SITES.map(async (s) => {
    if (s.valido && !s.valido(decodeURIComponent(u))) return null;
    try {
      if (s.html) { const r = await ctx.pagina(s.url(u), { navegador: true }); return r.status === 200 && s.achou(r.texto) ? { s, link: s.perfil(r.texto, u), d: r.texto } : null; }
      const d = s.gh ? await ghJson(ctx, `users/${u}`) : await ctx.json(s.url(u), { nulo404: true });
      return s.achou(d) ? { s, link: s.perfil(d, u), d } : null;
    } catch { return null; }
  }));
  const achados = res.filter(Boolean);
  const out = [];
  for (const { s, link, d } of achados) {
    const c = ent('conta', link, `conta no ${s.nome}`, { props: { site: s.nome } });
    out.push(c);
    try { out.push(...doPerfil(c, s.nome, s.dados ? s.dados(d) : {})); } catch {}
  }
  return { entidades: unicos(out), props: { 'contas achadas': achados.map((a) => a.s.nome).join(', '), 'sites conferidos': `${SITES.length}: ${SITES.map((s) => s.nome).join(', ')}` }, aviso: achados.length ? '' : `Nenhuma conta com este nome em ${SITES.length} sites.` };
}

// ---------- GitHub a fundo ----------
const NOREPLY = /noreply|users\.noreply\.github\.com|@localhost|\.local$/i;
export async function github(ctx, apelido) {
  const u = encodeURIComponent(apelido.replace(/^@/, '').replace(/^https?:\/\/github\.com\//i, '').split('/')[0]);
  const d = await ghJson(ctx, `users/${u}`);
  if (!d) return { entidades: [], aviso: 'Não existe usuário do GitHub com este nome.' };
  const conta = ent('conta', d.html_url, 'conta no GitHub');
  const out = [conta, ...doPerfil(conta, 'GitHub', { nome: d.name, local: d.location, site: d.blog, empresa: d.company, bio: d.bio })];
  if (d.email) out.push(ent('email', d.email, 'e-mail público'));
  if (d.twitter_username) out.push(ent('conta', `https://x.com/${d.twitter_username}`, 'conta no X'));
  const emails = new Map();
  const anota = (email, nome, onde) => { if (!email || NOREPLY.test(email)) return; const e = email.toLowerCase(); if (!emails.has(e)) emails.set(e, { nomes: new Set(), onde: new Set() }); if (nome) emails.get(e).nomes.add(nome); emails.get(e).onde.add(onde); };
  // e-mails dos commits (eventos recentes e a busca de commits) e das chaves GPG: o e-mail real aparece mesmo com o perfil escondendo
  const [ev, busca, gpg, ssh] = await Promise.all([
    ghJson(ctx, `users/${u}/events/public?per_page=100`).catch(() => null),
    ghJson(ctx, `search/commits?q=author:${u}&per_page=100&sort=author-date`, { headers: { accept: 'application/vnd.github+json' } }).catch(() => null),
    ghJson(ctx, `users/${u}/gpg_keys`).catch(() => null),
    ctx.pagina(`https://github.com/${u}.keys`).catch(() => null),
  ]);
  for (const e of Array.isArray(ev) ? ev : []) for (const c of (e.payload && e.payload.commits) || []) anota(c.author && c.author.email, c.author && c.author.name, 'eventos');
  for (const it of (busca && busca.items) || []) anota(it.commit && it.commit.author && it.commit.author.email, it.commit && it.commit.author && it.commit.author.name, 'commits');
  for (const k of Array.isArray(gpg) ? gpg : []) for (const e of k.emails || []) anota(e.email, '', 'chave GPG');
  for (const [e, x] of emails) {
    out.push(ent('email', e, `e-mail ${[...x.onde].includes('chave GPG') ? 'na chave GPG' : 'nos commits'}`, { de: { tipo: 'conta', valor: conta.valor }, props: { 'nomes usados': [...x.nomes].slice(0, 4).join(', '), fonte: [...x.onde].join(', ') } }));
    for (const n of x.nomes) if (n.includes(' ') && n.toLowerCase() !== String(d.name || '').toLowerCase()) out.push(ent('pessoa', n, 'nome nos commits', { de: { tipo: 'email', valor: e } }));
  }
  const chaves = ssh && ssh.status === 200 ? String(ssh.texto).split('\n').filter((l) => l.trim()) : [];
  const repos = [...new Set(((busca && busca.items) || []).map((it) => it.repository && it.repository.full_name).filter(Boolean))];
  return {
    entidades: unicos(out),
    props: {
      bio: d.bio || '', 'repositórios públicos': d.public_repos, seguidores: d.followers, seguindo: d.following, 'criada em': data(d.created_at), 'atualizada em': data(d.updated_at), tipo: d.type === 'Organization' ? 'organização' : 'usuário',
      'chaves SSH': chaves.length ? `${chaves.length} (${[...new Set(chaves.map((l) => l.split(' ')[0]))].join(', ')})` : 'nenhuma', 'chaves GPG': Array.isArray(gpg) ? gpg.length : '', 'commits achados': busca ? `${busca.total_count || 0}${repos.length ? ` em ${repos.slice(0, 5).join(', ')}` : ''}` : '',
      contratável: d.hireable ? 'sim' : '',
    },
  };
}
// quem segue e quem é seguido (numa organização, os membros públicos): a rede da pessoa no GitHub
export async function githubRede(ctx, apelido) {
  const u = encodeURIComponent(apelido.replace(/^@/, ''));
  const d = await ghJson(ctx, `users/${u}`);
  if (!d) return { entidades: [], aviso: 'Não existe usuário do GitHub com este nome.' };
  const max = Math.max(5, Math.min(100, Number(ctx.limite) || 40));
  const lista = async (c) => { const r = await ghJson(ctx, c).catch(() => null); return Array.isArray(r) ? r : []; };
  const out = [];
  if (d.type === 'Organization') for (const m of await lista(`orgs/${u}/public_members?per_page=${max}`)) out.push(ent('apelido', m.login, 'membro da organização', { props: { GitHub: m.html_url } }));
  else {
    const [seg, segue] = await Promise.all([lista(`users/${u}/followers?per_page=${max}`), lista(`users/${u}/following?per_page=${max}`)]);
    const de = new Set(segue.map((x) => x.login));
    for (const x of seg) out.push(ent('apelido', x.login, de.has(x.login) ? 'segue e é seguido (GitHub)' : 'segue no GitHub', { props: { GitHub: x.html_url } }));
    for (const x of segue) if (!seg.some((y) => y.login === x.login)) out.push(ent('apelido', x.login, 'seguido no GitHub', { props: { GitHub: x.html_url } }));
  }
  // os mútuos primeiro: costumam ser colegas e amigos de verdade
  out.sort((a, b) => Number(/e é seguido/.test(b.ligacao)) - Number(/e é seguido/.test(a.ligacao)));
  return { ...corta(unicos(out), ctx), props: { seguidores: d.followers, seguindo: d.following } };
}
// de um e-mail, as contas do GitHub que fizeram commits com ele
export async function emailGithub(ctx, email) {
  const r = await ghJson(ctx, `search/commits?q=author-email:${encodeURIComponent(email)}&per_page=100`, { headers: { accept: 'application/vnd.github+json' } });
  const itens = (r && r.items) || [];
  const contas_ = new Map(), nomes = new Set(), repos = new Set();
  for (const it of itens) {
    if (it.author && it.author.login) contas_.set(it.author.login, it.author.html_url);
    if (it.commit && it.commit.author && it.commit.author.name) nomes.add(it.commit.author.name);
    if (it.repository) repos.add(it.repository.full_name);
  }
  const out = [];
  for (const [login, url] of contas_) { out.push(ent('conta', url, 'faz commits no GitHub com este e-mail')); out.push(ent('apelido', login, 'usuário do GitHub', { de: { tipo: 'conta', valor: normalizar('url', url) } })); }
  for (const n of nomes) if (n.length > 2) out.push(ent('pessoa', n, 'nome nos commits'));
  for (const rp of [...repos].slice(0, 8)) out.push(ent('url', `https://github.com/${rp}`, 'tem commits deste e-mail', { rotulo: rp }));
  return { entidades: unicos(out), props: { 'commits no GitHub': r ? r.total_count || 0 : 0 }, aviso: itens.length ? '' : 'Nenhum commit público no GitHub com este e-mail.' };
}
// um repositório do GitHub: dono, contribuidores, e-mails dos commits, site e tópicos
export async function githubRepo(ctx, url) {
  const m = String(url).match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!m) return { entidades: [], aviso: 'Não é o endereço de um repositório do GitHub (github.com/dono/repositório).' };
  const [dono, nome] = [m[1], m[2].replace(/\.git$/, '')];
  const r = await ghJson(ctx, `repos/${dono}/${nome}`);
  if (!r) return { entidades: [], aviso: 'Repositório não encontrado (ou privado).' };
  const max = Math.max(5, Math.min(60, Number(ctx.limite) || 40));
  const [contrib, commits] = await Promise.all([ghJson(ctx, `repos/${dono}/${nome}/contributors?per_page=${max}`).catch(() => null), ghJson(ctx, `repos/${dono}/${nome}/commits?per_page=100`).catch(() => null)]);
  const out = [ent('apelido', r.owner.login, r.owner.type === 'Organization' ? 'organização dona' : 'dono')];
  if (r.homepage) { try { out.push(ent('dominio', new URL(/^https?:/.test(r.homepage) ? r.homepage : 'https://' + r.homepage).hostname.replace(/^www\./, ''), 'site do projeto')); } catch {} }
  for (const c of Array.isArray(contrib) ? contrib : []) if (c.login && c.login !== r.owner.login && c.type !== 'Bot') out.push(ent('apelido', c.login, 'contribui', { props: { contribuições: c.contributions } }));
  const emails = new Map();
  for (const c of Array.isArray(commits) ? commits : []) { const a = c.commit && c.commit.author; if (a && a.email && !NOREPLY.test(a.email)) { const e = a.email.toLowerCase(); emails.set(e, (emails.get(e) || new Set()).add(a.name)); } }
  for (const [e, ns] of emails) { out.push(ent('email', e, 'e-mail nos commits', { props: { 'nomes usados': [...ns].join(', ') } })); for (const n of ns) if (n && n.includes(' ')) out.push(ent('pessoa', n, 'nome nos commits', { de: { tipo: 'email', valor: e } })); }
  if (r.language) out.push(ent('tecnologia', r.language, 'escrito em', { props: { categoria: 'Linguagem' } }));
  return { ...corta(unicos(out), ctx), props: { descrição: r.description || '', estrelas: r.stargazers_count, forks: r.forks_count, tópicos: (r.topics || []).join(', '), licença: (r.license && r.license.spdx_id) || '', criado: data(r.created_at), 'último push': data(r.pushed_at), arquivado: r.archived ? 'sim' : '' } };
}

// conta: de um link de perfil, o apelido (para procurar o mesmo nome em outros sites)
export function contaApelido(_ctx, url) {
  let u;
  try { u = new URL(url); } catch { throw new Falha('a conta precisa ser o link do perfil'); }
  if (/^(wa\.me|signal\.me)$/i.test(u.hostname) || /^\/\+/.test(u.pathname)) return { entidades: [], aviso: 'Este link é de um telefone, não de um nome de usuário.' };
  const partes = u.pathname.split('/').filter(Boolean).filter((p) => !['in', 'company', 'user', 'u', 'c', 'channel', 'profile', 'school', 'id', 'users', 'wiki'].includes(p.toLowerCase()));
  const nome = decodeURIComponent(partes[0] || u.searchParams.get('id') || '').replace(/^[@~]/, '').replace(/^Usu[aá]rio:/i, '').replace(/\.bsky\.social$/, '');
  if (!nome) return { entidades: [], aviso: 'Não deu para tirar um nome de usuário deste link.' };
  return { entidades: [ent('apelido', nome, 'usuário da conta')] };
}

// ---------- busca na web (DuckDuckGo; o Bing de reserva) ----------
export function lerBusca(html) {
  const out = [];
  for (const bloco of String(html || '').split(/class="result results_links|class="result__body/).slice(1)) {
    const a = bloco.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    let url = a[1].replace(/&amp;/g, '&');
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (url.startsWith('//')) url = 'https:' + url;
    if (!/^https?:\/\//.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue;
    out.push({ url, titulo: tira(a[2]), trecho: tira((bloco.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/) || [])[1]) });
  }
  return out;
}
export function lerBing(html) {
  const out = [];
  for (const m of String(html || '').matchAll(/<li class="b_algo"[\s\S]*?<h2[^>]*><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>|<\/li>)/g)) {
    let url = m[1].replace(/&amp;/g, '&');
    const u = url.match(/[?&]u=a1([^&]+)/);
    if (u) { try { url = Buffer.from(u[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch {} }
    if (/^https?:\/\//.test(url)) out.push({ url, titulo: tira(m[2]), trecho: tira(m[3]) });
  }
  return out;
}
// buscadores bloqueiam muitas consultas automáticas seguidas (o DuckDuckGo responde 202 com um desafio):
// isso volta como "bloqueado", para o aviso dizer a verdade em vez de "nada encontrado"
async function buscaWeb(ctx, consulta) {
  let bloqueado = false;
  try {
    const r = await ctx.pagina(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(consulta)}&kl=br-pt`, { navegador: true });
    bloqueado = r.status === 202 || /anomaly|captcha/i.test(String(r.texto).slice(0, 20000));
    const res = lerBusca(r.texto);
    if (res.length || (!bloqueado && /No results|Nenhum resultado/i.test(r.texto))) return { res, bloqueado: false };
  } catch {}
  try {
    const r = await ctx.pagina(`https://www.bing.com/search?q=${encodeURIComponent(consulta)}&setlang=pt-BR&cc=BR`, { navegador: true });
    return { res: lerBing(r.texto), bloqueado };
  } catch { return { res: [], bloqueado: true }; }
}
// a consulta certa para cada tipo: o telefone em todos os jeitos de escrever, o domínio fora do próprio site
export function consultaWeb(tipo, valor) {
  const q = (s) => `"${String(s).replace(/"/g, '')}"`;
  if (tipo === 'telefone') { const i = telefoneInfo(valor); return (i ? [...new Set(i.formatos)].slice(1, 5) : [valor]).map(q).join(' OR '); }
  if (tipo === 'cnpj') return `${q(valor)} OR ${q(valor.replace(/\D/g, ''))}`;
  if (tipo === 'dominio') return `${q(valor)} -site:${valor}`;
  if (tipo === 'apelido') return `${q(valor)} OR ${q('@' + valor)}`;
  if (tipo === 'pessoa') { const p = String(valor).trim().split(/\s+/); return p.length >= 3 ? `${q(valor)} OR ${q(p[0] + ' ' + p[p.length - 1])}` : q(valor); }
  return q(valor);
}
// o resultado precisa citar o que se procurou (no título, no trecho ou no endereço): buscador que entende errado
// a consulta (o Bing com OR, por exemplo) devolve páginas sem nada a ver, e elas não entram
const semAcento_ = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function citaTermo(r, tipo, valor) {
  const alvo = semAcento_(`${r.titulo} ${r.trecho} ${decodeURIComponent(String(r.url).replace(/%(?![0-9a-f]{2})/gi, ''))}`);
  if (tipo === 'telefone' || tipo === 'cnpj' || tipo === 'cpf') {
    const d = String(valor).replace(/\D/g, ''), so = alvo.replace(/\D/g, '');
    return so.includes(tipo === 'telefone' ? d.slice(-8) : d);
  }
  const termo = semAcento_(String(valor).replace(/^@/, ''));
  if (alvo.includes(termo)) return true;
  // nome de pessoa: todas as palavras do nome aparecem (a ordem pode mudar: "Souza, Ana")
  const partes = termo.split(/\s+/).filter((p) => p.length > 2);
  return partes.length > 1 && partes.every((p) => alvo.includes(p));
}
export async function web(ctx, valor, tipo) {
  if (tipo === 'pessoa' && String(valor).trim().split(/\s+/).length < 2) return { entidades: [], aviso: `"${valor}" é só um primeiro nome: a busca traria homônimos. Use o nome completo.` };
  const consulta = consultaWeb(tipo, valor);
  const porNome = tipo === 'pessoa' || tipo === 'organizacao';
  const { res: todos, bloqueado } = await buscaWeb(ctx, consulta);
  // a mesma busca para abrir no navegador, com um clique nas propriedades
  const noNavegador = `https://duckduckgo.com/?q=${encodeURIComponent(consulta)}`;
  const res = todos.filter((r) => citaTermo(r, tipo, valor)).map((r) => ({ ...r, url: r.url.replace(/([?&])(msockid|utm_[a-z]+|fbclid|gclid)=[^&]*&?/gi, '$1').replace(/[?&]$/, '') })).slice(0, Math.max(5, Math.min(20, Number(ctx.limite) || 12)));
  const out = [];
  for (const r of res) {
    const social = SOCIAIS.test(r.url);
    const pagina = ent(social ? 'conta' : 'url', r.url.replace(/[?#].*$/, social ? '' : '$&'), social ? (porNome ? 'perfil com o mesmo nome (pode ser homônimo)' : 'perfil que aparece na busca') : porNome ? 'página com o mesmo nome (pode ser homônimo)' : 'aparece na web', { rotulo: curtoT(r.titulo || r.url, 60), props: { título: r.titulo, trecho: r.trecho, ...(porNome ? { atenção: 'achado só pelo nome: confirme antes de ligar à pessoa' } : {}) } });
    out.push(pagina);
    // o que o trecho do resultado cita fica ligado a ele
    for (const e of extrair(`${r.titulo} ${r.trecho}`)) if (['email', 'telefone', 'cnpj', 'cripto'].includes(e.tipo) && !(e.tipo === tipo && e.valor === valor)) out.push(ent(e.tipo, e.valor, 'citado no resultado', { de: { tipo: pagina.tipo, valor: pagina.valor } }));
  }
  const fora = todos.length - todos.filter((r) => citaTermo(r, tipo, valor)).length;
  const aviso = res.length ? '' : bloqueado ? 'O buscador pediu verificação de robô (muitas buscas seguidas deste PC). Tente daqui a alguns minutos, ou abra a busca no navegador pelas propriedades.' : todos.length ? `A busca trouxe ${todos.length} páginas, mas nenhuma cita "${valor}".` : 'Nenhum resultado na busca.';
  return { entidades: unicos(out), props: { 'busca na web': `${res.length} resultados para ${consulta}${fora ? ` (${fora} sem relação descartados)` : ''}${bloqueado && !res.length ? ' · buscador bloqueou' : ''}`, 'abrir a busca no navegador': noNavegador }, aviso };
}
const curtoT = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

// ---------- telefone, CVE, texto ----------
export async function telefone(ctx, numero) {
  const i = telefoneInfo(numero);
  if (!i) return { entidades: [], aviso: 'Não reconheci o número. Escreva com o DDD (51 99999-1234) ou com o código do país (+351 912 345 678).' };
  const n = normalizar('telefone', numero), dig = n.replace(/\D/g, '');
  const out = [];
  if (i.estado) out.push(ent('local', i.regiao ? `${i.regiao} (${i.uf})` : `${i.estado}, Brasil`, 'região do DDD', { props: { estado: i.estado, país: 'Brasil' } }));
  else if (i.pais) out.push(ent('local', i.pais, 'país do número'));
  // operadora original da faixa e, no fixo, a cidade pelo prefixo (libphonenumber, sem rede)
  const nm = i.ddd ? numeracao(dig) : { operadora: '', cidade: '' };
  if (nm.operadora) out.push(ent('organizacao', nm.operadora, 'operadora original da faixa (a portabilidade não aparece)'));
  if (nm.cidade && / - [A-Z]{2}$/.test(nm.cidade)) out.push(ent('local', nm.cidade, i.celular ? 'cidade da faixa' : 'cidade do telefone fixo'));
  // os links abrem o perfil se o número usar o app; não dá para saber antes sem as APIs pagas
  if (n.startsWith('+') && (i.celular || !i.ddd)) {
    out.push(ent('conta', `https://wa.me/${dig}`, 'link do WhatsApp', { props: { aviso: 'abre a conversa se o número usar WhatsApp' } }));
    out.push(ent('conta', `https://t.me/+${dig}`, 'link do Telegram', { props: { aviso: 'abre o perfil se o número usar Telegram e deixar ser achado pelo número' } }));
    out.push(ent('conta', `https://signal.me/#p/+${dig}`, 'link do Signal', { props: { aviso: 'abre a conversa se o número usar Signal' } }));
  }
  // as cidades que o DDD cobre (BrasilAPI); sem rede, fica só o que se sabe sem consultar
  let cidades = '';
  if (i.ddd && ctx.json) { try { const d = await ctx.json(`https://brasilapi.com.br/api/ddd/v1/${i.ddd}`, { nulo404: true }); if (d && d.cities) cidades = `${d.cities.length}: ${d.cities.slice(0, 12).map((c) => c.toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase())).join(', ')}${d.cities.length > 12 ? '…' : ''}`; } catch {} }
  return { entidades: out, props: { país: i.pais, DDI: i.ddi, DDD: i.ddd || '', tipo: i.tipo || '', região: i.regiao || '', 'cidades do DDD': cidades, 'jeitos de escrever': (i.formatos || []).slice(1).join(' · '), 'operadora original': nm.operadora ? `${nm.operadora} (sem contar a portabilidade)` : '', 'formato antigo': i.antigo ? `${i.antigo} (antes do nono dígito)` : '' } };
}
export async function cve(ctx, id) {
  const d = await ctx.json(`https://cveawg.mitre.org/api/cve/${encodeURIComponent(id)}`, { nulo404: true });
  if (!d) return { entidades: [], aviso: 'A MITRE não conhece este CVE.' };
  const cna = (d.containers && d.containers.cna) || {};
  // o CVSS vem do CNA ou, quando ele não deu nota, do ADP (a CISA costuma completar)
  const metricas = [...(cna.metrics || []), ...((d.containers && d.containers.adp) || []).flatMap((a) => a.metrics || [])];
  const m = metricas.map((x) => x.cvssV4_0 || x.cvssV3_1 || x.cvssV3_0 || x.cvssV2_0).find(Boolean) || {};
  const out = [];
  for (const a of cna.affected || []) if (a.vendor && !/^n\/?a$/i.test(a.vendor)) out.push(ent('organizacao', a.vendor, 'afeta produto de', { props: { produto: a.product || '' } }));
  for (const r of (cna.references || []).slice(0, 8)) out.push(ent('url', r.url, 'referência'));
  let epss = null;
  try { epss = ((await ctx.json(`https://api.first.org/data/v1/epss?cve=${encodeURIComponent(id)}`)).data || [])[0] || null; } catch {}
  return {
    entidades: unicos(out).slice(0, Math.max(1, Number(ctx.limite) || 40)),
    props: { resumo: ((cna.descriptions || [])[0] || {}).value || '', CVSS: m.baseScore ? `${m.baseScore} (${m.baseSeverity || ''})` : '', publicado: data(d.cveMetadata && d.cveMetadata.datePublished), produtos: (cna.affected || []).map((a) => a.product).filter(Boolean).slice(0, 6).join(', '), EPSS: epss ? `${(Number(epss.epss) * 100).toFixed(1)}% de chance de exploração em 30 dias` : '' },
  };
}
export function textoEntidades(_ctx, texto, completo) {
  return { entidades: extrair(completo || texto).filter((e) => e.tipo !== 'texto').map((e) => ent(e.tipo, e.valor, 'citado no texto')) };
}

// ---------- domínios parecidos (typosquatting): os que alguém registrou para enganar ----------
const SUFIXO_DUPLO = /^(com|net|org|gov|edu|co|ac|art|blog|eco|ind|inf|adv|eng|med|nom|tv)\.[a-z]{2}$/;
const TLDS_TROCA = ['com', 'com.br', 'net', 'org', 'br', 'net.br', 'io', 'co', 'app', 'online', 'site', 'info', 'store', 'shop', 'xyz', 'top'];
const VIZINHAS = { q: 'wa', w: 'qeas', e: 'wrsd', r: 'etdf', t: 'ryfg', y: 'tugh', u: 'yihj', i: 'uojk', o: 'ipkl', p: 'ol', a: 'qwsz', s: 'awedxz', d: 'serfcx', f: 'drtgvc', g: 'ftyhbv', h: 'gyujnb', j: 'huikmn', k: 'jiolm', l: 'kop', z: 'asx', x: 'zsdc', c: 'xdfv', v: 'cfgb', b: 'vghn', n: 'bhjm', m: 'njk' };
const PARECIDAS = { o: ['0'], 0: ['o'], l: ['1', 'i'], i: ['1', 'l'], 1: ['l', 'i'], e: ['3'], a: ['4'], s: ['5'], g: ['9', 'q'], b: ['8'], m: ['rn', 'nn'], w: ['vv'], d: ['cl'], u: ['v'], v: ['u'] };
const PALAVRAS = ['login', 'seguro', 'secure', 'app', 'online', 'br', 'suporte', 'conta', 'acesso', 'pagamento', 'oficial'];
export function partesDominio(dominio) {
  const l = normalizar('dominio', dominio).split('.');
  const duplo = l.length >= 3 && SUFIXO_DUPLO.test(l.slice(-2).join('.'));
  const sufixo = l.slice(duplo ? -2 : -1).join('.');
  return { nome: l[l.length - (duplo ? 3 : 2)] || '', sufixo };
}
// as variações, cada uma com a técnica que a gerou, na ordem em que um golpista costuma tentar
export function permutacoes(dominio, max = 300) {
  const { nome, sufixo } = partesDominio(dominio);
  const out = new Map();
  const original = `${nome}.${sufixo}`;
  const por = (n, s, tecnica) => {
    const d = `${n}.${s}`;
    if (d !== original && !out.has(d) && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(n)) out.set(d, tecnica);
  };
  for (let i = 0; i < nome.length; i++) for (const r of PARECIDAS[nome[i]] || []) por(nome.slice(0, i) + r + nome.slice(i + 1), sufixo, 'letra parecida');
  for (const t of TLDS_TROCA) por(nome, t, 'outro final');
  for (let i = 0; i < nome.length; i++) por(nome.slice(0, i) + nome.slice(i + 1), sufixo, 'letra a menos');
  for (let i = 0; i < nome.length; i++) por(nome.slice(0, i) + nome[i] + nome.slice(i), sufixo, 'letra repetida');
  for (let i = 0; i < nome.length - 1; i++) por(nome.slice(0, i) + nome[i + 1] + nome[i] + nome.slice(i + 2), sufixo, 'letras trocadas');
  for (const p of PALAVRAS) { por(`${nome}-${p}`, sufixo, 'palavra a mais'); por(`${p}-${nome}`, sufixo, 'palavra a mais'); por(nome + p, sufixo, 'palavra a mais'); }
  for (let i = 1; i < nome.length; i++) por(nome.slice(0, i) + '-' + nome.slice(i), sufixo, 'hífen');
  for (let i = 0; i < nome.length; i++) for (const v of VIZINHAS[nome[i]] || '') por(nome.slice(0, i) + v + nome.slice(i + 1), sufixo, 'tecla vizinha');
  return [...out.entries()].slice(0, max).map(([d, tecnica]) => ({ dominio: d, tecnica }));
}
async function emLotes(lista, n, fn) {
  const out = [];
  for (let i = 0; i < lista.length; i += n) out.push(...(await Promise.all(lista.slice(i, i + n).map(fn))));
  return out;
}
export async function parecidos(ctx, dominio) {
  const cand = permutacoes(dominio, 260);
  // existe se resolve (A) ou tem servidor de nomes (registrado, mas sem site)
  const res = await emLotes(cand, 16, async (c) => {
    const ips = await dns(ctx, c.dominio, 'A').catch(() => []);
    if (ips.length) return { ...c, ips };
    const ns = await dns(ctx, c.dominio, 'NS').catch(() => []);
    return ns.length ? { ...c, ips: [] } : null;
  });
  const achados = res.filter(Boolean);
  const out = achados.map((a) => ent('dominio', a.dominio, `parecido (${a.tecnica})`, { alerta: true, props: { técnica: a.tecnica, IPs: a.ips.join(', ') || 'registrado, sem site', risco: 'domínio parecido registrado: pode ser golpe, phishing ou só um homônimo; confira o dono' } }));
  return { ...corta(out, ctx), props: { 'parecidos registrados': `${achados.length} de ${cand.length} variações testadas` }, aviso: achados.length ? '' : `Nenhuma das ${cand.length} variações está registrada.` };
}

// ---------- certificado TLS do site ----------
export function lerCertificado(host, porta = 443) {
  return new Promise((ok, falha) => {
    const s = tls.connect({ host, port: porta, servername: host, rejectUnauthorized: false, timeout: 12000 }, () => {
      const c = s.getPeerCertificate();
      ok({ sujeito: (c.subject && c.subject.CN) || '', emissor: (c.issuer && (c.issuer.O || c.issuer.CN)) || '', de: c.valid_from, ate: c.valid_to, san: String(c.subjectaltname || '').split(',').map((x) => x.trim().replace(/^DNS:/, '')).filter((x) => x && !x.startsWith('IP Address')), valido: s.authorized, erro: s.authorizationError ? String(s.authorizationError) : '', protocolo: s.getProtocol() || '' });
      s.end();
    });
    s.on('timeout', () => { s.destroy(); falha(new Falha(`${host} não respondeu na porta ${porta}.`, { status: 504 })); });
    s.on('error', (e) => falha(new Falha(`Sem TLS em ${host}: ${e.message}`, { status: 502 })));
  });
}
export async function certificado(ctx, dominio) {
  const c = await (ctx.tls || lerCertificado)(dominio);
  const dias = c.ate ? Math.floor((Date.parse(c.ate) - Date.now()) / 86400000) : null;
  const out = c.san.map((d) => normalizar('dominio', d)).filter((d) => d && d !== dominio).map((d) => ent('dominio', d, 'no mesmo certificado'));
  if (c.emissor) out.push(ent('organizacao', c.emissor, 'emitiu o certificado'));
  const problema = !c.valido ? `certificado não confiável (${c.erro || 'erro'})` : dias != null && dias < 15 ? `certificado vence em ${dias} dias` : '';
  return { ...corta(unicos(out), ctx), alerta: !!problema, props: { emissor: c.emissor, 'válido até': c.ate ? new Date(c.ate).toISOString().slice(0, 10) : '', 'dias restantes': dias ?? '', protocolo: c.protocolo, 'certificado confiável': c.valido ? 'sim' : 'não', risco: problema } };
}

// ---------- tecnologias do site (cabeçalhos, HTML e cookies) ----------
const ASSINATURAS = [
  ['WordPress', 'CMS', { html: /wp-content\/|wp-includes\//i, gerador: /WordPress\s*([\d.]+)?/i }], ['Joomla', 'CMS', { gerador: /Joomla/i }], ['Drupal', 'CMS', { html: /\/sites\/default\/files|drupal-settings-json/i, h: { 'x-generator': /Drupal\s*([\d.]+)?/i } }],
  ['Wix', 'Construtor de sites', { html: /static\.wixstatic\.com|wix-bolt/i }], ['Shopify', 'Loja virtual', { html: /cdn\.shopify\.com/i, h: { 'x-shopify-stage': /./ } }], ['WooCommerce', 'Loja virtual', { html: /woocommerce/i }],
  ['VTEX', 'Loja virtual', { html: /vtex(assets|img)?\.com|vteximg/i, h: { server: /vtex/i } }], ['Nuvemshop', 'Loja virtual', { html: /nuvemshop|tiendanube/i }], ['Magento', 'Loja virtual', { html: /Mage\.Cookies|\/static\/version\d+\/frontend/i }],
  ['Next.js', 'Framework web', { html: /\/_next\/static|__NEXT_DATA__/, h: { 'x-powered-by': /Next\.js\s*([\d.]+)?/i } }], ['Nuxt', 'Framework web', { html: /\/_nuxt\/|window\.__NUXT__/ }], ['React', 'Biblioteca JS', { html: /data-reactroot|react(-dom)?(\.production)?\.min\.js/i }],
  ['Vue.js', 'Biblioteca JS', { html: /data-v-[0-9a-f]{8}|vue(\.runtime)?(\.global)?(\.prod)?\.js/i }], ['Angular', 'Framework web', { html: /ng-version="([\d.]+)"/ }], ['jQuery', 'Biblioteca JS', { html: /jquery[.-]?([\d.]+)?(\.min)?\.js/i }],
  ['Bootstrap', 'CSS', { html: /bootstrap(\.min)?\.css/i }], ['Tailwind CSS', 'CSS', { html: /tailwind/i }], ['Gatsby', 'Framework web', { html: /___gatsby/ }], ['Astro', 'Framework web', { html: /astro-island|\/_astro\// }],
  ['PHP', 'Linguagem', { h: { 'x-powered-by': /PHP\/?([\d.]+)?/i }, cookie: /PHPSESSID/ }], ['ASP.NET', 'Framework web', { h: { 'x-powered-by': /ASP\.NET/i, 'x-aspnet-version': /([\d.]+)/ }, cookie: /ASP\.NET_SessionId|\.AspNetCore\./ }],
  ['Java', 'Linguagem', { cookie: /JSESSIONID/ }], ['Express', 'Framework web', { h: { 'x-powered-by': /Express/i } }], ['Laravel', 'Framework web', { cookie: /laravel_session|XSRF-TOKEN/ }], ['Django', 'Framework web', { cookie: /csrftoken|django/i }],
  ['Ruby on Rails', 'Framework web', { cookie: /_rails|_session_id/, h: { 'x-runtime': /./ } }], ['nginx', 'Servidor web', { h: { server: /nginx\/?([\d.]+)?/i } }], ['Apache', 'Servidor web', { h: { server: /Apache\/?([\d.]+)?/i } }],
  ['Microsoft IIS', 'Servidor web', { h: { server: /Microsoft-IIS\/?([\d.]+)?/i } }], ['LiteSpeed', 'Servidor web', { h: { server: /LiteSpeed/i } }], ['Caddy', 'Servidor web', { h: { server: /Caddy/i } }], ['Envoy', 'Servidor web', { h: { server: /envoy/i } }],
  ['Cloudflare', 'CDN e proteção', { h: { server: /cloudflare/i, 'cf-ray': /./ } }], ['Amazon CloudFront', 'CDN', { h: { via: /CloudFront/i, 'x-amz-cf-id': /./ } }], ['Akamai', 'CDN', { h: { 'x-akamai-transformed': /./, server: /AkamaiGHost/i } }],
  ['Fastly', 'CDN', { h: { 'x-served-by': /cache-/i, via: /varnish/i } }], ['Vercel', 'Hospedagem', { h: { server: /Vercel/i, 'x-vercel-id': /./ } }], ['Netlify', 'Hospedagem', { h: { server: /Netlify/i, 'x-nf-request-id': /./ } }],
  ['GitHub Pages', 'Hospedagem', { h: { server: /GitHub\.com/i } }], ['Amazon S3', 'Hospedagem', { h: { server: /AmazonS3/i } }], ['Google Cloud', 'Hospedagem', { h: { server: /Google Frontend|gws/i, via: /google/i } }], ['Azure', 'Hospedagem', { h: { 'x-azure-ref': /./, 'x-ms-request-id': /./ } }],
  ['Google Analytics', 'Análise', { html: /google-analytics\.com\/(analytics|ga)\.js|gtag\/js\?id=G-|googletagmanager\.com\/gtag/i }], ['Google Tag Manager', 'Análise', { html: /googletagmanager\.com\/gtm\.js/i }], ['Meta Pixel', 'Análise', { html: /connect\.facebook\.net\/[^"']*\/fbevents\.js/i }],
  ['Hotjar', 'Análise', { html: /static\.hotjar\.com/i }], ['RD Station', 'Marketing', { html: /d335luupugsy2\.cloudfront\.net|rdstation/i }], ['HubSpot', 'Marketing', { html: /js\.hs-scripts\.com|hs-analytics/i }],
  ['reCAPTCHA', 'Segurança', { html: /google\.com\/recaptcha|grecaptcha/i }], ['hCaptcha', 'Segurança', { html: /hcaptcha\.com/i }], ['Zendesk', 'Atendimento', { html: /static\.zdassets\.com/i }], ['Intercom', 'Atendimento', { html: /widget\.intercom\.io/i }],
  ['Jivo', 'Atendimento', { html: /code\.jivosite\.com/i }], ['Font Awesome', 'Fontes', { html: /font-?awesome/i }], ['Google Fonts', 'Fontes', { html: /fonts\.googleapis\.com/i }],
];
export function tecnologiasDe(r) {
  const h = r.headers || {}, html = String(r.texto || '').slice(0, 1_500_000), cookie = String(h['set-cookie'] || '');
  const gerador = (html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i) || [])[1] || '';
  const out = [];
  for (const [nome, cat, a] of ASSINATURAS) {
    let versao = '', achou = false;
    const testa = (re, alvo) => { const m = alvo && String(alvo).match(re); if (m) { achou = true; if (m[1] && /^\d/.test(m[1])) versao = versao || m[1]; } };
    if (a.html) testa(a.html, html);
    if (a.gerador) testa(a.gerador, gerador);
    if (a.cookie) testa(a.cookie, cookie);
    for (const [k, re] of Object.entries(a.h || {})) testa(re, h[k]);
    if (achou) out.push({ nome, cat, versao });
  }
  return out;
}
export async function tecnologias(ctx, dominio) {
  let r;
  try { r = await ctx.pagina(`https://${dominio}/`); } catch { r = await ctx.pagina(`http://${dominio}/`); }
  const ts = tecnologiasDe(r);
  // versão exposta no cabeçalho ajuda quem ataca a achar CVE: vira alerta
  return {
    entidades: ts.map((t) => ent('tecnologia', t.nome, 'usa', { props: { categoria: t.cat, versão: t.versao ? `${t.versao} (no site ${dominio})` : '' } })),
    props: { tecnologias: ts.map((t) => t.nome + (t.versao ? ' ' + t.versao : '')).join(', '), 'versão exposta': ts.filter((t) => t.versao && ['Servidor web', 'Linguagem'].includes(t.cat)).map((t) => `${t.nome} ${t.versao}`).join(', ') },
    aviso: ts.length ? '' : 'Nenhuma tecnologia reconhecida (o site pode estar atrás de um proxy que esconde tudo).',
  };
}

// ---------- contatos de segurança: security.txt e o responsável no SOA ----------
export function lerSecurityTxt(texto) {
  const out = { contatos: [], politica: '', expira: '', idiomas: '' };
  for (const linha of String(texto || '').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z-]+)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const [, k, v] = m;
    if (/^contact$/i.test(k)) out.contatos.push(v);
    if (/^policy$/i.test(k)) out.politica = v;
    if (/^expires$/i.test(k)) out.expira = v.slice(0, 10);
    if (/^preferred-languages$/i.test(k)) out.idiomas = v;
  }
  return out;
}
export async function contatosSeguranca(ctx, dominio) {
  const out = [];
  let st = null;
  for (const u of [`https://${dominio}/.well-known/security.txt`, `https://${dominio}/security.txt`]) {
    try { const r = await ctx.pagina(u); if (r.status === 200 && /contact\s*:/i.test(r.texto) && !/<html/i.test(r.texto)) { st = lerSecurityTxt(r.texto); out.push(ent('url', u, 'security.txt')); break; } } catch {}
  }
  for (const c of (st && st.contatos) || []) {
    if (/^mailto:/i.test(c)) out.push(ent('email', c.replace(/^mailto:/i, ''), 'contato de segurança'));
    else if (/^https?:/i.test(c)) out.push(ent('url', c, 'contato de segurança'));
    else if (/^tel:/i.test(c)) out.push(ent('telefone', c.replace(/^tel:/i, ''), 'contato de segurança'));
  }
  if (st && st.politica) out.push(ent('url', st.politica, 'política de divulgação'));
  // SOA: "ns1.host. hostmaster.exemplo.com. ..." -> hostmaster@exemplo.com
  const soa = (await dns(ctx, dominio, 'SOA').catch(() => []))[0] || '';
  const rname = soa.split(/\s+/)[1] || '';
  if (rname && rname.includes('.')) { const [u, ...d] = semPonto(rname).replace(/\\\./g, '\u0000').split('.'); if (d.length) out.push(ent('email', `${u.replace(/\u0000/g, '.')}@${d.join('.')}`, 'responsável pelo DNS (SOA)')); }
  return { entidades: unicos(out), props: { 'security.txt': st ? `sim${st.expira ? `, vence em ${st.expira}` : ''}` : 'não tem (pesquisadores não sabem a quem avisar de uma falha)' } };
}

// ---------- AlienVault OTX: reputação e DNS passivo ----------
const OTX = 'https://otx.alienvault.com/api/v1/indicators/';
const secaoOTX = (tipo, valor) => (tipo === 'ip' ? (valor.includes(':') ? 'IPv6/' : 'IPv4/') + valor : tipo === 'dominio' ? 'domain/' + valor : tipo === 'hash' ? 'file/' + valor : 'url/' + encodeURIComponent(valor));
export async function otx(ctx, valor, tipo) {
  const d = await ctx.json(OTX + secaoOTX(tipo, valor) + '/general', { timeout: 40000 });
  const p = (d && d.pulse_info) || {};
  const pulsos = p.pulses || [];
  // os relatórios são da comunidade e qualquer um rotula qualquer coisa (até spam repetido): os nomes de malware e de
  // grupos não viram entidades, só a contagem e os títulos, para a pessoa conferir
  return {
    entidades: [], alerta: (p.count || 0) > 0,
    props: { OTX: p.count ? `${p.count} relatórios de ameaça citam este item` : 'nenhum relatório de ameaça', 'relatórios OTX': pulsos.slice(0, 3).map((x) => x.name).join(' · '), etiquetas: [...new Set(pulsos.flatMap((x) => x.tags || []))].slice(0, 8).join(', ') },
  };
}

// ---------- organização: Wikidata ----------
const WD = 'https://www.wikidata.org/w/api.php?format=json&';
export async function wikidata(ctx, nome) {
  const busca = await ctx.json(`${WD}action=wbsearchentities&language=pt&uselang=pt&type=item&limit=1&search=${encodeURIComponent(nome)}`);
  const item = ((busca && busca.search) || [])[0];
  if (!item) return { entidades: [], aviso: 'O Wikidata não conhece esta organização.' };
  const e = (await ctx.json(`${WD}action=wbgetentities&props=claims|descriptions|sitelinks&languages=pt|en&ids=${item.id}`)).entities[item.id];
  const c = e.claims || {};
  const vals = (p) => (c[p] || []).map((x) => x.mainsnak && x.mainsnak.datavalue && x.mainsnak.datavalue.value).filter(Boolean);
  const ids = ['P159', 'P17', 'P452', 'P749', 'P127', 'P112', 'P169', 'P355'].flatMap((p) => vals(p).map((v) => v.id)).filter(Boolean).slice(0, 45);
  const rotulos = ids.length ? (await ctx.json(`${WD}action=wbgetentities&props=labels&languages=pt|en&ids=${[...new Set(ids)].join('|')}`)).entities : {};
  const r = (v) => { const l = rotulos[v.id] && rotulos[v.id].labels; return (l && (l.pt || l.en) || {}).value || ''; };
  const out = [];
  for (const u of vals('P856').slice(0, 3)) { try { out.push(ent('dominio', new URL(u).hostname.replace(/^www\./, ''), 'site oficial')); } catch {} }
  for (const v of vals('P159').slice(0, 2)) if (r(v)) out.push(ent('local', r(v), 'sede'));
  for (const [p, lig] of [['P749', 'empresa-mãe'], ['P127', 'pertence a'], ['P355', 'controla']]) for (const v of vals(p).slice(0, 6)) if (r(v)) out.push(ent('organizacao', r(v), lig));
  for (const [p, lig] of [['P112', 'fundada por'], ['P169', 'presidente']]) for (const v of vals(p).slice(0, 4)) if (r(v)) out.push(ent('pessoa', r(v), lig));
  const fundacao = (vals('P571')[0] || {}).time;
  return {
    entidades: unicos(out),
    props: { descrição: ((e.descriptions || {}).pt || (e.descriptions || {}).en || {}).value || '', fundação: fundacao ? fundacao.slice(1, 5) : '', país: vals('P17').map(r).filter(Boolean).join(', '), setor: vals('P452').map(r).filter(Boolean).slice(0, 3).join(', '), Wikidata: `https://www.wikidata.org/wiki/${item.id}`, Wikipédia: e.sitelinks && e.sitelinks.ptwiki ? `https://pt.wikipedia.org/wiki/${encodeURIComponent(e.sitelinks.ptwiki.title.replace(/ /g, '_'))}` : '' },
  };
}

// ---------- CNPJ: dados da Receita (BrasilAPI, com a Minha Receita de reserva) ----------
export async function cnpj(ctx, valor) {
  const num = valor.replace(/\D/g, '');
  let d = null;
  try { d = await ctx.json(`https://brasilapi.com.br/api/cnpj/v1/${num}`, { nulo404: true, timeout: 30000 }); } catch {}
  if (!d) d = await ctx.json(`https://minhareceita.org/${num}`, { nulo404: true, timeout: 30000 });
  if (!d) return { entidades: [], aviso: 'A Receita não tem este CNPJ.' };
  const out = [];
  if (d.razao_social) out.push(ent('organizacao', d.razao_social, 'razão social'));
  if (d.nome_fantasia && d.nome_fantasia !== d.razao_social) out.push(ent('organizacao', d.nome_fantasia, 'nome fantasia'));
  for (const s of d.qsa || []) {
    if (!s.nome_socio) continue;
    const doc = String(s.cnpj_cpf_do_socio || '');
    const props = { 'na sociedade desde': s.data_entrada_sociedade || '', 'faixa etária': s.faixa_etaria || '', 'CPF na Receita': /^\*{3}\d{6}\*{2}$/.test(doc) ? doc : '' };
    // sócio que é empresa vira CNPJ (dá para abrir a holding em seguida); pessoa leva o CPF mascarado, que cruza com um CPF do grafo
    if (doc.replace(/\D/g, '').length === 14 && cnpjValido(doc)) out.push(ent('cnpj', doc, (s.qualificacao_socio || 'sócia').toLowerCase(), { rotulo: s.nome_socio, props: { nome: s.nome_socio, 'na sociedade desde': props['na sociedade desde'] } }));
    else out.push(ent('pessoa', s.nome_socio, (s.qualificacao_socio || 'sócio').toLowerCase(), { props }));
    if (s.nome_representante_legal) out.push(ent('pessoa', s.nome_representante_legal, `representa ${s.nome_socio}`));
  }
  const endereco = [[d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' '), d.numero, d.complemento, d.bairro, d.municipio && `${d.municipio}${d.uf ? ' - ' + d.uf : ''}`].filter(Boolean).join(', ');
  if (endereco) out.push(ent('local', endereco, 'endereço na Receita', { props: { CEP: d.cep || '' } }));
  if (d.cep && String(d.cep).replace(/\D/g, '').length === 8) out.push(ent('cep', d.cep, 'CEP na Receita'));
  for (const t of [d.ddd_telefone_1, d.ddd_telefone_2]) if (t && t.replace(/\D/g, '').length >= 10) out.push(ent('telefone', '+55' + t.replace(/\D/g, ''), 'telefone na Receita'));
  if (d.email && /@/.test(d.email)) out.push(ent('email', d.email.toLowerCase(), 'e-mail na Receita'));
  // filial aponta para a matriz (mesma raiz de 8 dígitos, ordem 0001)
  if (/filial/i.test(d.descricao_identificador_matriz_filial || '')) {
    const raiz = num.slice(0, 8) + '0001';
    for (let dv = 0; dv < 100; dv++) { const c = raiz + String(dv).padStart(2, '0'); if (cnpjValido(c)) { out.push(ent('cnpj', c, 'matriz')); break; } }
  }
  const situacao = d.descricao_situacao_cadastral || '';
  const simples = d.opcao_pelo_mei ? 'MEI' : d.opcao_pelo_simples ? 'Simples Nacional' : d.opcao_pelo_simples === false ? 'não é do Simples' : '';
  return {
    entidades: unicos(out), alerta: !!situacao && !/ativa/i.test(situacao),
    props: {
      situação: situacao + (d.descricao_motivo_situacao_cadastral && !/sem motivo/i.test(d.descricao_motivo_situacao_cadastral) ? ` (${d.descricao_motivo_situacao_cadastral.toLowerCase()})` : ''), 'situação desde': d.data_situacao_cadastral || '',
      abertura: d.data_inicio_atividade || '', atividade: d.cnae_fiscal_descricao || '', 'outras atividades': (d.cnaes_secundarios || []).map((c) => c.descricao).filter(Boolean).slice(0, 6).join('; '),
      'capital social': d.capital_social ? Number(d.capital_social).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '', porte: d.porte || '', natureza: d.natureza_juridica || '', regime: simples,
      tipo: d.descricao_identificador_matriz_filial || '', 'situação especial': d.situacao_especial || '',
      risco: situacao && !/ativa/i.test(situacao) ? `empresa com situação ${situacao.toLowerCase()} na Receita` : '',
    },
  };
}

// ---------- CPF: só o que é público e legítimo ----------
// Não existe fonte pública que diga de quem é um CPF (os serviços que dizem usam bases vazadas, e o Bluetego não usa).
// O que dá para saber: se é válido, a região fiscal de emissão, e se ele combina com o CPF mascarado de um sócio
// (as pistas fazem esse cruzamento com as empresas que já estão no grafo).
export function cpf(_ctx, valor) {
  const r = regiaoCPF(valor);
  return { entidades: [], props: { válido: 'sim (dígitos verificadores conferem)', 'região fiscal de emissão': r ? `${r} (onde foi emitido, não onde a pessoa mora)` : '', cruzamento: 'abra os CNPJs ligados à investigação: se este CPF for de um sócio, a aba Análise sugere a ligação' } };
}

// ---------- CEP: endereço e coordenadas ----------
export async function cep(ctx, valor) {
  const d = await ctx.json(`https://brasilapi.com.br/api/cep/v2/${valor.replace(/\D/g, '')}`, { nulo404: true });
  if (!d) return { entidades: [], aviso: 'CEP não encontrado.' };
  const lugar = [d.street, d.neighborhood, d.city && `${d.city}${d.state ? ' - ' + d.state : ''}`].filter(Boolean).join(', ');
  const geo = d.location && d.location.coordinates;
  const lat = geo && geo.latitude, lon = geo && geo.longitude;
  return {
    entidades: lugar ? [ent('local', lugar, 'endereço do CEP', { props: lat ? { latitude: lat, longitude: lon, mapa: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}` } : {} })] : [],
    props: { cidade: d.city || '', estado: d.state || '', bairro: d.neighborhood || '', rua: d.street || '', 'código IBGE': (d.ibge && d.ibge.city) || '', abrangência: d.street ? 'rua' : 'cidade inteira (CEP geral)' },
  };
}

// ---------- nomes de pessoas ----------
// pessoa pública no Wikidata: profissão, onde trabalha e estudou, e as contas oficiais que o Wikidata registra
const CONTAS_WD = [['P2002', (v) => `https://x.com/${v}`, 'X'], ['P2003', (v) => `https://www.instagram.com/${v}`, 'Instagram'], ['P2037', (v) => `https://github.com/${v}`, 'GitHub'], ['P6634', (v) => `https://www.linkedin.com/in/${v}`, 'LinkedIn'], ['P2013', (v) => `https://www.facebook.com/${v}`, 'Facebook'], ['P2397', (v) => `https://www.youtube.com/channel/${v}`, 'YouTube'], ['P4033', (v) => { const [u, h] = String(v).split('@'); return h ? `https://${h}/@${u}` : ''; }, 'Mastodon'], ['P7085', (v) => `https://www.tiktok.com/@${v}`, 'TikTok'], ['P12361', (v) => `https://bsky.app/profile/${v}`, 'Bluesky'], ['P496', (v) => `https://orcid.org/${v}`, 'ORCID']];
export async function pessoaWikidata(ctx, nome) {
  const busca = await ctx.json(`${WD}action=wbsearchentities&language=pt&uselang=pt&type=item&limit=5&search=${encodeURIComponent(nome)}`);
  const ids = ((busca && busca.search) || []).map((x) => x.id);
  if (!ids.length) return { entidades: [], aviso: 'O Wikidata não conhece ninguém com este nome (só pessoas públicas estão lá).' };
  const ents = (await ctx.json(`${WD}action=wbgetentities&props=claims|descriptions|labels|sitelinks&languages=pt|en&ids=${ids.join('|')}`)).entities || {};
  // só serve item que é ser humano (P31 = Q5)
  const e = ids.map((id) => ents[id]).find((x) => x && ((x.claims && x.claims.P31) || []).some((c) => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value.id === 'Q5'));
  if (!e) return { entidades: [], aviso: 'Nenhuma pessoa pública com este nome no Wikidata.' };
  const c = e.claims || {};
  const vals = (p) => (c[p] || []).map((x) => x.mainsnak && x.mainsnak.datavalue && x.mainsnak.datavalue.value).filter(Boolean);
  const refs = ['P106', 'P108', 'P69', 'P27', 'P19', 'P39', 'P102', 'P463'].flatMap((p) => vals(p).map((v) => v.id)).filter(Boolean).slice(0, 45);
  const rot = refs.length ? (await ctx.json(`${WD}action=wbgetentities&props=labels&languages=pt|en&ids=${[...new Set(refs)].join('|')}`)).entities : {};
  const r = (v) => { const l = rot[v.id] && rot[v.id].labels; return (l && (l.pt || l.en) || {}).value || ''; };
  const out = [];
  for (const [p, lig] of [['P108', 'trabalha ou trabalhou em'], ['P69', 'estudou em'], ['P102', 'partido'], ['P463', 'membro de']]) for (const v of vals(p).slice(0, 6)) if (r(v)) out.push(ent('organizacao', r(v), lig));
  for (const v of vals('P19').slice(0, 1)) if (r(v)) out.push(ent('local', r(v), 'nasceu em'));
  for (const [p, url, site] of CONTAS_WD) for (const v of vals(p).slice(0, 2)) { const u = url(v); if (u) out.push(ent('conta', u, `conta oficial no ${site} (Wikidata)`)); }
  for (const u of vals('P856').slice(0, 2)) out.push(ent('url', u, 'site oficial'));
  const nasc = (vals('P569')[0] || {}).time;
  const rotulo = ((e.labels || {}).pt || (e.labels || {}).en || {}).value || nome;
  return {
    entidades: unicos(out),
    props: { 'no Wikidata': rotulo, descrição: ((e.descriptions || {}).pt || (e.descriptions || {}).en || {}).value || '', profissão: vals('P106').map(r).filter(Boolean).slice(0, 4).join(', '), cargos: vals('P39').map(r).filter(Boolean).slice(0, 4).join(', '), nacionalidade: vals('P27').map(r).filter(Boolean).join(', '), nascimento: nasc ? nasc.slice(1, 5) : '', Wikidata: `https://www.wikidata.org/wiki/${e.id}`, Wikipédia: e.sitelinks && e.sitelinks.ptwiki ? `https://pt.wikipedia.org/wiki/${encodeURIComponent(e.sitelinks.ptwiki.title.replace(/ /g, '_'))}` : '', atenção: rotulo.toLowerCase() !== nome.toLowerCase() ? `o Wikidata achou "${rotulo}": confirme se é a mesma pessoa` : '' },
  };
}
// pesquisadores: o ORCID registra nome e instituição
export async function orcid(ctx, nome) {
  const p = String(nome).trim().split(/\s+/);
  if (p.length < 2) return { entidades: [], aviso: 'Use o nome completo.' };
  const q = `given-names:${encodeURIComponent(p[0])}%20AND%20family-name:${encodeURIComponent(p[p.length - 1])}`;
  const d = await ctx.json(`https://pub.orcid.org/v3.0/expanded-search/?q=${q}&rows=15`);
  const res = (d && d['expanded-result']) || [];
  const out = [];
  for (const x of res) {
    const nomeX = [x['given-names'], x['family-names']].filter(Boolean).join(' ');
    const conta = ent('conta', `https://orcid.org/${x['orcid-id']}`, 'pesquisador com este nome (ORCID)', { rotulo: `ORCID · ${nomeX}`, props: { nome: nomeX, 'outros nomes': (x['other-name'] || []).join(', '), instituições: (x['institution-name'] || []).slice(0, 4).join('; ') } });
    out.push(conta);
    for (const inst of (x['institution-name'] || []).slice(0, 3)) out.push(ent('organizacao', inst, 'instituição no ORCID', { de: { tipo: 'conta', valor: conta.valor } }));
    for (const e of x.email || []) out.push(ent('email', e, 'e-mail público no ORCID', { de: { tipo: 'conta', valor: conta.valor } }));
  }
  return { ...corta(unicos(out), ctx), props: { ORCID: `${d ? d['num-found'] || 0 : 0} pesquisadores com este nome` }, aviso: res.length ? (res.length > 1 ? 'Vários pesquisadores com o mesmo nome: confira a instituição antes de ligar.' : '') : 'Nenhum pesquisador com este nome no ORCID.' };
}
// contas do GitHub cujo nome de exibição é este nome
export async function githubNome(ctx, nome) {
  if (String(nome).trim().split(/\s+/).length < 2) return { entidades: [], aviso: 'Use o nome completo: só o primeiro nome traria milhares de contas.' };
  const r = await ghJson(ctx, `search/users?q=${encodeURIComponent('"' + nome + '" in:name')}&per_page=15`);
  const itens = (r && r.items) || [];
  return { entidades: itens.map((x) => ent('apelido', x.login, 'conta do GitHub com este nome (pode ser homônimo)', { props: { GitHub: x.html_url } })), props: { 'contas no GitHub com este nome': r ? r.total_count || 0 : 0 }, aviso: itens.length ? '' : 'Nenhuma conta do GitHub com este nome.' };
}
// artigos da Wikipédia que citam o nome (pessoa ou organização)
// a Wikipédia em português e em inglês (conteúdo CC BY-SA: cite a fonte)
export async function wikipedia(ctx, nome) {
  const busca = (l) => ctx.json(`https://${l}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=8&srsearch=${encodeURIComponent('"' + nome + '"')}`).then((d) => ({ l, d })).catch(() => ({ l, d: null }));
  const res = await Promise.all(['pt', 'en'].map(busca));
  const out = res.flatMap(({ l, d }) => ((d && d.query && d.query.search) || []).map((a) => ent('url', `https://${l}.wikipedia.org/wiki/${encodeURIComponent(a.title.replace(/ /g, '_'))}`, `citado na Wikipédia (${l})`, { rotulo: `Wikipédia ${l} · ${a.title}`, props: { trecho: tira(a.snippet) } })));
  const tot = (l) => { const x = res.find((r) => r.l === l); return (x && x.d && x.d.query && x.d.query.searchinfo && x.d.query.searchinfo.totalhits) || 0; };
  return { ...corta(out, ctx), props: { Wikipédia: `${tot('pt')} artigos em português, ${tot('en')} em inglês citam o nome` }, aviso: out.length ? '' : 'Nenhum artigo da Wikipédia cita este nome.' };
}

// ---------- ASN: vizinhos (quem dá e quem recebe trânsito) ----------
export async function asnVizinhos(ctx, asn) {
  const d = (await ripe(ctx, 'asn-neighbours', asn)).data || {};
  const viz = (d.neighbours || []).filter((v) => v.type !== 'uncertain').sort((a, b) => (b.power || 0) - (a.power || 0));
  return corta(viz.map((v) => ent('asn', 'AS' + v.asn, v.type === 'left' ? 'recebe trânsito de' : 'dá trânsito para', { props: { força: v.power || '' } })), ctx, viz.length);
}

// ---------- GitHub: repositórios, linguagens e organizações ----------
export async function githubRepos(ctx, apelido) {
  const u = encodeURIComponent(apelido.replace(/^@/, ''));
  const repos = await ghJson(ctx, `users/${u}/repos?sort=updated&per_page=100`);
  if (!repos) return { entidades: [], aviso: 'Não existe usuário do GitHub com este nome.' };
  const proprios = repos.filter((r) => !r.fork).sort((a, b) => b.stargazers_count - a.stargazers_count);
  const out = proprios.slice(0, 12).map((r) => ent('url', r.html_url, 'repositório', { rotulo: r.name, props: { estrelas: r.stargazers_count, linguagem: r.language || '', descrição: r.description || '', 'atualizado em': data(r.pushed_at) } }));
  const linguagens = {};
  for (const r of proprios) if (r.language) linguagens[r.language] = (linguagens[r.language] || 0) + 1;
  for (const [l, q] of Object.entries(linguagens).sort((a, b) => b[1] - a[1]).slice(0, 6)) out.push(ent('tecnologia', l, 'programa em', { props: { categoria: 'Linguagem', repositórios: q } }));
  try { for (const o of (await ghJson(ctx, `users/${u}/orgs`)) || []) out.push(ent('organizacao', o.login, 'membro no GitHub', { props: { GitHub: `https://github.com/${o.login}` } })); } catch {}
  return { entidades: unicos(out), props: { 'repositórios próprios': proprios.length, forks: repos.length - proprios.length } };
}

// ---------- local: coordenadas (OpenStreetMap) ----------
export async function coordenadas(ctx, local) {
  const r = (await ctx.json(`https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&accept-language=pt-BR&q=${encodeURIComponent(local)}`)) || [];
  const p = r[0];
  if (!p) return { entidades: [], aviso: 'O OpenStreetMap não achou este lugar.' };
  return { entidades: [], props: { latitude: p.lat, longitude: p.lon, 'endereço completo': p.display_name, tipo: p.type || '', mapa: `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=15/${p.lat}/${p.lon}` } };
}

// ---------- carteira de Bitcoin ----------
export async function bitcoin(ctx, endereco) {
  const a = await ctx.json(`https://blockstream.info/api/address/${endereco}`, { nulo404: true });
  if (!a) return { entidades: [], aviso: 'Endereço de Bitcoin desconhecido.' };
  const s = a.chain_stats || {};
  const btc = (sat) => `${(Number(sat || 0) / 1e8).toLocaleString('pt-BR', { maximumFractionDigits: 8 })} BTC`;
  const txs = (await ctx.json(`https://blockstream.info/api/address/${endereco}/txs`).catch(() => [])) || [];
  const enviaram = new Map(), receberam = new Map();
  for (const t of txs) {
    const entrou = t.vin.some((v) => v.prevout && v.prevout.scriptpubkey_address === endereco);
    if (entrou) for (const o of t.vout) { if (o.scriptpubkey_address && o.scriptpubkey_address !== endereco) receberam.set(o.scriptpubkey_address, (receberam.get(o.scriptpubkey_address) || 0) + o.value); }
    else for (const v of t.vin) { const x = v.prevout && v.prevout.scriptpubkey_address; if (x && x !== endereco) enviaram.set(x, (enviaram.get(x) || 0) + v.prevout.value); }
  }
  const top = (m) => [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
  const out = [...top(enviaram).map(([x, v]) => ent('cripto', x, 'enviou para esta carteira', { props: { valor: btc(v) } })), ...top(receberam).map(([x, v]) => ent('cripto', x, 'recebeu desta carteira', { props: { valor: btc(v) } }))];
  return {
    entidades: out,
    props: { saldo: btc((s.funded_txo_sum || 0) - (s.spent_txo_sum || 0)), recebido: btc(s.funded_txo_sum), transações: s.tx_count || 0, explorador: `https://mempool.space/address/${endereco}` },
    aviso: txs.length >= 25 ? 'Só as 25 transações mais recentes entram nas ligações.' : '',
  };
}

// ---------- subdomínios de várias fontes (como o Amass): quem achou cada um fica nas propriedades ----------
const ehSub = (d, dominio) => d.endsWith('.' + dominio) && d !== dominio && !/[^a-z0-9.-]/.test(d) && !d.startsWith('*');
const FONTES_SUB = {
  'crt.sh': async (ctx, dominio) => {
    const lista = await ctx.json(`https://crt.sh/?q=${encodeURIComponent('%.' + dominio)}&output=json`, { timeout: 60000 });
    const out = [];
    for (const c of Array.isArray(lista) ? lista : []) for (const n of String(c.name_value || '').split(/\n/)) out.push([normalizar('dominio', n), data(c.not_before)]);
    return out;
  },
  certspotter: async (ctx, dominio) => {
    const lista = await ctx.json(`https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(dominio)}&include_subdomains=true&expand=dns_names`, { timeout: 40000 });
    return (Array.isArray(lista) ? lista : []).flatMap((c) => (c.dns_names || []).map((n) => [normalizar('dominio', n), data(c.not_before)]));
  },
  HackerTarget: async (ctx, dominio) => {
    const r = await ctx.pagina(`https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(dominio)}`);
    if (r.status !== 200 || /error|API count exceeded/i.test(r.texto.slice(0, 200))) return [];
    return r.texto.split('\n').map((l) => [normalizar('dominio', l.split(',')[0]), '']);
  },
  Wayback: async (ctx, dominio) => {
    const linhas = await ctx.json(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent('*.' + dominio)}&output=json&fl=original&collapse=urlkey&limit=5000`, { timeout: 60000 });
    return (Array.isArray(linhas) ? linhas.slice(1) : []).map(([u]) => { try { return [new URL(/^https?:/.test(u) ? u : 'http://' + u).hostname.toLowerCase().replace(/^www\./, ''), '']; } catch { return ['', '']; } });
  },
};
export async function subdominios(ctx, dominio) {
  const nomes = new Map(), contagem = {};
  // cada fonte pode cair sem derrubar as outras
  await Promise.all(Object.entries(FONTES_SUB).map(async ([fonte, fn]) => {
    let lista = [];
    try { lista = await fn(ctx, dominio); } catch { contagem[fonte] = 'fora do ar'; return; }
    const achados = new Set();
    for (const [d, quando] of lista) {
      if (!ehSub(d, dominio)) continue;
      achados.add(d);
      const v = nomes.get(d) || { fontes: new Set(), quando: '' };
      v.fontes.add(fonte);
      if (quando > v.quando) v.quando = quando;
      nomes.set(d, v);
    }
    contagem[fonte] = achados.size;
  }));
  // primeiro os que mais fontes confirmam, depois os de certificado mais recente
  const ord = [...nomes.entries()].sort((a, b) => b[1].fontes.size - a[1].fontes.size || (b[1].quando || '').localeCompare(a[1].quando || '') || a[0].localeCompare(b[0]));
  const r = corta(ord.map(([d, v]) => ent('dominio', d, 'subdomínio', { props: { 'achado por': [...v.fontes].join(', '), 'último certificado': v.quando } })), ctx, ord.length);
  return { ...r, props: { 'subdomínios por fonte': Object.entries(contagem).map(([f, q]) => `${f}: ${q}`).join(' · '), 'subdomínios achados': ord.length } };
}

// ---------- IP: todos os domínios que já apontaram para ele (DNS passivo do OTX + DNS reverso da HackerTarget) ----------
export async function mesmoIP(ctx, ip) {
  const vistos = new Map();
  const anota = (h, fonte, extra = {}) => { const d = normalizar('dominio', h); if (!d || ehIP(d) || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)) return; const v = vistos.get(d) || { fontes: new Set(), ultimo: '' }; v.fontes.add(fonte); if (extra.ultimo > v.ultimo) Object.assign(v, extra); vistos.set(d, v); };
  await Promise.all([
    ctx.json(OTX + secaoOTX('ip', ip) + '/passive_dns', { timeout: 40000 }).then((d) => { for (const r of (d && d.passive_dns) || []) if (r.hostname) anota(r.hostname, 'OTX', { primeiro: data(r.first), ultimo: data(r.last) }); }).catch(() => {}),
    ip.includes(':') ? null : ctx.pagina(`https://api.hackertarget.com/reverseiplookup/?q=${ip}`).then((r) => { if (r.status === 200 && !/error|No DNS A records|API count/i.test(r.texto.slice(0, 120))) for (const l of r.texto.split('\n')) anota(l.trim(), 'HackerTarget'); }).catch(() => {}),
  ]);
  const ord = [...vistos.entries()].sort((a, b) => b[1].fontes.size - a[1].fontes.size || String(b[1].ultimo).localeCompare(String(a[1].ultimo)));
  return { ...corta(ord.map(([d, v]) => ent('dominio', d, 'aponta ou já apontou para este IP', { props: { 'achado por': [...v.fontes].join(', '), 'visto de': v.primeiro || '', 'visto até': v.ultimo || '' } })), ctx, ord.length), props: { 'domínios no IP': ord.length }, aviso: ord.length ? '' : 'Nenhum domínio conhecido neste IP.' };
}

// ---------- IDs de rastreamento (Analytics, AdSense, Tag Manager, Pixel): o pivô clássico entre sites do mesmo dono ----------
const RASTREADORES = [
  [/\bUA-\d{4,10}-\d{1,4}\b/g, 'Google Analytics (antigo)'], [/\bG-[A-Z0-9]{8,12}\b/g, 'Google Analytics 4'], [/\bGTM-[A-Z0-9]{4,9}\b/g, 'Google Tag Manager'],
  [/\bca-pub-\d{10,20}\b/g, 'Google AdSense'], [/\bAW-\d{6,12}\b/g, 'Google Ads'], [/fbq\(\s*['"]init['"]\s*,\s*['"](\d{10,20})['"]/g, 'Meta Pixel'],
  [/hjid['"]?\s*[:=]\s*(\d{5,10})/g, 'Hotjar'], [/clarity\.ms\/tag\/([a-z0-9]{8,12})/g, 'Microsoft Clarity'],
];
export function rastreadoresDe(html) {
  const out = new Map();
  for (const [re, nome] of RASTREADORES) for (const m of String(html || '').matchAll(re)) { const id = m[1] || m[0]; if (!/^G-[A-Z]+$/.test(id) || /\d/.test(id)) out.set(id, nome); }
  return [...out.entries()].map(([id, nome]) => ({ id, nome }));
}
export async function rastreadores(ctx, dominio) {
  let r;
  try { r = await ctx.pagina(`https://${dominio}/`, { navegador: true }); } catch { r = await ctx.pagina(`http://${dominio}/`, { navegador: true }); }
  const ids = rastreadoresDe(r.texto);
  return { entidades: ids.map((x) => ent('rastreador', x.id, 'usa o ID de rastreamento', { props: { serviço: x.nome } })), aviso: ids.length ? '' : 'Nenhum ID de rastreamento na página inicial.' };
}
// outros sites com o mesmo ID (a HackerTarget indexa Analytics e AdSense)
export async function rastreadorSites(ctx, id) {
  const r = await ctx.pagina(`https://api.hackertarget.com/analyticslookup/?q=${encodeURIComponent(id)}`);
  const t = String(r.texto || '');
  if (/API count exceeded/i.test(t)) throw new Falha('A HackerTarget deixa 50 consultas gratuitas por dia, e elas acabaram. Tente amanhã.', { status: 429 });
  if (r.status !== 200 || /no results|error/i.test(t.slice(0, 80))) return { entidades: [], aviso: 'Nenhum outro site conhecido com este ID.' };
  const doms = [...new Set(t.split('\n').map((l) => normalizar('dominio', l.split(',')[0].trim())).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)))];
  return { ...corta(doms.map((d) => ent('dominio', d, 'usa o mesmo ID', { alerta: false })), ctx, doms.length), props: { 'sites com este ID': doms.length } };
}

// ---------- documentos públicos e os metadados deles (como o FOCA) ----------
const EXT_DOC = /\.(pdf|docx|xlsx|pptx)(\?|$)/i;
export async function documentos(ctx, dominio) {
  const max = Math.max(3, Math.min(25, Math.round((Number(ctx.limite) || 40) / 4)));
  const cand = new Map();
  // os que a Wayback guardou (com a cópia, para quando o original sumiu) e os que a página inicial cita
  try {
    const linhas = await ctx.json(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(dominio + '/*')}&output=json&fl=original,timestamp,mimetype,statuscode&collapse=urlkey&limit=4000&filter=statuscode:200`, { timeout: 60000 });
    for (const [u, ts, mime] of (Array.isArray(linhas) ? linhas.slice(1) : [])) if (EXT_DOC.test(u) || /pdf|officedocument/.test(mime || '')) cand.set(u.replace(/^http:/, 'https:'), ts);
  } catch {}
  try {
    const r = await ctx.pagina(`https://${dominio}/`, { navegador: true });
    for (const m of String(r.texto).matchAll(/href=["']([^"']+)["']/gi)) { try { const u = new URL(m[1].replace(/&amp;/g, '&'), r.url).href; if (EXT_DOC.test(u) && new URL(u).hostname.endsWith(dominio)) cand.set(u, cand.get(u) || ''); } catch {} }
  } catch {}
  const lista = [...cand.entries()].slice(0, max);
  if (!lista.length) return { entidades: [], aviso: 'Nenhum documento público (PDF, Word, Excel, PowerPoint) achado no site nem na Wayback Machine.' };
  const out = [], resumo = { autores: new Set(), usuarios: new Set(), programas: new Set() };
  let lidos = 0;
  for (const [url, ts] of lista) {
    let b = await ctx.binario(url, { max: 15_000_000 }).catch(() => null);
    if ((!b || !b.dados) && ts) b = await ctx.binario(`https://web.archive.org/web/${ts}id_/${url}`, { max: 15_000_000 }).catch(() => null);
    const md = b && b.dados ? metadados(b.dados, url) : null;
    if (!md) continue;
    lidos++;
    const doc = ent('url', url, 'documento publicado', { rotulo: `${md.tipo}: ${curtoT(md.titulo || decodeURIComponent(url.split('/').pop().split('?')[0]), 50)}`, props: { título: md.titulo || '', autor: md.autor || '', 'último a editar': md.ultimoAutor || '', programa: [md.programa, md.produtor].filter(Boolean).join(' / '), empresa: md.empresa || '', criado: md.criado || '', modificado: md.modificado || '', caminhos: (md.caminhos || []).join(' | '), cifrado: md.cifrado || '' } });
    out.push(doc);
    const de = { tipo: 'url', valor: doc.valor };
    // nome de gente vira pessoa; login (jsilva, admin.ti) vira apelido; nome genérico de cargo ou máquina fica só na propriedade
    const gente = (n, lig) => {
      const s = String(n || '').trim();
      if (!s || s.length < 3 || /^(admin(istrador)?|user|usu[aá]rio|owner|author|unknown|desconhecido|pc|windows|microsoft|default)$/i.test(s) || /^[A-Z]{2,}:[A-Z:]+$/.test(s)) return;
      if (/\s/.test(s) && /^[\p{L}'. -]+$/u.test(s)) { out.push(ent('pessoa', s, lig, { de })); resumo.autores.add(s); } else if (/^[a-z0-9._-]{3,30}$/i.test(s)) { out.push(ent('apelido', s, lig, { de })); resumo.usuarios.add(s); }
    };
    gente(md.autor, 'autor do documento'); gente(md.ultimoAutor, 'último a editar o documento');
    for (const u of md.usuarios || []) { out.push(ent('apelido', u, 'usuário do Windows no documento', { de })); resumo.usuarios.add(u); }
    for (const e of md.emails || []) out.push(ent('email', e, 'citado no documento', { de }));
    if (md.empresa) out.push(ent('organizacao', md.empresa, 'empresa no documento', { de }));
    const prog = [md.programa, md.produtor].filter(Boolean)[0];
    if (prog) { out.push(ent('tecnologia', prog.replace(/\s*\(.*\)$/, ''), 'documento feito com', { de, props: { categoria: 'Software de escritório' } })); resumo.programas.add(prog); }
  }
  const alerta = resumo.usuarios.size > 0;
  return {
    entidades: unicos(out), alerta,
    props: { documentos: `${lidos} de ${cand.size} lidos`, 'autores nos documentos': [...resumo.autores].slice(0, 8).join(', '), 'usuários internos': [...resumo.usuarios].slice(0, 8).join(', '), 'programas usados': [...resumo.programas].slice(0, 6).join(', '), risco: alerta ? 'documentos públicos revelam nomes de usuário internos (servem para ataque de senha e phishing)' : '' },
    aviso: lidos ? '' : 'Os documentos achados não abriram (fora do ar, grandes demais ou formato antigo .doc/.xls).',
  };
}

// ---------- explorar o site: robots, sitemap, JavaScript, cabeçalhos e arquivos que não deviam estar à mostra ----------
// chaves e tokens que não deviam estar num arquivo público (o valor fica mascarado no grafo)
const SEGREDOS_JS = [
  [/\bAKIA[0-9A-Z]{16}\b/g, 'chave da AWS'], [/\bAIza[0-9A-Za-z_-]{35}\b/g, 'chave de API do Google'], [/\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}\b/g, 'chave secreta do Stripe'],
  [/\bxox[abprs]-[0-9A-Za-z-]{10,}\b/g, 'token do Slack'], [/\bgh[pousr]_[A-Za-z0-9]{36}\b/g, 'token do GitHub'], [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, 'chave privada'],
  [/\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, 'chave do SendGrid'], [/\bkey-[0-9a-f]{32}\b/g, 'chave do Mailgun'], [/https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]{20,}/g, 'webhook do Slack'],
];
const mascara = (s) => (s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s.slice(0, 3) + '…');
export function analisarJs(js, dominio) {
  const t = String(js || '');
  const endpoints = new Set(), hosts = new Set(), segredos = [];
  for (const m of t.matchAll(/["'`](\/(?:api|v[0-9]|graphql|rest|auth|oauth|admin|internal|private|wp-json|_next\/data)[A-Za-z0-9_\-/.{}:?=&]{0,100})["'`]/g)) endpoints.add(m[1]);
  for (const m of t.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) { const h = m[1].toLowerCase(); if (h.endsWith('.' + dominio) || h === dominio) hosts.add(h); }
  for (const [re, nome] of SEGREDOS_JS) for (const m of t.matchAll(re)) segredos.push({ nome, valor: mascara(m[0]) });
  return { endpoints: [...endpoints].slice(0, 40), hosts: [...hosts], segredos };
}
const CABECALHOS_SEG = [['strict-transport-security', 'HSTS'], ['content-security-policy', 'CSP'], ['x-frame-options', 'X-Frame-Options'], ['x-content-type-options', 'X-Content-Type-Options'], ['referrer-policy', 'Referrer-Policy'], ['permissions-policy', 'Permissions-Policy']];
export async function explorarSite(ctx, dominio) {
  const base = `https://${dominio}`, out = [];
  let inicio;
  try { inicio = await ctx.pagina(base + '/', { navegador: true }); } catch { throw new Falha(`${dominio} não respondeu em HTTPS.`, { status: 502 }); }
  const h = inicio.headers || {};
  const faltam = CABECALHOS_SEG.filter(([k]) => !h[k] && !(k === 'x-frame-options' && /frame-ancestors/i.test(h['content-security-policy'] || ''))).map(([, n]) => n);
  const props = { 'cabeçalhos de segurança que faltam': faltam.join(', ') || 'nenhum', 'servidor (versão exposta)': /\d/.test(h.server || '') ? h.server : '', 'feito com': h['x-powered-by'] || '' };
  // robots.txt: o que o dono pediu para os buscadores não olharem costuma ser exatamente o que interessa
  try {
    const rb = await ctx.pagina(base + '/robots.txt');
    if (rb.status === 200 && !/<html/i.test(rb.texto)) {
      const proibidos = [...rb.texto.matchAll(/^\s*Disallow:\s*(\S+)/gim)].map((m) => m[1]).filter((x) => x !== '/' && !/[*$?]/.test(x));
      props['robots.txt'] = `${proibidos.length} caminhos proibidos`;
      for (const pth of proibidos.slice(0, 25)) out.push(ent('url', base + (pth.startsWith('/') ? pth : '/' + pth), 'escondido no robots.txt', { alerta: CURIOSOS.test(pth), props: { robots: 'Disallow' } }));
      props.sitemaps = [...rb.texto.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1]).slice(0, 3).join(' ');
    }
  } catch {}
  // sitemap: só conta e tira o que é curioso e os subdomínios
  try {
    const sm = await ctx.pagina((props.sitemaps || '').split(' ')[0] || base + '/sitemap.xml');
    if (sm.status === 200 && /<(urlset|sitemapindex)/i.test(sm.texto)) {
      const urls = [...sm.texto.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      props.sitemap = `${urls.length} endereços`;
      for (const u of urls.filter((x) => CURIOSOS.test(x) && !/\.xml(\?|$)/i.test(x)).slice(0, 15)) out.push(ent('url', u, 'no sitemap', { alerta: true }));
      for (const hst of new Set(urls.map((u) => { try { return new URL(u).hostname; } catch { return ''; } }).filter((x) => x.endsWith('.' + dominio)))) out.push(ent('dominio', hst, 'subdomínio no sitemap'));
    }
  } catch {}
  // arquivos que nunca deviam responder
  const expostos = [];
  for (const [cam, prova, nome] of [['/.git/HEAD', /^ref: refs\//, 'repositório Git (.git) exposto'], ['/.env', /^[A-Z_][A-Z0-9_]*=/m, 'arquivo .env exposto (senhas e chaves do sistema)'], ['/.DS_Store', /Bud1/, '.DS_Store exposto (lista os arquivos da pasta)']]) {
    try { const r = await ctx.pagina(base + cam, { seguir: false }); if (r.status === 200 && prova.test(r.texto) && !/<html/i.test(r.texto.slice(0, 500))) { expostos.push(nome); out.push(ent('url', base + cam, nome, { alerta: true, props: { risco: nome } })); } } catch {}
  }
  // JavaScript do próprio site: rotas de API, subdomínios e chaves esquecidas
  const scripts = [...new Set([...String(inicio.texto).matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => { try { return new URL(m[1].replace(/&amp;/g, '&'), inicio.url).href; } catch { return ''; } }).filter((u) => { try { const x = new URL(u).hostname; return x === dominio || x.endsWith('.' + dominio) || x === new URL(inicio.url).hostname; } catch { return false; } }))].slice(0, 15);
  const achadosJs = { endpoints: new Set(), segredos: [] };
  for (const s of scripts) {
    try {
      const r = await ctx.pagina(s, { navegador: true });
      const a = analisarJs(r.texto, dominio);
      a.endpoints.forEach((e) => achadosJs.endpoints.add(e));
      for (const hst of a.hosts) out.push(ent('dominio', hst, 'citado no JavaScript'));
      for (const sg of a.segredos) { achadosJs.segredos.push(sg); out.push(ent('texto', `${sg.nome} exposta: ${sg.valor}`, 'segredo no JavaScript', { alerta: true, de: undefined, props: { arquivo: s, risco: `${sg.nome} num arquivo público: troque a chave e tire do código` } })); }
    } catch {}
  }
  Object.assign(props, { 'scripts lidos': scripts.length, 'rotas de API no JavaScript': [...achadosJs.endpoints].slice(0, 15).join(' '), 'arquivos expostos': expostos.join('; '), risco: [...expostos, ...achadosJs.segredos.map((x) => `${x.nome} no JavaScript`)].join('; ') });
  return { entidades: unicos(out), props, alerta: expostos.length > 0 || achadosJs.segredos.length > 0 };
}

// ---------- buscas prontas (dorks) para abrir no navegador ----------
const DORKS = {
  dominio: (v) => [['Documentos (PDF, Word, Excel)', `site:${v} (filetype:pdf OR filetype:docx OR filetype:xlsx OR filetype:pptx)`], ['Páginas de login e painéis', `site:${v} (inurl:login OR inurl:admin OR inurl:painel OR intitle:dashboard)`], ['Listagens de diretório', `site:${v} intitle:"index of"`], ['Arquivos de configuração e backup', `site:${v} (ext:env OR ext:sql OR ext:bak OR ext:log OR ext:conf OR ext:xml)`], ['Erros que vazam detalhes', `site:${v} ("SQL syntax" OR "Warning:" OR "Stack trace" OR "Traceback")`], ['Citado fora do próprio site', `"${v}" -site:${v}`], ['Código e chaves no GitHub', `site:github.com "${v}"`], ['Arquivos em nuvem pública', `(site:s3.amazonaws.com OR site:blob.core.windows.net OR site:storage.googleapis.com) "${v}"`], ['Colado em Pastebin e afins', `(site:pastebin.com OR site:gist.github.com OR site:trello.com) "${v}"`]],
  pessoa: (v) => [['Nome exato', `"${v}"`], ['LinkedIn', `site:linkedin.com/in "${v}"`], ['Currículo e documentos', `"${v}" (filetype:pdf OR filetype:docx) (currículo OR curriculum OR CV)`], ['Diários oficiais e processos', `"${v}" (site:jusbrasil.com.br OR site:escavador.com OR inurl:diario)`], ['Redes sociais', `"${v}" (site:instagram.com OR site:facebook.com OR site:x.com OR site:tiktok.com)`]],
  email: (v) => [['O e-mail exato', `"${v}"`], ['Em documentos', `"${v}" (filetype:pdf OR filetype:xlsx OR filetype:docx)`], ['Colado em Pastebin e afins', `(site:pastebin.com OR site:gist.github.com) "${v}"`], ['Outros endereços do mesmo domínio', `"@${v.split('@')[1]}" -"${v}"`]],
  telefone: (v) => [['O número em vários formatos', consultaWeb('telefone', v)], ['Anúncios e classificados', `${consultaWeb('telefone', v)} (site:olx.com.br OR site:mercadolivre.com.br OR site:facebook.com)`], ['Em documentos', `${consultaWeb('telefone', v)} (filetype:pdf OR filetype:xlsx)`]],
  apelido: (v) => [['O nome de usuário', `"${v}"`], ['Fóruns e comunidades', `"${v}" (site:reddit.com OR site:stackoverflow.com OR site:discord.com OR inurl:forum)`], ['Código', `"${v}" (site:github.com OR site:gitlab.com OR site:pastebin.com)`]],
  cnpj: (v) => [['O CNPJ exato', `"${v}" OR "${v.replace(/\D/g, '')}"`], ['Licitações e contratos', `"${v}" (licitação OR contrato OR pregão)`], ['Processos', `"${v}" (site:jusbrasil.com.br OR site:escavador.com)`]],
  organizacao: (v) => [['O nome exato', `"${v}"`], ['Funcionários no LinkedIn', `site:linkedin.com/in "${v}"`], ['Reclamações', `"${v}" (site:reclameaqui.com.br OR site:consumidor.gov.br)`], ['Processos', `"${v}" (site:jusbrasil.com.br OR site:escavador.com)`]],
};
export function dorks(_ctx, valor, tipo) {
  const lista = (DORKS[tipo] || (() => []))(valor);
  return { entidades: lista.map(([nome, q]) => ent('url', `https://www.google.com/search?q=${encodeURIComponent(q)}`, 'busca pronta', { rotulo: `Busca: ${nome}`, props: { consulta: q, 'no DuckDuckGo': `https://duckduckgo.com/?q=${encodeURIComponent(q)}` } })), props: { 'buscas prontas': `${lista.length} (abra pelo botão de link ou no menu)` } };
}

// ---------- e-mails prováveis de uma pessoa, nos domínios ligados a ela ----------
export function padroesEmail(nome) {
  const p = semAcento_(nome).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((x) => x.length > 1 && !['da', 'de', 'do', 'das', 'dos', 'e'].includes(x));
  if (p.length < 2) return [];
  const [n, s] = [p[0], p[p.length - 1]];
  return [...new Set([`${n}.${s}`, `${n}${s}`, `${n[0]}${s}`, `${n}`, `${n}_${s}`, `${n[0]}.${s}`, `${s}.${n}`, `${n}.${s[0]}`, `${n}${s[0]}`, `${s}${n[0]}`])];
}
export async function emailsProvaveis(ctx, nome) {
  const doms = [...new Set((ctx.vizinhos || []).flatMap((v) => (v.tipo === 'dominio' ? [v.valor] : v.tipo === 'email' ? [v.valor.split('@')[1]] : [])).filter(Boolean).map((d) => d.replace(/^www\./, '')))].slice(0, 4);
  if (!doms.length) return { entidades: [], aviso: 'Ligue a pessoa a um domínio ou e-mail da empresa (L) e rode de novo: os e-mails prováveis saem do domínio.' };
  const padroes = padroesEmail(nome);
  if (!padroes.length) return { entidades: [], aviso: 'Use o nome completo.' };
  // o padrão da empresa, se um e-mail conhecido do mesmo domínio já está ligado (ana.souza@ → nome.sobrenome)
  const conhecidos = (ctx.vizinhos || []).filter((v) => v.tipo === 'email').map((v) => v.valor.split('@')[0]);
  const out = [], provaveis = [];
  for (const d of doms) {
    const recebe = (await dns(ctx, d, 'MX').catch(() => [])).length > 0;
    if (!recebe) continue;
    const cand = padroes.map((x) => `${x}@${d}`);
    // o Gravatar confirma sem mandar e-mail nenhum (perfil existe para o hash do endereço)
    const conf = await Promise.all(cand.map(async (e) => { try { const h = crypto.createHash('sha256').update(e).digest('hex'); return (await ctx.json(`https://api.gravatar.com/v3/profiles/${h}`, { nulo404: true })) ? e : null; } catch { return null; } }));
    for (const e of conf.filter(Boolean)) out.push(ent('email', e, 'e-mail confirmado (Gravatar)', { props: { confirmação: 'existe um perfil do Gravatar com este endereço' } }));
    provaveis.push(...cand.slice(0, 4));
  }
  return { entidades: out, props: { 'e-mails prováveis (não confirmados)': provaveis.join(', '), 'padrões conhecidos': conhecidos.join(', ') }, aviso: out.length ? '' : 'Nenhum dos e-mails prováveis tem perfil no Gravatar; os padrões ficaram nas propriedades.' };
}

// ---------- contas em até 2.434 sites (regras do Maigret) ----------
export async function contasAmplo(ctx, apelido) {
  const nome = apelido.replace(/^@/, '');
  const r = await procurarMaigret(ctx, nome, { max: Number(ctx.sitesAmplo) || 500 });
  return {
    ...corta(r.achados.map((a) => ent('conta', a.url, `conta no ${a.site}`, { props: { site: a.site, categorias: a.tags.join(', ') } })), ctx, r.achados.length),
    props: { 'busca ampla': `${r.achados.length} contas em ${r.conferidos} sites${r.semResposta ? ` (${r.semResposta} sem resposta)` : ''}`, 'descartados na reconferência': r.descartados.slice(0, 20).join(', ') },
    aviso: r.achados.length ? '' : `Nenhuma conta com este nome em ${r.conferidos} sites.`,
  };
}

// ---------- chaves PGP: o elo entre um e-mail, o nome real e os outros e-mails da mesma pessoa ----------
// keys.openpgp.org só publica e-mail que o dono confirmou (verificado); o keyserver.ubuntu.com aceita qualquer UID
// (autodeclarado: qualquer um pode publicar uma chave com qualquer nome). A ligação diz qual dos dois.
export function lerIndicePgp(texto) {
  const chaves = [];
  let atual = null;
  for (const linha of String(texto || '').split('\n')) {
    const c = linha.split(':');
    if (c[0] === 'pub') { atual = { fpr: c[1], criada: c[4] ? new Date(Number(c[4]) * 1000).toISOString().slice(0, 10) : '', uids: [] }; chaves.push(atual); }
    else if (c[0] === 'uid' && atual) { try { atual.uids.push(decodeURIComponent(c[1])); } catch { atual.uids.push(c[1]); } }
  }
  // chave sem nenhum UID é lixo (as chaves envenenadas de 2019 são assim)
  return chaves.filter((k) => k.uids.length);
}
const lerUid = (uid) => { const m = String(uid).match(/^\s*([^<(]*?)\s*(?:\(([^)]*)\))?\s*(?:<([^>]+)>)?\s*$/); return m ? { nome: m[1].trim(), comentario: (m[2] || '').trim(), email: (m[3] || '').trim().toLowerCase() } : { nome: '', comentario: '', email: '' }; };
function entidadesPgp(chaves, origem, verificada) {
  const out = [];
  const lig = verificada ? 'mesma chave PGP (e-mail verificado)' : 'mesma chave PGP (autodeclarado)';
  for (const k of chaves.slice(0, 8)) for (const uid of k.uids) {
    const u = lerUid(uid);
    if (u.email && u.email !== origem && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(u.email)) out.push(ent('email', u.email, lig, { props: { 'chave PGP': k.fpr, 'chave criada': k.criada, ...(u.comentario ? { comentário: u.comentario } : {}) } }));
    if (u.nome && /\s/.test(u.nome) && u.nome.length < 80) out.push(ent('pessoa', u.nome, verificada ? 'nome na chave PGP' : 'nome na chave PGP (autodeclarado)', { props: { 'chave PGP': k.fpr } }));
  }
  return out;
}
export async function pgpEmail(ctx, email) {
  const out = [], chaves = [];
  // verificado primeiro: o servidor confere o e-mail com o dono
  try {
    const r = await ctx.pagina(`https://keys.openpgp.org/vks/v1/by-email/${encodeURIComponent(email)}`);
    if (r.status === 200) {
      const fpr = ((r.texto.match(/^Comment: ([0-9A-F][0-9A-F ]{38,}?)\s*$/m) || [])[1] || '').replace(/\s/g, '');
      const emails = [...r.texto.matchAll(/^Comment: <([^>]+)>\s*$/gm)].map((m) => m[1].toLowerCase());
      chaves.push({ fpr, verificada: true });
      out.push(...entidadesPgp([{ fpr, criada: '', uids: emails.map((e) => `<${e}>`) }], email, true));
    }
  } catch {}
  try {
    const r = await ctx.pagina(`https://keyserver.ubuntu.com/pks/lookup?search=${encodeURIComponent(email)}&op=index&options=mr`);
    if (r.status === 200) { const ks = lerIndicePgp(r.texto); ks.forEach((k) => chaves.push({ fpr: k.fpr, verificada: false })); out.push(...entidadesPgp(ks, email, false)); }
  } catch {}
  return { entidades: unicos(out), props: { 'chaves PGP': chaves.length ? chaves.map((k) => `${k.fpr.slice(-16)}${k.verificada ? ' (verificada)' : ''}`).join(', ') : 'nenhuma' }, aviso: chaves.length ? '' : 'Nenhuma chave PGP publicada com este e-mail.' };
}
export async function pgpNome(ctx, nome) {
  if (String(nome).trim().split(/\s+/).length < 2) return { entidades: [], aviso: 'Use o nome completo.' };
  const r = await ctx.pagina(`https://keyserver.ubuntu.com/pks/lookup?search=${encodeURIComponent(nome)}&op=index&options=mr`);
  if (r.status === 500) return { entidades: [], aviso: 'Nome comum demais: o servidor de chaves recusou a busca (resultados demais).' };
  if (r.status !== 200) return { entidades: [], aviso: 'Nenhuma chave PGP com este nome.' };
  // só as chaves cujo UID tem o nome procurado (o servidor também acha partes do nome)
  const alvo = semAcento_(nome);
  const ks = lerIndicePgp(r.texto).filter((k) => k.uids.some((u) => semAcento_(lerUid(u).nome) === alvo));
  const out = [];
  for (const k of ks.slice(0, 10)) for (const uid of k.uids) { const u = lerUid(uid); if (u.email) out.push(ent('email', u.email, 'chave PGP com este nome (pode ser homônimo)', { props: { 'chave PGP': k.fpr, 'chave criada': k.criada, ...(u.comentario ? { comentário: u.comentario } : {}) } })); }
  return { entidades: unicos(out), props: { 'chaves PGP com o nome': ks.length }, aviso: ks.length ? '' : 'Nenhuma chave PGP com exatamente este nome.' };
}

// ---------- Launchpad: conta, apelidos de IRC e chaves (só por nome ou apelido: a busca por e-mail revelaria
// o dono de um e-mail que ele escolheu esconder) ----------
export async function launchpad(ctx, valor, tipo) {
  const q = tipo === 'apelido' ? valor.replace(/^@/, '') : valor;
  const d = await ctx.json(`https://api.launchpad.net/1.0/people?ws.op=findPerson&text=${encodeURIComponent(q)}&ws.size=10`);
  let pessoas = ((d && d.entries) || []).filter((p) => !p.is_team);
  if (tipo === 'apelido') pessoas = pessoas.filter((p) => String(p.name).toLowerCase() === q.toLowerCase());
  else { const alvo = semAcento_(q); pessoas = pessoas.filter((p) => semAcento_(p.display_name) === alvo); }
  const out = [];
  for (const p of pessoas.slice(0, 5)) {
    const conta = ent('conta', `https://launchpad.net/~${p.name}`, tipo === 'apelido' ? 'conta no Launchpad' : 'conta no Launchpad com este nome (pode ser homônimo)', { props: { site: 'Launchpad', criada: data(p.date_created), karma: p.karma, 'fuso horário': p.time_zone || '' } });
    out.push(conta);
    const de = { tipo: 'conta', valor: conta.valor };
    if (tipo === 'apelido' && p.display_name && /\s/.test(p.display_name)) out.push(ent('pessoa', p.display_name, 'nome no Launchpad', { de }));
    const [irc, gpg] = await Promise.all([ctx.json(`https://api.launchpad.net/1.0/~${p.name}/irc_nicknames`).catch(() => null), ctx.json(`https://api.launchpad.net/1.0/~${p.name}/gpg_keys`).catch(() => null)]);
    // apelido de IRC igual ao procurado não acrescenta nada
    for (const n of (irc && irc.entries) || []) if (n.nickname && n.nickname.toLowerCase() !== q.toLowerCase()) out.push(ent('apelido', n.nickname, `apelido no IRC (${n.network})`, { de }));
    const fprs = ((gpg && gpg.entries) || []).map((k) => k.fingerprint).filter(Boolean);
    if (fprs.length) conta.props['chaves GPG'] = fprs.join(', ');
  }
  return { entidades: unicos(out), aviso: pessoas.length ? '' : 'Nenhuma conta no Launchpad.' };
}

// ---------- busca de contas pelo nome no Bluesky e no fediverso ----------
export async function blueskyBusca(ctx, valor, tipo) {
  const d = await ctx.json(`https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=${encodeURIComponent(valor.replace(/^@/, ''))}&limit=10`);
  const atores = (d && d.actors) || [];
  const porNome = tipo !== 'apelido';
  return { entidades: atores.map((a) => ent('conta', `https://bsky.app/profile/${a.handle}`, porNome ? 'conta no Bluesky com este nome (pode ser homônimo)' : 'conta no Bluesky parecida', { rotulo: `Bluesky · ${a.displayName || a.handle}`, props: { site: 'Bluesky', nome: a.displayName || '', bio: tira(a.description || '').slice(0, 200), criada: data(a.createdAt) } })), aviso: atores.length ? '' : 'Nenhuma conta no Bluesky.' };
}
export async function fediverso(ctx, valor, tipo) {
  const d = await ctx.json(`https://mastodon.social/api/v2/search?q=${encodeURIComponent(valor.replace(/^@/, ''))}&type=accounts&limit=10`);
  const contas_ = (d && d.accounts) || [];
  const porNome = tipo !== 'apelido';
  return {
    entidades: contas_.map((a) => ent('conta', a.url, porNome ? 'conta no fediverso com este nome (pode ser homônimo)' : 'conta no fediverso', { rotulo: `Fediverso · ${a.acct}`, props: { site: 'Mastodon/fediverso', nome: a.display_name || '', bio: tira(a.note || '').slice(0, 200), criada: data(a.created_at), seguidores: a.followers_count } })),
    props: { 'instâncias': [...new Set(contas_.map((a) => (a.acct.split('@')[1] || 'mastodon.social')))].slice(0, 8).join(', ') },
    aviso: contas_.length ? '' : 'Nenhuma conta no fediverso (que a mastodon.social conheça).',
  };
}

// ---------- Stack Exchange: perfis com o nome e as contas da mesma pessoa na rede ----------
export async function stackexchange(ctx, valor, tipo) {
  const q = valor.replace(/^@/, '');
  const d = await ctx.json(`https://api.stackexchange.com/2.3/users?inname=${encodeURIComponent(q)}&site=stackoverflow&pagesize=10&order=desc&sort=reputation`);
  const exatos = ((d && d.items) || []).filter((u) => semAcento_(tira(u.display_name)) === semAcento_(q));
  const out = [];
  for (const u of exatos.slice(0, 5)) {
    const conta = ent('conta', u.link, tipo === 'apelido' ? 'conta no Stack Overflow' : 'conta no Stack Overflow com este nome (pode ser homônimo)', { props: { site: 'Stack Overflow', reputação: u.reputation, criada: u.creation_date ? new Date(u.creation_date * 1000).toISOString().slice(0, 10) : '' } });
    out.push(conta);
    const de = { tipo: 'conta', valor: conta.valor };
    if (u.location) out.push(ent('local', tira(u.location), 'diz morar em', { de }));
    if (u.website_url) out.push(ent('url', u.website_url, 'site no perfil', { de }));
  }
  // as outras contas da mesma pessoa na rede (só quando o perfil é um só: com vários, seria misturar pessoas)
  if (exatos.length === 1 && exatos[0].account_id) {
    const a = await ctx.json(`https://api.stackexchange.com/2.3/users/${exatos[0].account_id}/associated?pagesize=30`).catch(() => null);
    for (const s of (a && a.items) || []) if (s.site_url && s.site_url !== 'https://stackoverflow.com') out.push(ent('conta', `${s.site_url}/users/${s.user_id}`, `mesma pessoa no ${s.site_name}`, { de: { tipo: 'conta', valor: normalizar('url', exatos[0].link) }, props: { site: s.site_name, reputação: s.reputation } }));
  }
  return { entidades: unicos(out), props: { 'Stack Exchange': 'conteúdo CC BY-SA (cite a fonte)', 'cota restante hoje': d && d.quota_remaining != null ? d.quota_remaining : '' }, aviso: exatos.length ? '' : 'Nenhum perfil do Stack Overflow com exatamente este nome.' };
}

// ---------- Hacker News (Algolia): o que o apelido publica e os sites que ele mais divulga ----------
export async function hackerNews(ctx, apelido) {
  const u = apelido.replace(/^@/, '');
  const d = await ctx.json(`https://hn.algolia.com/api/v1/search_by_date?tags=author_${encodeURIComponent(u)}&hitsPerPage=100`);
  const hits = (d && d.hits) || [];
  if (!hits.length) return { entidades: [], aviso: 'Nenhuma publicação no Hacker News com este apelido.' };
  const doms = {};
  for (const h of hits) if (h.url) { try { const host = new URL(h.url).hostname.replace(/^www\./, ''); doms[host] = (doms[host] || 0) + 1; } catch {} }
  const top = Object.entries(doms).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const datas = hits.map((h) => h.created_at).filter(Boolean).sort();
  return {
    entidades: [ent('conta', `https://news.ycombinator.com/user?id=${u}`, 'conta no Hacker News', { props: { site: 'Hacker News' } }), ...top.map(([dom, q]) => ent('dominio', dom, 'divulga no Hacker News', { de: { tipo: 'conta', valor: normalizar('url', `https://news.ycombinator.com/user?id=${u}`) }, props: { publicações: q } }))],
    props: { 'publicações no HN': `${d.nbHits} (ativo de ${data(datas[0])} a ${data(datas[datas.length - 1])})`, 'histórias mais votadas': hits.filter((h) => h.title).sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 3).map((h) => h.title).join(' · ') },
  };
}

// ---------- npm: o e-mail que o próprio registro mostra e os repositórios dos pacotes ----------
export async function npmMantenedor(ctx, apelido) {
  const u = apelido.replace(/^@/, '').toLowerCase();
  const d = await ctx.json(`https://registry.npmjs.org/-/v1/search?text=maintainer:${encodeURIComponent(u)}&size=50`);
  const objs = ((d && d.objects) || []).filter((o) => (o.package.maintainers || []).some((m) => String(m.username).toLowerCase() === u) || String((o.package.publisher || {}).username).toLowerCase() === u);
  if (!objs.length) return { entidades: [], aviso: 'Nenhum pacote no npm com este mantenedor.' };
  const conta = ent('conta', `https://www.npmjs.com/~${u}`, 'mantenedor no npm', { props: { site: 'npm', pacotes: d.total } });
  const de = { tipo: 'conta', valor: conta.valor }, out = [conta];
  const emails = new Set();
  for (const o of objs) for (const m of [o.package.publisher, ...(o.package.maintainers || [])]) if (m && String(m.username).toLowerCase() === u && m.email) emails.add(m.email.toLowerCase());
  for (const e of emails) out.push(ent('email', e, 'e-mail no npm', { de }));
  const repos = new Set(objs.map((o) => ((o.package.links || {}).repository || '').replace(/^git\+/, '').replace(/\.git$/, '')).filter((r) => /^https?:\/\//.test(r)));
  for (const r of [...repos].slice(0, 8)) out.push(ent('url', r, 'repositório de pacote', { de }));
  return { entidades: unicos(out), props: { 'pacotes no npm': d.total, 'mais conhecidos': objs.slice(0, 5).map((o) => o.package.name).join(', ') } };
}

// ---------- pesquisadores: OpenAlex (nome → ORCID e instituição) e o perfil completo do ORCID ----------
export async function openalex(ctx, nome) {
  if (String(nome).trim().split(/\s+/).length < 2) return { entidades: [], aviso: 'Use o nome completo.' };
  const d = await ctx.json(`https://api.openalex.org/authors?search=${encodeURIComponent(nome)}&per_page=5&select=id,display_name,orcid,works_count,cited_by_count,last_known_institutions,display_name_alternatives`);
  const res = ((d && d.results) || []).filter((a) => a.works_count > 0);
  const out = [];
  for (const a of res) {
    const conta = a.orcid ? ent('conta', a.orcid, 'autor no OpenAlex (pode ser homônimo)', { rotulo: `ORCID · ${a.display_name}`, props: { trabalhos: a.works_count, citações: a.cited_by_count, OpenAlex: a.id } }) : null;
    if (conta) out.push(conta);
    for (const i of (a.last_known_institutions || []).slice(0, 2)) out.push(ent('organizacao', i.display_name, 'instituição (OpenAlex)', conta ? { de: { tipo: 'conta', valor: conta.valor }, props: { país: i.country_code || '' } } : { props: { país: i.country_code || '' } }));
  }
  return { entidades: unicos(out), props: { 'autores com o nome (OpenAlex)': d && d.meta ? d.meta.count : 0, 'variantes do nome': [...new Set(res.flatMap((a) => a.display_name_alternatives || []))].slice(0, 6).join(', ') }, aviso: res.length ? (res.length > 1 ? 'Vários autores com nome parecido: o ORCID separa um do outro.' : '') : 'Nenhum autor com este nome no OpenAlex.' };
}
export async function orcidPerfil(ctx, url) {
  const id = (String(url).match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/) || [])[1];
  if (!id) return { entidades: [], aviso: 'Não é um ORCID (0000-0000-0000-0000).' };
  const [p, emp] = await Promise.all([ctx.json(`https://pub.orcid.org/v3.0/${id}/person`, { nulo404: true }), ctx.json(`https://pub.orcid.org/v3.0/${id}/employments`, { nulo404: true }).catch(() => null)]);
  if (!p) return { entidades: [], aviso: 'ORCID não encontrado.' };
  const out = [];
  const nome = [p.name && p.name['given-names'] && p.name['given-names'].value, p.name && p.name['family-name'] && p.name['family-name'].value].filter(Boolean).join(' ');
  if (nome) out.push(ent('pessoa', nome, 'nome no ORCID'));
  for (const u of ((p['researcher-urls'] || {})['researcher-url'] || [])) if (u.url && u.url.value) out.push(ent('url', u.url.value, `site do pesquisador${u['url-name'] ? ` (${u['url-name']})` : ''}`));
  for (const e of ((p.emails || {}).email || [])) if (e.email) out.push(ent('email', e.email, 'e-mail público no ORCID'));
  const empregos = ((emp && emp['affiliation-group']) || []).flatMap((g) => (g.summaries || []).map((s) => s['employment-summary'])).filter(Boolean);
  for (const s of empregos.slice(0, 8)) if (s.organization && s.organization.name) out.push(ent('organizacao', s.organization.name, s['role-title'] ? `trabalha ou trabalhou como ${s['role-title']}` : 'vínculo (ORCID)', { props: { desde: (s['start-date'] && s['start-date'].year && s['start-date'].year.value) || '', até: (s['end-date'] && s['end-date'].year && s['end-date'].year.value) || 'atual', cidade: (s.organization.address && s.organization.address.city) || '' } }));
  return {
    entidades: unicos(out),
    props: { 'outros nomes': (((p['other-names'] || {})['other-name']) || []).map((o) => o.content).join(', '), 'palavras-chave': (((p.keywords || {}).keyword) || []).map((k) => k.content).join(', '), 'identificadores': (((p['external-identifiers'] || {})['external-identifier']) || []).map((x) => `${x['external-id-type']}: ${x['external-id-value']}`).join(' · '), país: (((p.addresses || {}).address) || []).map((a) => a.country && a.country.value).filter(Boolean).join(', ') },
  };
}

// ---------- Wikimedia: a conta global (todas as wikis em que o apelido edita) ----------
export async function wikimediaGlobal(ctx, apelido) {
  const u = apelido.replace(/^@/, '');
  const d = await ctx.json(`https://meta.wikimedia.org/w/api.php?action=query&meta=globaluserinfo&guiuser=${encodeURIComponent(u)}&guiprop=merged&format=json`);
  const g = d && d.query && d.query.globaluserinfo;
  if (!g || 'missing' in g) return { entidades: [], aviso: 'Nenhuma conta global da Wikimedia com este nome.' };
  const ativas = (g.merged || []).filter((w) => w.editcount > 0).sort((a, b) => b.editcount - a.editcount);
  return {
    entidades: ativas.slice(0, 6).map((w) => ent('conta', `${w.url}/wiki/Special:Contributions/${encodeURIComponent(g.name.replace(/ /g, '_'))}`, `edita na ${w.wiki}`, { rotulo: `${w.wiki} · ${g.name}`, props: { site: w.wiki, edições: w.editcount } })),
    props: { 'conta global da Wikimedia': `desde ${data(g.registration)}, criada na ${g.home || '?'}`, 'wikis com edição': ativas.length, 'wikis no total': (g.merged || []).length },
  };
}

// ---------- nomes no Brasil: quantas pessoas têm o primeiro nome (IBGE) e deputados federais (Câmara) ----------
export async function nomeIbge(ctx, nome) {
  const pri = semAcento_(String(nome).trim().split(/\s+/)[0]).replace(/[^a-z]/g, '');
  if (pri.length < 2) return { entidades: [], aviso: 'Nome curto demais.' };
  const [geral, porUf] = await Promise.all([ctx.json(`https://servicodados.ibge.gov.br/api/v2/censos/nomes/${pri}`), ctx.json(`https://servicodados.ibge.gov.br/api/v2/censos/nomes/${pri}?groupBy=UF`).catch(() => null)]);
  const res = ((geral || [])[0] || {}).res || [];
  if (!res.length) return { entidades: [], aviso: 'O IBGE não tem este primeiro nome no Censo (nome raro: menos chance de homônimo).' };
  const total = res.reduce((a, x) => a + x.frequencia, 0);
  const pico = res.reduce((a, x) => (x.frequencia > a.frequencia ? x : a), res[0]);
  const ufs = (porUf || []).map((x) => ({ uf: x.localidade, prop: (x.res[0] || {}).proporcao || 0 })).sort((a, b) => b.prop - a.prop).slice(0, 3);
  return { entidades: [], props: { [`pessoas chamadas ${pri} no Brasil`]: total.toLocaleString('pt-BR'), 'década mais comum de nascimento': pico.periodo.replace(/[[\]]/g, '').replace(',', '–'), 'risco de homônimo': total > 100000 ? 'alto' : total > 5000 ? 'médio' : 'baixo', 'estados onde é mais comum (código IBGE)': ufs.map((x) => x.uf).join(', ') } };
}

// ---------- listas baixadas inteiras (CISA KEV, Spamhaus DROP, saídas do Tor): guardadas na memória por horas ----------
const LISTAS = new Map();
async function lista(ctx, url, horas, ler) {
  const x = LISTAS.get(url);
  if (x && Date.now() - x.em < horas * 3600000) return x.v;
  const v = ler(await ctx.pagina(url, { timeout: 60000 }));
  LISTAS.set(url, { em: Date.now(), v });
  return v;
}
const privado = (ip) => /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i.test(ip);

// ---------- reputação do IP: GreyNoise, SANS ISC, Tor, StopForumSpam e Spamhaus DROP num pedido só ----------
export async function ipReputacao(ctx, ip) {
  if (privado(ip)) return { entidades: [], aviso: 'Endereço privado ou reservado: não tem reputação pública.' };
  const props = {}, out = [], ruins = [];
  await Promise.all([
    // GreyNoise: varre a internet em massa (ruído) ou é serviço comum e benigno (RIOT)?
    ctx.json(`https://api.greynoise.io/v3/community/${ip}`, { nulo404: true }).then((g) => {
      if (!g) { props.GreyNoise = 'não visto varrendo a internet'; return; }
      props.GreyNoise = g.riot ? `serviço comum e benigno (${g.name || 'RIOT'})` : g.noise ? `varre a internet (${g.classification || 'desconhecido'}), visto em ${g.last_seen || '?'}` : g.message || '';
      if (g.classification === 'malicious') ruins.push('GreyNoise: malicioso');
    }).catch(() => { props.GreyNoise = 'sem resposta (cota de 25 consultas)'; }),
    // SANS ISC: em quais listas de ameaça o IP está, e quem cuida de abuso na rede dele
    ctx.json(`https://isc.sans.edu/api/ip/${ip}?json`).then((d) => {
      const i = (d && d.ip) || {};
      const feeds = Object.entries(i.threatfeeds || {});
      props['listas de ameaça (SANS ISC)'] = feeds.length ? feeds.map(([k, v]) => `${k} (até ${v.lastseen || '?'})`).join(', ') : 'nenhuma';
      if (i.attacks) props['ataques vistos (SANS ISC)'] = i.attacks;
      // lista informativa (resolvedor aberto, "meu IP", Mastodon, Tor) não é ameaça
      const ameacas = feeds.map(([k]) => k).filter((k) => /talos|blocklist|ciarmy|compromis|botnet|malware|threat|feodo|sslbl|spamhaus|abuse|brute|scan|attack|forumspam|emerging|c2|phish/i.test(k));
      if (ameacas.length) ruins.push(`SANS ISC: ${ameacas.join(', ')}`);
      if (i.asabusecontact) out.push(ent('email', i.asabusecontact, 'contato de abuso da rede'));
    }).catch(() => {}),
    // Tor: relay de saída, com o operador
    ctx.json(`https://onionoo.torproject.org/details?search=${encodeURIComponent(ip)}&limit=3`).then((d) => {
      const r = ((d && d.relays) || [])[0];
      if (!r) return;
      props.Tor = `relay ${r.nickname}${(r.flags || []).includes('Exit') ? ' (saída)' : ''}, ${r.country_name || r.country || ''} · visto até ${data(r.last_seen)}`;
      for (const h of (r.verified_host_names || []).slice(0, 3)) out.push(ent('dominio', h, 'nome do relay Tor'));
      if (r.contact) for (const e of extrair(r.contact).filter((x) => x.tipo === 'email')) out.push(ent('email', e.valor, 'contato do operador Tor'));
    }).catch(() => {}),
    // StopForumSpam: spam em formulários e fóruns
    ctx.json(`https://api.stopforumspam.org/api?ip=${ip}&json`).then((d) => {
      const s = (d && d.ip) || {};
      if (s.appears) { props.StopForumSpam = `${s.frequency} denúncias de spam, a última em ${String(s.lastseen || '').slice(0, 10)} (confiança ${Math.round(s.confidence || 0)}%)`; if ((s.confidence || 0) > 50) ruins.push('StopForumSpam'); }
    }).catch(() => {}),
    // Spamhaus DROP: redes sequestradas ou de criminosos (não se deve nem rotear)
    lista(ctx, 'https://www.spamhaus.org/drop/drop_v4.json', 1, (r) => String(r.texto).split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x && x.cidr)).then((drop) => {
      const hit = /^\d+\.\d+\.\d+\.\d+$/.test(ip) && drop.find((x) => dentroDaRedeT(ip, x.cidr));
      if (hit) { props['Spamhaus DROP'] = `${hit.cidr} (${hit.sblid}): rede de criminosos, não deve ser roteada`; ruins.push('Spamhaus DROP'); }
    }).catch(() => {}),
  ]);
  if (ruins.length) props.risco = ruins.join('; ');
  return { entidades: unicos(out), props, alerta: ruins.length > 0, aviso: Object.keys(props).length ? '' : 'Nenhuma fonte de reputação respondeu.' };
}
const ip4n = (s) => String(s).split('.').reduce((a, x) => a * 256 + Number(x), 0);
function dentroDaRedeT(ip, cidr) { const [r, b] = String(cidr).split('/'); const passo = 2 ** (32 - Number(b)); return Math.floor(ip4n(ip) / passo) === Math.floor(ip4n(r) / passo); }

// ---------- CVE: explorada de fato? (CISA KEV) e onde foi vista (CIRCL) ----------
export async function cveExploracao(ctx, id) {
  const props = {}, out = [];
  let kev = null;
  try {
    const cat = await lista(ctx, 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', 12, (r) => new Map((JSON.parse(r.texto).vulnerabilities || []).map((v) => [v.cveID, v])));
    kev = cat.get(id) || null;
  } catch { props['CISA KEV'] = 'catálogo fora do ar'; }
  if (kev) {
    Object.assign(props, { 'CISA KEV': `explorada de fato (no catálogo desde ${kev.dateAdded})`, ransomware: kev.knownRansomwareCampaignUse === 'Known' ? 'usada em campanhas de ransomware' : 'sem uso conhecido em ransomware', 'correção exigida até': kev.dueDate, 'o que fazer': kev.requiredAction, fraquezas: (kev.cwes || []).join(', ') });
    if (kev.vendorProject) out.push(ent('organizacao', kev.vendorProject, 'fornecedor afetado', { props: { produto: kev.product } }));
  } else if (!props['CISA KEV']) props['CISA KEV'] = 'não está no catálogo de exploradas';
  try {
    const s = await ctx.json(`https://vulnerability.circl.lu/api/sighting/?vuln_id=${encodeURIComponent(id)}&per_page=20`);
    const n = (s && s.metadata && s.metadata.count) || 0;
    const tipos = {};
    for (const x of (s && s.data) || []) tipos[x.type] = (tipos[x.type] || 0) + 1;
    const ult = ((s && s.data) || []).map((x) => (x.source || '').match(/\((\d{4}-\d{2}-\d{2})\)/)).filter(Boolean).map((m) => m[1]).sort().pop();
    props['avistamentos (CIRCL)'] = n ? `${n}${Object.keys(tipos).length ? ` (${Object.entries(tipos).map(([k, q]) => `${k}: ${q}`).join(', ')} nos últimos)` : ''}${ult ? `, o mais recente em ${ult}` : ''}` : 'nenhum';
  } catch {}
  const alerta = !!kev;
  if (alerta) props.risco = `explorada de fato${kev.knownRansomwareCampaignUse === 'Known' ? ', inclusive por ransomware' : ''}: corrija primeiro`;
  return { entidades: out, props, alerta };
}

// ---------- hash: arquivo conhecido? (CIRCL hashlookup, com a base NSRL) ----------
export async function hashlookup(ctx, hash) {
  const alg = hash.length === 32 ? 'md5' : hash.length === 40 ? 'sha1' : 'sha256';
  const d = await ctx.json(`https://hashlookup.circl.lu/lookup/${alg}/${hash}`, { nulo404: true });
  if (!d) return { entidades: [], aviso: 'Arquivo desconhecido do CIRCL hashlookup (não está nas bases de arquivos conhecidos).' };
  const out = [];
  for (const [k, a] of [['MD5', 'md5'], ['SHA-1', 'sha1'], ['SHA-256', 'sha256']]) if (d[k] && a !== alg) out.push(ent('hash', d[k], `mesmo arquivo (${k})`));
  const fonte = d.source || (d['hashlookup:parent-total'] ? 'NSRL' : '');
  return {
    entidades: out, alerta: !!d.KnownMalicious,
    props: { arquivo: d.FileName || '', tamanho: d.FileSize ? `${d.FileSize} bytes` : '', produto: d.ProductName || (d.parents && d.parents[0] && d.parents[0].ProductName) || '', origem: fonte, 'conhecido como malicioso': d.KnownMalicious || '', SSDEEP: d.SSDEEP || '', TLSH: d.TLSH || '', risco: d.KnownMalicious ? `listado como malicioso em ${d.KnownMalicious}` : '' },
  };
}

// ---------- domínio: credenciais roubadas por infostealer (Hudson Rock) ----------
export async function infostealer(ctx, dominio) {
  const d = await ctx.json(`https://cavalier.hudsonrock.com/api/json/v2/osint-tools/search-by-domain?domain=${encodeURIComponent(dominio)}`, { timeout: 40000 });
  if (!d || !d.total) return { entidades: [], props: { infostealer: 'nenhum computador infectado conhecido com acesso a este domínio' } };
  const urls = ((d.data && d.data.employees_urls) || []).filter((u) => { try { return new URL(u.url).hostname.endsWith(dominio); } catch { return false; } }).sort((a, b) => b.occurrence - a.occurrence).slice(0, 10);
  const out = urls.map((u) => ent('url', u.url, 'login vazado por infostealer', { alerta: true, props: { ocorrências: u.occurrence } }));
  const alerta = (d.employees || 0) > 0;
  return {
    entidades: out, alerta,
    props: { 'funcionários infectados': d.employees || 0, 'usuários infectados': d.users || 0, 'terceiros': d.third_parties || 0, 'última infecção de funcionário': data(d.last_employee_compromised), 'famílias de infostealer': Object.keys(d.stealerFamilies || {}).slice(0, 5).join(', '), fonte: 'Hudson Rock (cite a fonte)', risco: alerta ? `${d.employees} computadores de funcionários infectados por infostealer: senhas e sessões da empresa podem estar à venda` : '' },
  };
}

// ---------- domínio, IP: varreduras públicas do urlscan.io (páginas, IPs, capturas de tela) ----------
export async function urlscan(ctx, valor, tipo) {
  const q = tipo === 'ip' ? `ip:${valor}` : tipo === 'hash' ? `hash:${valor}` : `domain:${valor}`;
  const d = await ctx.json(`https://urlscan.io/api/v1/search/?q=${encodeURIComponent(q)}&size=20`);
  const res = (d && d.results) || [];
  const out = [];
  for (const r of res) {
    const t = r.task || {}, p = r.page || {};
    if (t.url) out.push(ent('url', t.url, 'varrido no urlscan', { props: { quando: data(t.time), 'captura de tela': r.screenshot || '', varredura: r.result ? r.result.replace('/api/v1/result/', '/result/') : '', 'servidor': p.server || '', país: p.country || '' } }));
    if (tipo !== 'ip' && p.ip) out.push(ent('ip', p.ip, 'servia a página (urlscan)'));
    if (tipo === 'ip' && p.domain) out.push(ent('dominio', p.domain, 'página neste IP (urlscan)'));
  }
  return { ...corta(unicos(out), ctx), props: { 'varreduras no urlscan (30 dias)': (d && d.total) || 0 }, aviso: res.length ? '' : 'Nenhuma varredura pública nos últimos 30 dias.' };
}

// ---------- domínio: popularidade (Tranco), URLs no Common Crawl, segurança do e-mail ----------
export async function popularidade(ctx, dominio) {
  const d = await ctx.json(`https://tranco-list.eu/api/ranks/domain/${encodeURIComponent(dominio)}`);
  const r = (d && d.ranks) || [];
  if (!r.length) return { entidades: [], props: { 'popularidade (Tranco)': 'fora do 1 milhão de sites mais acessados' } };
  const atual = r[0].rank, pior = Math.max(...r.map((x) => x.rank)), melhor = Math.min(...r.map((x) => x.rank));
  return { entidades: [], props: { 'popularidade (Tranco)': `${atual.toLocaleString('pt-BR')}º do mundo (${r[0].date})`, 'variação recente': melhor === pior ? 'estável' : `entre ${melhor.toLocaleString('pt-BR')}º e ${pior.toLocaleString('pt-BR')}º` } };
}
export async function commonCrawl(ctx, dominio) {
  const col = await lista(ctx, 'https://index.commoncrawl.org/collinfo.json', 24, (r) => JSON.parse(r.texto));
  const indice = col && col[0] && col[0].id;
  if (!indice) throw new Falha('Índice do Common Crawl indisponível.', { status: 503 });
  const r = await ctx.pagina(`https://index.commoncrawl.org/${indice}-index?url=${encodeURIComponent(dominio + '/*')}&output=json&limit=400`, { timeout: 60000 });
  if (r.status === 404) return { entidades: [], aviso: `Nada do domínio no Common Crawl mais recente (${indice}).` };
  const regs = String(r.texto).split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x && x.url && !/\.(css|js|png|jpe?g|gif|svg|woff2?|ico|webp)(\?|$)/i.test(x.url));
  const vistos = new Map(regs.map((x) => [x.url.replace(/[?#].*$/, ''), x]));
  const ord = [...vistos.values()].sort((a, b) => Number(CURIOSOS.test(b.url)) - Number(CURIOSOS.test(a.url)));
  const hosts = new Set(ord.map((x) => { try { return new URL(x.url).hostname; } catch { return ''; } }).filter((h) => h.endsWith('.' + dominio)));
  return { ...corta([...ord.map((x) => ent('url', x.url, 'no Common Crawl', { alerta: CURIOSOS.test(x.url), props: { capturado: x.timestamp ? `${x.timestamp.slice(0, 4)}-${x.timestamp.slice(4, 6)}-${x.timestamp.slice(6, 8)}` : '', status: x.status || '', idioma: x.languages || '' } })), ...[...hosts].map((h) => ent('dominio', h, 'subdomínio no Common Crawl'))], ctx), props: { 'Common Crawl': `${vistos.size} endereços no índice ${indice}` } };
}
const SELETORES_DKIM = ['google', 'selector1', 'selector2', 'k1', 'k2', 'default', 's1', 's2', 'mail', 'dkim', 'mandrill', 'zoho'];
export async function segurancaEmail(ctx, dominio) {
  const txt = async (nome) => (await dns(ctx, nome, 'TXT').catch(() => [])).map(tiraAspas);
  const [dmarc, sts, tlsrpt, bimi] = await Promise.all([txt('_dmarc.' + dominio), txt('_mta-sts.' + dominio), txt('_smtp._tls.' + dominio), txt('default._bimi.' + dominio)]);
  const dkim = (await Promise.all(SELETORES_DKIM.map(async (s) => ((await txt(`${s}._domainkey.${dominio}`)).some((t) => /p=/.test(t)) ? s : null)))).filter(Boolean);
  // DNSSEC: o resolvedor da Cloudflare marca AD quando a cadeia de assinaturas confere
  let dnssec = '?';
  try { const r = await ctx.json(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(dominio)}&type=A&do=1`, { headers: { accept: 'application/dns-json' } }); dnssec = r && r.AD ? 'sim (assinado e validado)' : 'não'; } catch {}
  const d = dmarc.find((t) => /^v=DMARC1/i.test(t)) || '';
  const politica = (d.match(/\bp=(\w+)/i) || [])[1] || '';
  const out = [];
  for (const m of d.matchAll(/mailto:([^,;\s!]+)/gi)) out.push(ent('email', m[1], 'recebe os relatórios DMARC'));
  let stsModo = '';
  if (sts.some((t) => /v=STSv1/i.test(t))) { try { const p = await ctx.pagina(`https://mta-sts.${dominio}/.well-known/mta-sts.txt`); stsModo = (String(p.texto).match(/mode:\s*(\w+)/) || [])[1] || 'publicado'; } catch { stsModo = 'registro existe, política não abre'; } }
  const problemas = [!d ? 'sem DMARC (o domínio pode ser falsificado em e-mails)' : politica === 'none' ? 'DMARC só monitora (p=none): e-mail falso ainda chega' : '', !dkim.length ? 'nenhum seletor DKIM comum achado' : ''].filter(Boolean);
  return {
    entidades: unicos(out), alerta: !d || politica === 'none',
    props: { DMARC: d ? `${politica || '?'} (${d.slice(0, 120)})` : 'não tem', 'DKIM (seletores achados)': dkim.join(', ') || 'nenhum dos comuns', 'MTA-STS': stsModo || 'não tem', 'TLS-RPT': tlsrpt.find((t) => /v=TLSRPTv1/i.test(t)) || 'não tem', BIMI: bimi.find((t) => /v=BIMI1/i.test(t)) ? 'tem (logo nos e-mails)' : 'não tem', DNSSEC: dnssec, risco: problemas.join('; ') },
  };
}

// ---------- ASN: perfil no PeeringDB (site, IXs, data centers) ----------
export async function peeringdb(ctx, asn) {
  const n = asn.replace(/^AS/i, '');
  const d = await ctx.json(`https://www.peeringdb.com/api/net?asn=${n}`, { nulo404: true });
  const x = d && d.data && d.data[0];
  if (!x) return { entidades: [], aviso: 'Este sistema autônomo não está no PeeringDB.' };
  const out = [];
  if (x.website) out.push(ent('url', x.website, 'site no PeeringDB'));
  if (x.name) out.push(ent('organizacao', x.name, 'rede no PeeringDB'));
  return { entidades: unicos(out), props: { 'também conhecido como': x.aka || '', 'pontos de troca (IX)': x.ix_count, 'data centers': x.fac_count, 'tipo de rede': x.info_type || '', 'tráfego': x.info_traffic || '', 'AS-SET': x.irr_as_set || '', PeeringDB: `https://www.peeringdb.com/net/${x.id}` } };
}

// ---------- nomes completos: conferência pelas palavras do nome (em qualquer ordem, sem acento) ----------
const PALAVRAS_FRACAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'del', 'la', 'van', 'von', 'di', 'du', 'le']);
export const palavrasNome = (s) => semAcento_(s).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((p) => p.length > 1 && !PALAVRAS_FRACAS.has(p));
// todas as palavras do nome procurado aparecem no nome achado ("MADURO MOROS, Nicolas" casa com "Nicolas Maduro")
export const nomeCasa = (procurado, achado) => { const a = new Set(palavrasNome(achado)); const p = palavrasNome(procurado); return p.length >= 2 && p.every((x) => a.has(x)); };
const exigeNomeCompleto = (nome) => (palavrasNome(nome).length < 2 ? { entidades: [], aviso: 'Use o nome completo (pelo menos nome e sobrenome).' } : null);
// lista grande (sanções): baixada como arquivo, guardada por um dia
async function listaGrande(ctx, url, horas, ler) {
  const x = LISTAS.get(url);
  if (x && Date.now() - x.em < horas * 3600000) return x.v;
  const b = await ctx.binario(url, { max: 40_000_000, timeout: 120000 });
  if (!b || !b.dados) throw new Falha(`Não deu para baixar a lista ${new URL(url).host}${b && b.status ? ` (${b.status})` : ''}.`, { status: 502 });
  const v = ler(b.dados.toString('utf8'));
  LISTAS.set(url, { em: Date.now(), v });
  return v;
}
// CSV com aspas (o da OFAC e o da UE)
export function lerCsv(texto, sep = ',') {
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) { if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c; continue; }
    if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo.replace(/\r$/, '')); linhas.push(linha); linha = []; campo = ''; }
    else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

// ---------- STF: processos em que o nome é parte ----------
export async function stf(ctx, nome) {
  const falta = exigeNomeCompleto(nome); if (falta) return falta;
  const pega = (tram) => ctx.json(`https://digital.stf.jus.br/integracoes-processos/api/public/partes/processos?nome=${encodeURIComponent(nome)}&processosPorPagina=20&pagina=1&processosEmTramitacao=${tram}&tipoPesquisa=PARTE`).catch(() => null);
  const [ativos, antigos] = await Promise.all([pega('sim'), pega('nao')]);
  // só a parte com exatamente as palavras do nome (o STF acha trechos)
  const partes = [...((ativos && ativos.partes) || []), ...((antigos && antigos.partes) || [])].filter((p) => nomeCasa(nome, p.pessoaNome) && nomeCasa(p.pessoaNome, nome));
  const out = partes.slice(0, 25).map((p) => ent('url', `https://portal.stf.jus.br/processos/detalhe.asp?incidente=${p.processoId}`, 'parte em processo no STF (pode ser homônimo)', { rotulo: `STF · ${p.processoIdentificacao}`, props: { processo: p.processoIdentificacao, 'número único': p.processoNumeroUnico || '', autuado: p.processoDataAutuacao || '', 'em tramitação': p.processoEmTramitacao || '', 'nome no processo': p.pessoaNome } }));
  return { entidades: unicos(out), props: { 'processos no STF': `${partes.length}${partes.length ? ` (${partes.filter((p) => p.processoEmTramitacao === 'Sim').length} em tramitação)` : ''}` }, aviso: partes.length ? '' : 'Nenhum processo no STF com este nome como parte.' };
}

// ---------- Diário Oficial da União: nomeações, exonerações, punições, contratos ----------
export async function dou(ctx, nome) {
  const falta = exigeNomeCompleto(nome); if (falta) return falta;
  const r = await ctx.pagina(`https://www.in.gov.br/consulta/-/buscar/dou?q=${encodeURIComponent('"' + nome + '"')}&s=todos&exactDate=all&sortType=0`, { navegador: false, timeout: 40000 });
  const bloco = (String(r.texto).match(/<script[^>]+id="_br_com_seatecnologia_in_buscadou_BuscaDouPortlet_params"[^>]*>([\s\S]*?)<\/script>/) || [])[1];
  let lista_ = [];
  try { lista_ = (JSON.parse(bloco).jsonArray || []); } catch {}
  const out = lista_.slice(0, Math.max(5, Math.min(30, Number(ctx.limite) || 20))).map((a) => ent('url', `https://www.in.gov.br/web/dou/-/${a.urlTitle}`, 'citado no Diário Oficial da União', { rotulo: `DOU ${a.pubDate} · ${curtoT(a.title || a.artType || '', 40)}`, props: { ato: a.artType || '', data: a.pubDate || '', seção: a.pubName || '', órgão: String(a.hierarchyStr || '').split('/').slice(0, 3).join(' / '), trecho: tira(a.content || '').slice(0, 300) } }));
  // os órgãos que mais publicam sobre o nome viram organizações
  const orgaos = {};
  for (const a of lista_) { const o = String(a.hierarchyStr || '').split('/').filter(Boolean)[1]; if (o) orgaos[o] = (orgaos[o] || 0) + 1; }
  for (const [o, q] of Object.entries(orgaos).sort((a, b) => b[1] - a[1]).slice(0, 4)) out.push(ent('organizacao', o, 'órgão que publica atos com o nome', { props: { atos: q } }));
  return { entidades: unicos(out), props: { 'atos no Diário Oficial da União': lista_.length ? `${lista_.length}${lista_.length >= 20 ? '+' : ''}` : 0, atenção: lista_.length ? 'o nome pode aparecer só citado (num gabinete, numa lista): leia o trecho' : '' }, aviso: lista_.length ? '' : 'Nenhum ato do Diário Oficial da União cita este nome.' };
}

// ---------- TCU: inabilitados para cargo público e proibidos de licitar ----------
// as listas trazem o CPF completo: o Bluetego descarta esse campo (não cria nem mostra CPF)
export async function tcu(ctx, nome) {
  const falta = exigeNomeCompleto(nome); if (falta) return falta;
  const q = encodeURIComponent(JSON.stringify({ nome: { $like: `%${semAcento_(nome).toUpperCase()}%` } }));
  const [inab, inid] = await Promise.all(['inabilitados', 'inidoneos'].map((l) => ctx.json(`https://contas.tcu.gov.br/ords/condenacao/consulta/${l}?q=${q}`).then((d) => ((d && d.items) || []).map((x) => ({ ...x, lista: l }))).catch(() => [])));
  const hits = [...inab, ...inid].filter((x) => nomeCasa(nome, x.nome));
  const out = [];
  for (const x of hits.slice(0, 10)) {
    out.push(ent('organizacao', 'Tribunal de Contas da União', x.lista === 'inabilitados' ? 'inabilitado(a) para cargo público pelo TCU' : 'proibido(a) de licitar pelo TCU (inidôneo)', { alerta: true, props: { processo: x.processo || '', acórdão: x.deliberacao || '', desde: data(x.data_transito_julgado), até: data(x.data_final), local: [x.municipio, x.uf].filter(Boolean).join(' - ') } }));
    if (x.municipio) out.push(ent('local', `${x.municipio} - ${x.uf}`, 'município na condenação do TCU'));
  }
  return { entidades: unicos(out), alerta: hits.length > 0, props: { TCU: hits.length ? hits.map((x) => `${x.lista === 'inabilitados' ? 'inabilitado' : 'inidôneo'} até ${data(x.data_final)} (${x.deliberacao})`).join('; ') : 'nada consta', risco: hits.length ? 'condenação no TCU: confira município e processo para descartar homônimo' : '' } };
}

// ---------- parlamentares: Câmara (todas as legislaturas) e Senado (desde 1946) ----------
export async function parlamentar(ctx, nome) {
  const falta = exigeNomeCompleto(nome); if (falta) return falta;
  const out = [], props = {};
  // Câmara: o nome casa por trecho; só ficam os mandatos de quem tem todas as palavras do nome
  const legs = Array.from({ length: 57 }, (_, i) => `idLegislatura=${i + 1}`).join('&');
  // o nome inteiro e cada palavra (o parlamentar pode ter usado só parte do nome: "FERNANDO COLLOR")
  const buscas = [nome, ...palavrasNome(nome)].slice(0, 5);
  const cams = await Promise.all(buscas.map((q) => ctx.json(`https://dadosabertos.camara.leg.br/api/v2/deputados?nome=${encodeURIComponent(q)}&${legs}&itens=100`, { timeout: 40000 }).catch(() => null)));
  const vistos = new Set();
  const mandatos = cams.flatMap((c) => (c && c.dados) || []).filter((x) => (nomeCasa(nome, x.nome) || nomeCasa(x.nome, nome)) && !vistos.has(x.id + '|' + x.idLegislatura) && vistos.add(x.id + '|' + x.idLegislatura));
  const ids = [...new Set(mandatos.map((x) => x.id))].slice(0, 3);
  for (const id of ids) {
    const [det, ocup] = await Promise.all([ctx.json(`https://dadosabertos.camara.leg.br/api/v2/deputados/${id}`).catch(() => null), ctx.json(`https://dadosabertos.camara.leg.br/api/v2/deputados/${id}/ocupacoes`).catch(() => null)]);
    const d = (det && det.dados) || {};
    if (d.nomeCivil && !nomeCasa(nome, d.nomeCivil) && !nomeCasa(d.nomeCivil, nome)) continue;
    const ms = mandatos.filter((x) => x.id === id);
    out.push(ent('organizacao', 'Câmara dos Deputados', `deputado(a) federal em ${ms.length} ${ms.length === 1 ? 'legislatura' : 'legislaturas'}`, { props: { 'nome civil': d.nomeCivil || '', partidos: [...new Set(ms.map((x) => x.siglaPartido))].join(', '), UF: [...new Set(ms.map((x) => x.siglaUf))].join(', '), legislaturas: ms.map((x) => x.idLegislatura).join(', '), perfil: `https://www.camara.leg.br/deputados/${id}` } }));
    for (const p of new Set(ms.map((x) => x.siglaPartido).filter(Boolean))) out.push(ent('organizacao', p, 'partido (Câmara)'));
    if (d.municipioNascimento) out.push(ent('local', `${d.municipioNascimento} - ${d.ufNascimento}`, 'nasceu em'));
    if (d.dataNascimento) props.nascimento = d.dataNascimento;
    if (d.escolaridade) props.escolaridade = d.escolaridade;
    if (d.ultimoStatus && d.ultimoStatus.email) out.push(ent('email', d.ultimoStatus.email, 'e-mail do gabinete'));
    for (const o of ((ocup && ocup.dados) || []).slice(0, 10)) if (o.entidade) out.push(ent('organizacao', o.entidade, o.titulo ? `ocupação declarada: ${o.titulo}` : 'ocupação declarada', { props: { de: o.anoInicio || '', até: o.anoFim || '', UF: o.entidadeUF || '' } }));
  }
  // Senado: a lista inteira desde 1946 (não há busca por nome), filtrada aqui
  try {
    const sen = await listaGrande(ctx, 'https://legis.senado.leg.br/dadosabertos/senador/lista/legislatura/38/57.json', 24, (t) => {
      const j = JSON.parse(t);
      const lista_ = ((((j.ListaParlamentarLegislatura || {}).Parlamentares || {}).Parlamentar) || []);
      return Array.isArray(lista_) ? lista_ : [lista_];
    });
    const achados = sen.filter((p) => { const i = p.IdentificacaoParlamentar || {}; return nomeCasa(nome, i.NomeCompletoParlamentar || '') || nomeCasa(nome, i.NomeParlamentar || ''); }).slice(0, 3);
    for (const p of achados) {
      const i = p.IdentificacaoParlamentar, cod = i.CodigoParlamentar;
      const ms = [].concat((p.Mandatos && p.Mandatos.Mandato) || []);
      out.push(ent('organizacao', 'Senado Federal', `senador(a) em ${ms.length} ${ms.length === 1 ? 'mandato' : 'mandatos'}`, { props: { 'nome completo': i.NomeCompletoParlamentar || '', partido: i.SiglaPartidoParlamentar || '', UF: [...new Set(ms.map((m) => m.UfParlamentar).filter(Boolean))].join(', '), perfil: i.UrlPaginaParlamentar || `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${cod}` } }));
      for (const m of ms) for (const s of [].concat((m.Suplentes && m.Suplentes.Suplente) || [])) if (s.NomeParlamentar) out.push(ent('pessoa', s.NomeParlamentar, `${(s.DescricaoParticipacao || 'suplente').toLowerCase()} no Senado`));
      const cargos = await ctx.json(`https://legis.senado.leg.br/dadosabertos/senador/${cod}/cargos.json`).catch(() => null);
      const lista_ = [].concat(((((cargos || {}).CargoParlamentar || {}).Parlamentar || {}).Cargos || {}).Cargo || []);
      for (const c of lista_.slice(0, 8)) if (c.IdentificacaoComissao && c.IdentificacaoComissao.NomeComissao) out.push(ent('organizacao', c.IdentificacaoComissao.NomeComissao, `${String(c.DescricaoCargo || 'membro').toLowerCase()} (Senado)`, { props: { desde: data(c.DataInicio), até: data(c.DataFim) || 'atual' } }));
    }
  } catch { props.Senado = 'lista fora do ar'; }
  const achou = out.some((e) => /Câmara dos Deputados|Senado Federal/.test(e.valor));
  return { entidades: unicos(out), props, aviso: achou ? '' : 'Não foi deputado(a) federal nem senador(a).' };
}

// ---------- sanções: OFAC (EUA), ONU e União Europeia ----------
export async function sancoes(ctx, nome) {
  const falta = exigeNomeCompleto(nome); if (falta) return falta;
  const props = {}, out = [], achados = [];
  const tarefas = [
    ['OFAC (EUA)', async () => {
      const linhas = await listaGrande(ctx, 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV', 24, (t) => lerCsv(t).filter((l) => l.length > 3));
      for (const l of linhas) if (nomeCasa(nome, l[1])) achados.push({ fonte: 'OFAC (EUA)', nome: l[1], programa: l[3], cargo: l[4] === '-0-' ? '' : l[4], obs: (l[11] || '').slice(0, 300) });
    }],
    ['ONU', async () => {
      const ind = await listaGrande(ctx, 'https://scsanctions.un.org/resources/xml/en/consolidated.xml', 24, (t) => t.split('<INDIVIDUAL>').slice(1).map((b) => b.split('</INDIVIDUAL>')[0]));
      const tag = (b, t) => tira((b.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] || '');
      for (const b of ind) {
        const nomes = [[tag(b, 'FIRST_NAME'), tag(b, 'SECOND_NAME'), tag(b, 'THIRD_NAME'), tag(b, 'FOURTH_NAME')].filter(Boolean).join(' '), ...[...b.matchAll(/<ALIAS_NAME>([^<]+)<\/ALIAS_NAME>/g)].map((m) => m[1])];
        const n = nomes.find((x) => nomeCasa(nome, x));
        if (n) achados.push({ fonte: 'ONU', nome: nomes[0], programa: `${tag(b, 'UN_LIST_TYPE')} ${tag(b, 'REFERENCE_NUMBER')}`, cargo: tag(b, 'DESIGNATION'), obs: `incluído em ${tag(b, 'LISTED_ON')}; nacionalidade ${tag(b, 'NATIONALITY')}`, link: tag(b, 'INTERPOL_LINK') });
      }
    }],
    ['União Europeia', async () => {
      const linhas = await listaGrande(ctx, 'https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw', 24, (t) => {
        const ls = lerCsv(t, ';'), cab = ls[0] || [];
        const c = (n) => cab.indexOf(n);
        return ls.slice(1).map((l) => ({ nome: l[c('NameAlias_WholeName')], funcao: l[c('NameAlias_Function')], programa: l[c('Entity_Regulation_Programme')], url: l[c('Entity_Regulation_PublicationUrl')], tipo: l[c('Entity_SubjectType')] })).filter((x) => x.nome && x.tipo === 'P');
      });
      const vistos = new Set();
      for (const x of linhas) if (nomeCasa(nome, x.nome) && !vistos.has(x.nome)) { vistos.add(x.nome); achados.push({ fonte: 'União Europeia', nome: x.nome, programa: x.programa, cargo: x.funcao, link: x.url }); }
    }],
  ];
  await Promise.all(tarefas.map(([f, fn]) => fn().catch(() => { props[f] = 'lista fora do ar'; })));
  for (const a of achados.slice(0, 12)) out.push(ent('organizacao', a.fonte === 'OFAC (EUA)' ? 'OFAC (Tesouro dos EUA)' : a.fonte === 'ONU' ? 'Conselho de Segurança da ONU' : 'União Europeia', `sancionado(a): ${a.programa || 'lista de sanções'}`, { alerta: true, props: { 'nome na lista': a.nome, cargo: a.cargo || '', observações: a.obs || '', link: a.link || '' } }));
  for (const f of ['OFAC (EUA)', 'ONU', 'União Europeia']) if (!props[f]) props[f] = achados.some((a) => a.fonte === f) ? 'consta' : 'não consta';
  if (achados.length) props.risco = 'nome em lista de sanções: confira data de nascimento e nacionalidade nas observações para descartar homônimo';
  return { entidades: unicos(out), alerta: achados.length > 0, props };
}

// ---------- ICIJ Offshore Leaks: dirigentes e acionistas de offshores nos vazamentos ----------
export async function offshore(ctx, nome) {
  const falta = exigeNomeCompleto(nome); if (falta) return falta;
  const r = await ctx.post('https://offshoreleaks.icij.org/api/v1/reconcile', { queries: { q0: { query: nome, type: 'https://offshoreleaks.icij.org/schema/oldb/officer', limit: 15 } } });
  // a API sempre devolve alguém: só vale quem tem todas as palavras do nome
  const res = (((r || {}).q0 || {}).result || []).filter((x) => nomeCasa(nome, x.name));
  const out = res.slice(0, 8).map((x) => ent('url', `https://offshoreleaks.icij.org/nodes/${x.id}`, 'possível menção no Offshore Leaks (ICIJ)', { rotulo: `ICIJ · ${x.name}`, props: { 'nome no vazamento': x.name, origem: x.description || '', atenção: 'sem data de nascimento: pode ser homônimo', fonte: 'ICIJ Offshore Leaks (cite a fonte)' } }));
  return { entidades: out, props: { 'Offshore Leaks': res.length ? `${res.length} possíveis menções` : 'nenhuma' } };
}

// ---------- autor: bibliotecas nacionais (VIAF) e livros (Open Library), e o Prêmio Nobel ----------
export async function autor(ctx, nome) {
  const falta = exigeNomeCompleto(nome); if (falta) return falta;
  const [viaf, ol] = await Promise.all([ctx.json(`https://viaf.org/viaf/AutoSuggest?query=${encodeURIComponent(nome)}`).catch(() => null), ctx.json(`https://openlibrary.org/search/authors.json?q=${encodeURIComponent(nome)}&limit=5`).catch(() => null)]);
  const out = [], props = {};
  const v = ((viaf && viaf.result) || []).filter((x) => x.nametype === 'personal' && nomeCasa(nome, x.term))[0];
  if (v) { out.push(ent('url', `https://viaf.org/viaf/${v.viafid}`, 'registro nas bibliotecas nacionais (VIAF)', { rotulo: `VIAF · ${v.term}` })); props['bibliotecas que registram'] = ['lc', 'dnb', 'bnf', 'ptbnp', 'bne', 'iccu', 'selibr'].filter((k) => v[k]).map((k) => k.toUpperCase()).join(', '); props['no VIAF'] = v.term; }
  for (const a of ((ol && ol.docs) || []).filter((x) => nomeCasa(nome, x.name) && x.work_count > 0).slice(0, 2)) {
    out.push(ent('url', `https://openlibrary.org/authors/${a.key}`, 'autor(a) na Open Library', { rotulo: `Open Library · ${a.name}`, props: { obras: a.work_count, 'obra principal': a.top_work || '', nascimento: a.birth_date || '', assuntos: (a.top_subjects || []).slice(0, 5).join(', ') } }));
  }
  return { entidades: out, props, aviso: out.length ? '' : 'Nenhum registro de autor com este nome (VIAF, Open Library).' };
}
export async function nobel(ctx, nome) {
  const falta = exigeNomeCompleto(nome); if (falta) return falta;
  const d = await ctx.json(`https://api.nobelprize.org/2.1/laureates?name=${encodeURIComponent(nome)}`);
  const l = ((d && d.laureates) || []).filter((x) => nomeCasa(nome, (x.fullName && x.fullName.en) || (x.knownName && x.knownName.en) || ''))[0];
  if (!l) return { entidades: [], props: { 'Prêmio Nobel': 'não' } };
  const out = [];
  for (const p of l.nobelPrizes || []) for (const a of p.affiliations || []) if (a.name && a.name.en) out.push(ent('organizacao', a.name.en, `afiliação no Nobel de ${p.awardYear}`));
  return { entidades: unicos(out), props: { 'Prêmio Nobel': (l.nobelPrizes || []).map((p) => `${(p.category && p.category.en) || ''} ${p.awardYear}`).join(', '), motivação: ((l.nobelPrizes || [])[0] && l.nobelPrizes[0].motivation && l.nobelPrizes[0].motivation.en) || '' } };
}

// ---------- imprensa mundial: menções recentes (GDELT) ----------
export async function imprensa(ctx, nome) {
  const falta = exigeNomeCompleto(nome); if (falta) return falta;
  const r = await ctx.pagina(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent('"' + nome + '"')}&mode=artlist&format=json&maxrecords=20&sort=datedesc`, { timeout: 40000 });
  if (r.status === 429) throw new Falha('O GDELT está limitando as consultas deste IP (aceita uma a cada 5 segundos e bloqueia por um tempo depois de várias seguidas); tente de novo mais tarde.', { status: 429 });
  let arts = [];
  try { arts = (JSON.parse(r.texto).articles || []); } catch {}
  const out = arts.slice(0, Math.max(5, Math.min(20, Number(ctx.limite) || 15))).map((a) => ent('url', a.url, 'citado na imprensa', { rotulo: `${a.domain} · ${curtoT(a.title || '', 40)}`, props: { título: a.title || '', publicado: a.seendate ? `${a.seendate.slice(0, 4)}-${a.seendate.slice(4, 6)}-${a.seendate.slice(6, 8)}` : '', país: a.sourcecountry || '', idioma: a.language || '' } }));
  const veiculos = {};
  for (const a of arts) veiculos[a.domain] = (veiculos[a.domain] || 0) + 1;
  return { entidades: out, props: { 'menções na imprensa (últimos 3 meses)': arts.length ? `${arts.length}${arts.length >= 20 ? '+' : ''}` : 0, 'veículos': Object.keys(veiculos).slice(0, 6).join(', ') }, aviso: arts.length ? '' : 'Nenhuma menção na imprensa nos últimos 3 meses (GDELT).' };
}

// ---------- telefone: quem publica este número (Wikidata e OpenStreetMap) e a reputação de spam (tellows) ----------
// os 8 últimos dígitos com separador opcional entre eles (os formatos gravados variam: "+55 (14) 3491-2202", "+55-014-3491-2202")
const finalFlex = (d8) => d8.split('').join('[^0-9]?');
const dddDoNumero = (achado, ddd) => { const d = String(achado).replace(/\D/g, '').replace(/^55/, '').replace(/^0/, ''); return d.startsWith(String(ddd)); };
export async function telefoneWikidata(ctx, numero) {
  const i = telefoneInfo(numero);
  if (!i || !i.ddd) return { entidades: [], aviso: 'Só para números do Brasil com DDD.' };
  const d8 = normalizar('telefone', numero).replace(/\D/g, '').slice(-8);
  const q = `SELECT ?i ?iLabel ?t ?site WHERE { ?i wdt:P1329 ?t . FILTER(STRSTARTS(?t, "+55") && REGEX(?t, "${finalFlex(d8)}$")) OPTIONAL { ?i wdt:P856 ?site } SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en". } } LIMIT 20`;
  const r = await ctx.json(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { timeout: 60000, headers: { accept: 'application/sparql-results+json' } });
  const linhas = (((r || {}).results || {}).bindings || []).filter((b) => dddDoNumero(b.t.value, i.ddd));
  const out = [];
  for (const b of linhas) {
    out.push(ent('organizacao', b.iLabel.value, 'tem este telefone (Wikidata)', { props: { wikidata: b.i.value, 'telefone no Wikidata': b.t.value } }));
    if (b.site) out.push(ent('url', b.site.value, 'site oficial', { de: { tipo: 'organizacao', valor: b.iLabel.value } }));
  }
  return { entidades: unicos(out), aviso: linhas.length ? '' : 'Nenhuma organização do Wikidata tem este telefone.' };
}
export async function telefoneOsm(ctx, numero) {
  const i = telefoneInfo(numero);
  if (!i || !i.ddd) return { entidades: [], aviso: 'Só para números do Brasil com DDD.' };
  const d8 = normalizar('telefone', numero).replace(/\D/g, '').slice(-8);
  // o celular pode estar gravado com ou sem o nono dígito; a regex do Overpass é POSIX (sem \D)
  const re = `${i.ddd}[^0-9]{0,3}${i.celular ? '9?[^0-9]?' : ''}${finalFlex(d8)}`;
  const q = `[out:json][timeout:150];area["ISO3166-2"="BR-${i.uf}"]->.a;nwr(area.a)[~"^(phone|contact:phone|contact:mobile|mobile|contact:whatsapp|fax)$"~"${re}"];out tags center 10;`;
  let r = null;
  for (const srv of ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
    try { r = await ctx.json(`${srv}?data=${encodeURIComponent(q)}`, { timeout: 170000 }); break; } catch {}
  }
  if (!r) throw new Falha('Os servidores do OpenStreetMap (Overpass) estão ocupados; tente de novo mais tarde.', { status: 502 });
  const els = (r.elements || []).filter((e) => e.tags && e.tags.name);
  const out = [];
  for (const e of els) {
    const t = e.tags, nome = t.name;
    out.push(ent('organizacao', nome, 'estabelecimento com este telefone (OpenStreetMap)', { props: { tipo: t.amenity || t.shop || t.office || t.tourism || t.craft || t.healthcare || '', cidade: t['addr:city'] || '', mapa: `https://www.openstreetmap.org/${e.type}/${e.id}` } }));
    const rua = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ');
    const c = e.center || (e.lat != null ? { lat: e.lat, lon: e.lon } : null);
    if (rua || c) out.push(ent('local', rua ? [rua, t['addr:city'], t['addr:postcode']].filter(Boolean).join(' - ') : `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`, 'endereço no mapa', { de: { tipo: 'organizacao', valor: nome }, props: c ? { coordenadas: `${c.lat}, ${c.lon}` } : {} }));
    for (const k of ['website', 'contact:website']) if (t[k]) out.push(ent('url', t[k], 'site', { de: { tipo: 'organizacao', valor: nome } }));
    for (const k of ['email', 'contact:email']) if (t[k]) out.push(ent('email', t[k], 'e-mail no mapa', { de: { tipo: 'organizacao', valor: nome } }));
    for (const k of ['contact:instagram', 'contact:facebook']) if (t[k] && /^https?:/.test(t[k])) out.push(ent('conta', t[k], 'perfil no mapa', { de: { tipo: 'organizacao', valor: nome } }));
  }
  return { entidades: unicos(out), aviso: els.length ? '' : `Nenhum estabelecimento do OpenStreetMap em ${i.uf} tem este telefone.` };
}
// tellows: só a nota, a quantidade de avaliações e a categoria; os comentários são texto livre e ficam de fora
export async function tellows(ctx, numero) {
  const i = telefoneInfo(numero);
  if (!i || i.ddi !== '+55') return { entidades: [], aviso: 'Só para números do Brasil.' };
  const n = normalizar('telefone', numero), local = n.startsWith('+55') ? n.slice(3) : n;
  const r = await ctx.pagina(`https://www.tellows.com.br/num/${local}`);
  const url = `https://www.tellows.com.br/num/${local}`;
  let nota = null;
  for (const m of String(r.texto).matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1]); const a = [].concat(j).find((x) => x && x['@type'] === 'AggregateRating') || (j && j.aggregateRating); if (a) nota = a; } catch {}
  }
  const pesquisas = (String(r.texto).match(/Pesquisas:\s*<?[^0-9]{0,40}?([\d.]+)/i) || [])[1] || '';
  if (!nota) return { entidades: [ent('url', url, 'página no tellows')], props: { tellows: 'sem avaliações', 'pesquisas no tellows': pesquisas } };
  const desc = (nota.itemReviewed && nota.itemReviewed.description) || '';
  const categoria = (desc.match(/marcado como (.+?) \d+ vez/) || [])[1] || '';
  const score = Number(nota.ratingValue);
  return {
    entidades: [ent('url', url, 'avaliações de spam (tellows)', { props: { nota: `${score} de 9`, avaliações: nota.ratingCount, categoria } })],
    alerta: score >= 7,
    props: { tellows: `nota ${score} de 9 (1 confiável, 9 perigoso) em ${nota.ratingCount} avaliações`, categoria, 'pesquisas no tellows': pesquisas, risco: score >= 7 ? 'muitas pessoas marcaram este número como indesejado ou golpe' : '' },
  };
}

// ---------- VirusTotal (opcional: chave no Cofre) ----------
const VT = 'https://www.virustotal.com/api/v3/';
async function vt(ctx, caminho) {
  const r = await ctx.cofre(VT + caminho, { 'x-apikey': '{{vault:bluetego.virustotal}}' });
  if (r.status === 404) return null;
  if (r.status === 401 || r.status === 403) throw new Falha('O VirusTotal recusou a chave. Confira no Cofre.', { codigo: 'cofre' });
  if (r.status === 429) throw new Falha('Limite da chave gratuita do VirusTotal (4 por minuto). Espere um pouco.', { status: 429 });
  if (!r.ok) throw new Falha(`VirusTotal respondeu ${r.status}`);
  return r.json();
}
function vtProps(a) {
  const s = a.last_analysis_stats || {};
  const total = Object.values(s).reduce((x, y) => x + (Number(y) || 0), 0);
  return { 'VirusTotal': total ? `${s.malicious || 0} de ${total} motores dizem malicioso${s.suspicious ? `, ${s.suspicious} suspeito` : ''}` : 'sem análise', reputação: a.reputation ?? '', categorias: Object.values(a.categories || {}).slice(0, 4).join(', ') };
}
export async function virustotal(ctx, valor, tipo) {
  const caminho = tipo === 'ip' ? `ip_addresses/${valor}` : tipo === 'dominio' ? `domains/${valor}` : tipo === 'hash' ? `files/${valor}` : `urls/${Buffer.from(valor).toString('base64url')}`;
  const d = await vt(ctx, caminho);
  if (!d) return { entidades: [], aviso: 'O VirusTotal não conhece este item.' };
  const a = (d.data && d.data.attributes) || {};
  const props = vtProps(a);
  const out = [];
  if (tipo === 'hash') {
    Object.assign(props, { nome: a.meaningful_name || '', tipo: a.type_description || '', tamanho: a.size ? `${Math.round(a.size / 1024)} KB` : '', 'visto em': a.first_submission_date ? new Date(a.first_submission_date * 1000).toISOString().slice(0, 10) : '' });
    for (const h of [a.md5, a.sha1, a.sha256]) if (h && h !== valor) out.push(ent('hash', h, 'mesmo arquivo'));
  }
  const malicioso = (a.last_analysis_stats || {}).malicious > 0;
  return { entidades: out, props, alerta: malicioso };
}

// ---------- catálogo ----------
// de: tipos de entidade de origem · rapida: entra no "rodar as rápidas" (duplo clique) · fonte: de onde vêm os dados
export const TRANSFORMACOES = [
  { id: 'dns-ip', de: ['dominio'], nome: 'Resolver IPs (A, AAAA, CNAME)', fonte: 'DNS', rapida: true, run: dnsIPs },
  { id: 'dns-mx', de: ['dominio'], nome: 'Servidores de e-mail (MX)', fonte: 'DNS', rapida: true, run: dnsMX },
  { id: 'dns-ns', de: ['dominio'], nome: 'Servidores de nomes (NS)', fonte: 'DNS', rapida: true, run: dnsNS },
  { id: 'dns-txt', de: ['dominio'], nome: 'TXT, SPF e DMARC (serviços usados)', fonte: 'DNS', rapida: true, run: dnsTXT },
  { id: 'rdap-dominio', de: ['dominio'], nome: 'Registro (RDAP/WHOIS)', fonte: 'rdap.org', rapida: true, run: rdapDominio },
  { id: 'subdominios', de: ['dominio'], nome: 'Subdomínios (certificados, DNS e arquivo)', fonte: 'crt.sh, certspotter, HackerTarget, Wayback', run: subdominios },
  { id: 'explorar-site', de: ['dominio'], nome: 'Explorar o site: robots, sitemap, JavaScript, arquivos expostos', fonte: 'o próprio site', run: explorarSite },
  { id: 'seguranca-email', de: ['dominio'], nome: 'Segurança do e-mail: DMARC, DKIM, MTA-STS, BIMI, DNSSEC', fonte: 'DNS', rapida: true, run: segurancaEmail },
  { id: 'infostealer', de: ['dominio'], nome: 'Credenciais roubadas por infostealer', fonte: 'Hudson Rock', run: infostealer },
  { id: 'popularidade', de: ['dominio'], nome: 'Popularidade no mundo', fonte: 'Tranco', rapida: true, run: popularidade },
  { id: 'common-crawl', de: ['dominio'], nome: 'Endereços no Common Crawl', fonte: 'Common Crawl', run: commonCrawl },
  { id: 'documentos', de: ['dominio'], nome: 'Documentos públicos e metadados (autores, usuários)', fonte: 'o próprio site + Wayback', run: documentos },
  { id: 'rastreadores', de: ['dominio'], nome: 'IDs de rastreamento (Analytics, AdSense, Pixel)', fonte: 'o próprio site', rapida: true, run: rastreadores },
  { id: 'site', de: ['dominio'], nome: 'Ler o site (e-mails, perfis, links)', fonte: 'o próprio site', run: site },
  { id: 'contatos-site', de: ['dominio', 'url'], nome: 'Dados de contato do site: telefones, WhatsApp, CNPJ, endereço, redes sociais', fonte: 'o próprio site (inicial e páginas de contato)', run: contatosSite },
  { id: 'wayback', de: ['dominio'], nome: 'Endereços arquivados', fonte: 'Wayback Machine', run: wayback },
  { id: 'tecnologias', de: ['dominio'], nome: 'Tecnologias do site', fonte: 'o próprio site', rapida: true, run: tecnologias },
  { id: 'certificado', de: ['dominio'], nome: 'Certificado TLS (validade, outros nomes)', fonte: 'o próprio site', rapida: true, run: certificado },
  { id: 'contatos-seguranca', de: ['dominio'], nome: 'Contatos de segurança (security.txt, SOA)', fonte: 'o próprio site + DNS', run: contatosSeguranca },
  { id: 'parecidos', de: ['dominio'], nome: 'Domínios parecidos registrados (golpes)', fonte: 'DNS (até 260 variações)', run: parecidos },
  { id: 'ptr', de: ['ip'], nome: 'DNS reverso (PTR)', fonte: 'DNS', rapida: true, run: ptr },
  { id: 'ip-asn', de: ['ip'], nome: 'Sistema autônomo e prefixo', fonte: 'RIPEstat', rapida: true, run: ipParaASN },
  { id: 'geo', de: ['ip'], nome: 'Localização e provedor', fonte: 'ipwho.is', rapida: true, run: geo },
  { id: 'internetdb', de: ['ip'], nome: 'Portas abertas e vulnerabilidades', fonte: 'Shodan InternetDB', rapida: true, run: internetdb },
  { id: 'mesmo-ip', de: ['ip'], nome: 'Domínios no mesmo IP (DNS passivo e reverso)', fonte: 'AlienVault OTX + HackerTarget', run: mesmoIP },
  { id: 'ip-reputacao', de: ['ip'], nome: 'Reputação: varredura, listas de ameaça, Tor, spam, Spamhaus', fonte: 'GreyNoise, SANS ISC, Tor, StopForumSpam, Spamhaus', rapida: true, run: ipReputacao },
  { id: 'urlscan', de: ['dominio', 'ip'], nome: 'Varreduras públicas (páginas, IPs, capturas de tela)', fonte: 'urlscan.io', run: urlscan },
  { id: 'rdap-ip', de: ['ip', 'rede'], nome: 'Dono do bloco (RDAP)', fonte: 'rdap.org', run: rdapIP },
  { id: 'asn-prefixos', de: ['asn'], nome: 'Prefixos anunciados', fonte: 'RIPEstat', run: asnPrefixos },
  { id: 'asn-dono', de: ['asn'], nome: 'Quem opera o sistema autônomo', fonte: 'RIPEstat', rapida: true, run: asnDono },
  { id: 'peeringdb', de: ['asn'], nome: 'Perfil da rede: site, pontos de troca, data centers', fonte: 'PeeringDB', run: peeringdb },
  { id: 'asn-vizinhos', de: ['asn'], nome: 'Vizinhos (trânsito)', fonte: 'RIPEstat', run: asnVizinhos },
  { id: 'url-dominio', de: ['url'], nome: 'Domínio da URL', fonte: 'local', rapida: true, run: urlDominio },
  { id: 'github-repo', de: ['url'], nome: 'Repositório do GitHub (dono, contribuidores, e-mails)', fonte: 'GitHub', run: githubRepo },
  { id: 'url-seguir', de: ['url'], nome: 'Seguir redirecionamentos e ler cabeçalhos', fonte: 'o próprio site', rapida: true, run: urlSeguir },
  { id: 'email-dominio', de: ['email'], nome: 'Domínio do e-mail (e se ele recebe)', fonte: 'DNS', rapida: true, run: emailDominio },
  { id: 'pgp-email', de: ['email'], nome: 'Chaves PGP: nome real e outros e-mails da pessoa', fonte: 'keys.openpgp.org + keyserver.ubuntu.com', rapida: true, run: pgpEmail },
  { id: 'gravatar', de: ['email'], nome: 'Perfil no Gravatar', fonte: 'Gravatar', rapida: true, run: gravatar },
  { id: 'email-github', de: ['email'], nome: 'Contas do GitHub que usam o e-mail', fonte: 'GitHub', rapida: true, run: emailGithub },
  { id: 'nome-apelidos', de: ['pessoa'], nome: 'Apelidos prováveis', fonte: 'local', run: nomeApelidos },
  { id: 'emails-provaveis', de: ['pessoa'], nome: 'E-mails prováveis nos domínios ligados', fonte: 'DNS + Gravatar', run: emailsProvaveis },
  { id: 'ibge-nome', de: ['pessoa'], nome: 'Quantas pessoas têm o primeiro nome (risco de homônimo)', fonte: 'IBGE (Censo)', rapida: true, run: nomeIbge },
  { id: 'openalex', de: ['pessoa'], nome: 'Pesquisador: ORCID, instituição e citações', fonte: 'OpenAlex', run: openalex },
  { id: 'pgp-nome', de: ['pessoa'], nome: 'Chaves PGP com este nome', fonte: 'keyserver.ubuntu.com', run: pgpNome },
  { id: 'bluesky-busca', de: ['pessoa'], nome: 'Contas no Bluesky com este nome', fonte: 'Bluesky', run: blueskyBusca },
  { id: 'parlamentar', de: ['pessoa'], nome: 'Parlamentar: mandatos, partidos, ocupações, comissões', fonte: 'Câmara (desde 1826) e Senado (desde 1946)', run: parlamentar },
  { id: 'sancoes', de: ['pessoa', 'organizacao'], nome: 'Listas de sanções (OFAC, ONU, União Europeia)', fonte: 'Tesouro dos EUA, ONU, UE', rapida: true, run: sancoes },
  { id: 'stf', de: ['pessoa'], nome: 'Processos no STF em que é parte', fonte: 'STF', run: stf },
  { id: 'dou', de: ['pessoa'], nome: 'Atos no Diário Oficial da União (nomeações, punições, contratos)', fonte: 'Imprensa Nacional', run: dou },
  { id: 'tcu', de: ['pessoa'], nome: 'Inabilitado para cargo público ou proibido de licitar', fonte: 'TCU', rapida: true, run: tcu },
  { id: 'offshore', de: ['pessoa'], nome: 'Possíveis menções em vazamentos de offshores', fonte: 'ICIJ Offshore Leaks', run: offshore },
  { id: 'autor', de: ['pessoa'], nome: 'Autor(a): bibliotecas nacionais e livros', fonte: 'VIAF + Open Library', run: autor },
  { id: 'nobel', de: ['pessoa'], nome: 'Prêmio Nobel', fonte: 'Fundação Nobel', run: nobel },
  { id: 'imprensa', de: ['pessoa', 'organizacao'], nome: 'Menções na imprensa mundial (últimos 3 meses)', fonte: 'GDELT', run: imprensa },
  { id: 'fediverso', de: ['pessoa', 'apelido'], nome: 'Contas no fediverso (Mastodon e outras instâncias)', fonte: 'mastodon.social', run: fediverso },
  { id: 'launchpad', de: ['pessoa', 'apelido'], nome: 'Conta no Launchpad: apelidos de IRC e chaves', fonte: 'Launchpad', run: launchpad },
  { id: 'stackexchange', de: ['pessoa', 'apelido'], nome: 'Perfil no Stack Overflow e contas da rede', fonte: 'Stack Exchange (300 por dia)', run: stackexchange },
  { id: 'pessoa-wikidata', de: ['pessoa'], nome: 'Pessoa pública: cargos, onde trabalha, contas oficiais', fonte: 'Wikidata', rapida: true, run: pessoaWikidata },
  { id: 'orcid', de: ['pessoa'], nome: 'Pesquisador com este nome e instituição', fonte: 'ORCID', run: orcid },
  { id: 'github-nome', de: ['pessoa'], nome: 'Contas do GitHub com este nome', fonte: 'GitHub', run: githubNome },
  { id: 'wikipedia', de: ['pessoa', 'organizacao'], nome: 'Artigos da Wikipédia que citam o nome', fonte: 'Wikipédia', run: wikipedia },
  { id: 'contas-amplo', de: ['apelido'], nome: 'Contas em centenas de sites (regras do Maigret)', fonte: `até ${sitesMaigret().length} sites`, run: contasAmplo },
  { id: 'hacker-news', de: ['apelido'], nome: 'Atividade no Hacker News e sites que divulga', fonte: 'Algolia HN', run: hackerNews },
  { id: 'npm', de: ['apelido'], nome: 'Pacotes, repositórios e e-mail no npm', fonte: 'npm', run: npmMantenedor },
  { id: 'wikimedia', de: ['apelido'], nome: 'Conta global da Wikimedia (todas as wikis)', fonte: 'Wikimedia', run: wikimediaGlobal },
  { id: 'contas', de: ['apelido'], nome: 'Procurar contas com este nome', fonte: `${SITES.length} sites`, rapida: true, run: contas },
  { id: 'github', de: ['apelido'], nome: 'Perfil, e-mails dos commits e chaves no GitHub', fonte: 'GitHub', run: github },
  { id: 'github-rede', de: ['apelido'], nome: 'Rede no GitHub (seguidores, seguidos, membros)', fonte: 'GitHub', run: githubRede },
  { id: 'github-repos', de: ['apelido'], nome: 'Repositórios, linguagens e organizações', fonte: 'GitHub', run: githubRepos },
  { id: 'orcid-perfil', de: ['conta'], so: /orcid\.org\//, soAviso: 'Só serve para contas do ORCID.', nome: 'Perfil completo do ORCID (empregos, sites, e-mails)', fonte: 'ORCID', run: orcidPerfil },
  { id: 'conta-apelido', de: ['conta'], nome: 'Nome de usuário da conta', fonte: 'local', rapida: true, run: contaApelido },
  { id: 'telefone-wikidata', de: ['telefone'], nome: 'Organização com este telefone', fonte: 'Wikidata', run: telefoneWikidata },
  { id: 'telefone-osm', de: ['telefone'], nome: 'Estabelecimento com este telefone (lento: até 1 minuto)', fonte: 'OpenStreetMap (Overpass)', run: telefoneOsm },
  { id: 'tellows', de: ['telefone'], nome: 'Reputação de spam e golpe', fonte: 'tellows', run: tellows },
  { id: 'telefone', de: ['telefone'], nome: 'Tipo, operadora original, região, cidades do DDD e apps de mensagem', fonte: 'local + BrasilAPI', rapida: true, run: telefone },
  { id: 'web', de: ['telefone', 'email', 'apelido', 'pessoa', 'cnpj', 'organizacao', 'dominio', 'cripto', 'hash'], nome: 'Procurar na web', fonte: 'DuckDuckGo (Bing de reserva)', run: web },
  { id: 'wikidata', de: ['organizacao'], nome: 'Site oficial, sede, donos e fundadores', fonte: 'Wikidata', rapida: true, run: wikidata },
  { id: 'cnpj', de: ['cnpj'], nome: 'Razão social, sócios, endereço, regime e matriz', fonte: 'Receita (BrasilAPI ou Minha Receita)', rapida: true, run: cnpj },
  { id: 'rastreador-sites', de: ['rastreador'], nome: 'Outros sites com o mesmo ID', fonte: 'HackerTarget (50 por dia)', rapida: true, run: rastreadorSites },
  { id: 'dorks', de: ['dominio', 'pessoa', 'email', 'telefone', 'apelido', 'cnpj', 'organizacao'], nome: 'Buscas prontas (dorks) para abrir no navegador', fonte: 'local', run: dorks },
  { id: 'cpf', de: ['cpf'], nome: 'Validar e ver a região fiscal', fonte: 'local', rapida: true, run: cpf },
  { id: 'cep', de: ['cep'], nome: 'Endereço e coordenadas', fonte: 'BrasilAPI', rapida: true, run: cep },
  { id: 'coordenadas', de: ['local'], nome: 'Coordenadas e mapa', fonte: 'OpenStreetMap', rapida: true, run: coordenadas },
  { id: 'bitcoin', de: ['cripto'], nome: 'Saldo e carteiras ligadas', fonte: 'Blockstream', rapida: true, run: bitcoin },
  { id: 'cve-exploracao', de: ['cve'], nome: 'Explorada de fato? (CISA KEV) e avistamentos', fonte: 'CISA + CIRCL', rapida: true, run: cveExploracao },
  { id: 'cve', de: ['cve'], nome: 'Detalhes, CVSS e EPSS', fonte: 'MITRE + FIRST', rapida: true, run: cve },
  { id: 'texto-entidades', de: ['texto'], nome: 'Extrair entidades do texto', fonte: 'local', rapida: true, run: textoEntidades },
  { id: 'hashlookup', de: ['hash'], nome: 'Arquivo conhecido? Nome e os outros hashes', fonte: 'CIRCL hashlookup', rapida: true, run: hashlookup },
  { id: 'otx', de: ['ip', 'dominio', 'hash', 'url'], nome: 'Relatórios de ameaça', fonte: 'AlienVault OTX', rapida: true, run: otx },
  { id: 'virustotal', de: ['dominio', 'ip', 'hash', 'url'], nome: 'Reputação no VirusTotal', fonte: 'VirusTotal (chave no Cofre)', cofre: 'bluetego.virustotal', run: virustotal },
];
export const transformacao = (id) => TRANSFORMACOES.find((t) => t.id === id) || null;

// roda uma transformação, conferindo tipo e valor, e devolve o resultado sem entidades repetidas nem a própria origem
export async function rodar(id, tipo, valor, ctx, completo) {
  const t = transformacao(id);
  if (!t) throw new Falha('transformação desconhecida: ' + id, { status: 404 });
  if (!t.de.includes(tipo)) throw new Falha(`"${t.nome}" não serve para ${tipo}`);
  const v = normalizar(tipo, valor);
  if (!v) throw new Falha('valor vazio');
  if (tipo === 'ip' && !ehIP(v)) throw new Falha(`"${v}" não é um endereço IP`);
  if (tipo === 'dominio' && detectar(v) !== 'dominio') throw new Falha(`"${v}" não parece um domínio`);
  if (t.so && !t.so.test(v)) return { entidades: [], props: {}, aviso: t.soAviso || 'Esta transformação não serve para este valor.', alerta: false };
  const r = (await t.run(ctx, v, tipo === 'texto' ? completo : tipo)) || {};
  // cada entidade sai com o id (a forma canônica): é por ele que a página junta o que já está no grafo
  const entidades = unicos((r.entidades || []).filter((e) => e.valor && !(e.tipo === tipo && e.valor === v && !e.de)))
    .map((e) => ({ ...e, id: chave(e.tipo, e.valor), de: e.de ? { ...e.de, id: chave(e.de.tipo, e.de.valor) } : undefined }));
  const props = Object.fromEntries(Object.entries(r.props || {}).filter(([, x]) => x !== '' && x != null));
  return { entidades, props, aviso: r.aviso || '', alerta: !!r.alerta };
}
