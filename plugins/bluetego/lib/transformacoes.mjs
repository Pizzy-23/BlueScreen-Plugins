// Bluetego: as transformações. Cada uma recebe o valor de uma entidade e devolve entidades novas ligadas a ela
// (e propriedades para a própria entidade). Só usam fontes públicas e gratuitas, sem conta; o VirusTotal é opcional,
// com a chave guardada no Cofre da IDE. A rede chega por ctx (o servidor passa o fetch de verdade, os testes um falso).
//
// ctx.json(url, { headers, nulo404 })  -> objeto (ou null em 404 com nulo404)
// ctx.pagina(url, { seguir })          -> { status, url, headers, texto } (seguir: false devolve o redirecionamento)
// ctx.cofre(url, headers)              -> { status, ok, json() } pelo plugin.fetch da IDE, com {{vault:..}} trocado lá
// ctx.limite                           -> no máximo quantas entidades novas por transformação
import crypto from 'node:crypto';
import { normalizar, chave, telefoneInfo, nomeReverso, extrair, apelidosDeNome, ehIP, detectar } from './entidades.mjs';

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
  const visitar = (lista) => { for (const e of lista || []) { out.push({ papeis: e.roles || [], ...vcard(e), handle: e.handle || '' }); visitar(e.entities); } };
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
  const d = (await ripe(ctx, 'network-info', ip)).data || {};
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
// crt.sh: todo certificado emitido para o domínio entra no log público, então os nomes dele revelam subdomínios
export async function subdominios(ctx, dominio) {
  const lista = await ctx.json(`https://crt.sh/?q=${encodeURIComponent('%.' + dominio)}&output=json`, { timeout: 60000 });
  const nomes = new Map();
  for (const c of Array.isArray(lista) ? lista : []) {
    for (const n of String(c.name_value || '').split(/\n/)) {
      const d = normalizar('dominio', n);
      if (!d.endsWith('.' + dominio) || d === dominio || /[^a-z0-9.-]/.test(d)) continue;
      const visto = nomes.get(d);
      const quando = data(c.not_before);
      if (!visto || quando > visto) nomes.set(d, quando);
    }
  }
  // os mais recentes primeiro: costumam ser os que ainda existem
  const ord = [...nomes.entries()].sort((a, b) => (b[1] || '').localeCompare(a[1] || '') || a[0].localeCompare(b[0]));
  return corta(ord.map(([d, q]) => ent('dominio', d, 'subdomínio (certificado)', { props: { 'último certificado': q } })), ctx, ord.length);
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
  const emails = [...new Set([...s.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => decodeURIComponent(m[1])).concat(extrair(s.replace(/<[^>]+>/g, ' ')).filter((e) => e.tipo === 'email').map((e) => e.valor)).map((e) => e.toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e) && !/\.(png|jpe?g|gif|svg|webp)$/i.test(e) && !/sentry|wixpress|example\.|@(domain|email|seudominio|yourdomain|dominio|empresa)\.com$|^(you|your|seu|nome|name|email)@/i.test(e)))];
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
// sites com API que responde 404 (ou vazio) quando o usuário não existe: sem raspagem de HTML, sem falso positivo
// (npm e PyPI ficaram de fora: a busca do npm é aproximada e o PyPI responde 200 para qualquer nome)
const SITES = [
  { nome: 'GitHub', url: (u) => `https://api.github.com/users/${u}`, achou: (d) => d && d.login, perfil: (d) => d.html_url },
  { nome: 'GitLab', url: (u) => `https://gitlab.com/api/v4/users?username=${u}`, achou: (d) => Array.isArray(d) && d.length, perfil: (d) => d[0].web_url },
  { nome: 'Reddit', url: (u) => `https://www.reddit.com/user/${u}/about.json`, achou: (d) => d && d.data && d.data.name, perfil: (d) => `https://www.reddit.com/user/${d.data.name}` },
  { nome: 'Keybase', url: (u) => `https://keybase.io/_/api/1.0/user/lookup.json?usernames=${u}`, achou: (d) => d && d.them && d.them[0], perfil: (d) => `https://keybase.io/${d.them[0].basics.username}` },
  { nome: 'Hacker News', url: (u) => `https://hacker-news.firebaseio.com/v0/user/${u}.json`, achou: (d) => d && d.id, perfil: (d) => `https://news.ycombinator.com/user?id=${d.id}` },
  { nome: 'dev.to', url: (u) => `https://dev.to/api/users/by_username?url=${u}`, achou: (d) => d && d.username, perfil: (d) => `https://dev.to/${d.username}` },
  { nome: 'Docker Hub', url: (u) => `https://hub.docker.com/v2/users/${u}/`, achou: (d) => d && d.username, perfil: (d) => `https://hub.docker.com/u/${d.username}` },
  { nome: 'Chess.com', url: (u) => `https://api.chess.com/pub/player/${u.toLowerCase()}`, achou: (d) => d && d.username, perfil: (d) => d.url },
  { nome: 'Lichess', url: (u) => `https://lichess.org/api/user/${u}`, achou: (d) => d && d.id && !d.disabled, perfil: (d) => d.url },
];
export async function contas(ctx, apelido) {
  const u = encodeURIComponent(apelido.replace(/^@/, ''));
  const res = await Promise.all(SITES.map(async (s) => {
    try {
      const d = await ctx.json(s.url(u), { nulo404: true });
      return s.achou(d) ? { s, link: s.perfil(d) } : null;
    } catch { return null; }
  }));
  const achados = res.filter(Boolean);
  return { entidades: achados.map(({ s, link }) => ent('conta', link, `conta no ${s.nome}`, { props: { site: s.nome } })), props: { 'sites conferidos': SITES.map((s) => s.nome).join(', ') }, aviso: achados.length ? '' : `Nenhuma conta com este nome em ${SITES.length} sites.` };
}
export async function github(ctx, apelido) {
  const u = apelido.replace(/^@/, '').replace(/^https?:\/\/github\.com\//i, '').split('/')[0];
  const d = await ctx.json(`https://api.github.com/users/${encodeURIComponent(u)}`, { nulo404: true });
  if (!d) return { entidades: [], aviso: 'Não existe usuário do GitHub com este nome.' };
  const out = [ent('conta', d.html_url, 'conta no GitHub')];
  if (d.name) out.push(ent('pessoa', d.name, 'nome no GitHub'));
  if (d.company) for (const c of d.company.split(/[,&]/)) { const n = c.trim().replace(/^@/, ''); if (n) out.push(ent('organizacao', n, 'trabalha em')); }
  if (d.blog) out.push(ent('url', /^https?:/.test(d.blog) ? d.blog : 'https://' + d.blog, 'site pessoal'));
  if (d.email) out.push(ent('email', d.email, 'e-mail público'));
  if (d.location) out.push(ent('local', d.location, 'diz morar em'));
  if (d.twitter_username) out.push(ent('conta', `https://x.com/${d.twitter_username}`, 'conta no X'));
  // e-mails dos commits públicos: costumam revelar o e-mail real mesmo quando o perfil esconde
  try {
    const ev = await ctx.json(`https://api.github.com/users/${encodeURIComponent(u)}/events/public?per_page=100`);
    for (const e of Array.isArray(ev) ? ev : []) for (const c of (e.payload && e.payload.commits) || []) {
      const m = c.author && c.author.email;
      if (m && !/noreply|users\.noreply\.github\.com/i.test(m)) out.push(ent('email', m, 'e-mail nos commits'));
    }
  } catch {}
  return { entidades: unicos(out), props: { bio: d.bio || '', 'repositórios públicos': d.public_repos, seguidores: d.followers, 'criada em': data(d.created_at), tipo: d.type === 'Organization' ? 'organização' : 'usuário' } };
}
// conta: de um link de perfil, o apelido (para procurar o mesmo nome em outros sites)
export function contaApelido(_ctx, url) {
  let u;
  try { u = new URL(url); } catch { throw new Falha('a conta precisa ser o link do perfil'); }
  const partes = u.pathname.split('/').filter(Boolean).filter((p) => !['in', 'company', 'user', 'u', 'c', 'channel', 'profile', 'school'].includes(p.toLowerCase()));
  const nome = (partes[0] || u.searchParams.get('id') || '').replace(/^[@~]/, '');
  if (!nome) return { entidades: [], aviso: 'Não deu para tirar um nome de usuário deste link.' };
  return { entidades: [ent('apelido', nome, 'usuário da conta')] };
}

// ---------- telefone, CVE, texto ----------
export function telefone(_ctx, numero) {
  const i = telefoneInfo(numero);
  if (!i) return { entidades: [], aviso: 'Escreva o número com o código do país (+55 51 99999-9999).' };
  const lugar = i.estado ? `${i.estado}, Brasil` : i.pais;
  return { entidades: [ent('local', lugar, 'código de área')], props: { país: i.pais, DDI: i.ddi, DDD: i.ddd || '', tipo: i.ddd ? (i.celular ? 'celular' : 'fixo') : '' } };
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
  { id: 'subdominios', de: ['dominio'], nome: 'Subdomínios por certificados', fonte: 'crt.sh', run: subdominios },
  { id: 'site', de: ['dominio'], nome: 'Ler o site (e-mails, perfis, links)', fonte: 'o próprio site', run: site },
  { id: 'wayback', de: ['dominio'], nome: 'Endereços arquivados', fonte: 'Wayback Machine', run: wayback },
  { id: 'ptr', de: ['ip'], nome: 'DNS reverso (PTR)', fonte: 'DNS', rapida: true, run: ptr },
  { id: 'ip-asn', de: ['ip'], nome: 'Sistema autônomo e prefixo', fonte: 'RIPEstat', rapida: true, run: ipParaASN },
  { id: 'geo', de: ['ip'], nome: 'Localização e provedor', fonte: 'ipwho.is', rapida: true, run: geo },
  { id: 'internetdb', de: ['ip'], nome: 'Portas abertas e vulnerabilidades', fonte: 'Shodan InternetDB', rapida: true, run: internetdb },
  { id: 'rdap-ip', de: ['ip', 'rede'], nome: 'Dono do bloco (RDAP)', fonte: 'rdap.org', run: rdapIP },
  { id: 'asn-prefixos', de: ['asn'], nome: 'Prefixos anunciados', fonte: 'RIPEstat', run: asnPrefixos },
  { id: 'asn-dono', de: ['asn'], nome: 'Quem opera o sistema autônomo', fonte: 'RIPEstat', rapida: true, run: asnDono },
  { id: 'url-dominio', de: ['url', 'conta'], nome: 'Domínio da URL', fonte: 'local', rapida: true, run: urlDominio },
  { id: 'url-seguir', de: ['url'], nome: 'Seguir redirecionamentos e ler cabeçalhos', fonte: 'o próprio site', rapida: true, run: urlSeguir },
  { id: 'email-dominio', de: ['email'], nome: 'Domínio do e-mail (e se ele recebe)', fonte: 'DNS', rapida: true, run: emailDominio },
  { id: 'gravatar', de: ['email'], nome: 'Perfil no Gravatar', fonte: 'Gravatar', rapida: true, run: gravatar },
  { id: 'nome-apelidos', de: ['pessoa'], nome: 'Apelidos prováveis', fonte: 'local', run: nomeApelidos },
  { id: 'contas', de: ['apelido'], nome: 'Procurar contas com este nome', fonte: `${SITES.length} sites`, rapida: true, run: contas },
  { id: 'github', de: ['apelido'], nome: 'Perfil e e-mails no GitHub', fonte: 'GitHub', run: github },
  { id: 'conta-apelido', de: ['conta'], nome: 'Nome de usuário da conta', fonte: 'local', rapida: true, run: contaApelido },
  { id: 'telefone', de: ['telefone'], nome: 'País e estado do número', fonte: 'local', rapida: true, run: telefone },
  { id: 'cve', de: ['cve'], nome: 'Detalhes, CVSS e EPSS', fonte: 'MITRE + FIRST', rapida: true, run: cve },
  { id: 'texto-entidades', de: ['texto'], nome: 'Extrair entidades do texto', fonte: 'local', rapida: true, run: textoEntidades },
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
  const r = (await t.run(ctx, v, tipo === 'texto' ? completo : tipo)) || {};
  // cada entidade sai com o id (a forma canônica): é por ele que a página junta o que já está no grafo
  const entidades = unicos((r.entidades || []).filter((e) => e.valor && !(e.tipo === tipo && e.valor === v && !e.de)))
    .map((e) => ({ ...e, id: chave(e.tipo, e.valor), de: e.de ? { ...e.de, id: chave(e.de.tipo, e.de.valor) } : undefined }));
  const props = Object.fromEntries(Object.entries(r.props || {}).filter(([, x]) => x !== '' && x != null));
  return { entidades, props, aviso: r.aviso || '', alerta: !!r.alerta };
}
