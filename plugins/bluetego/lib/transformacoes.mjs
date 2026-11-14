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
export function telefone(_ctx, numero) {
  const i = telefoneInfo(numero);
  if (!i) return { entidades: [], aviso: 'Não reconheci o número. Escreva com o DDD (51 99999-1234) ou com o código do país (+351 912 345 678).' };
  const n = normalizar('telefone', numero), dig = n.replace(/\D/g, '');
  const out = [];
  if (i.estado) out.push(ent('local', i.regiao ? `${i.regiao} (${i.uf})` : `${i.estado}, Brasil`, 'região do DDD', { props: { estado: i.estado, país: 'Brasil' } }));
  else if (i.pais) out.push(ent('local', i.pais, 'país do número'));
  // os links abrem o perfil se o número usar o app; não dá para saber antes sem as APIs pagas
  if (n.startsWith('+') && (i.celular || !i.ddd)) {
    out.push(ent('conta', `https://wa.me/${dig}`, 'link do WhatsApp', { props: { aviso: 'abre a conversa se o número usar WhatsApp' } }));
    out.push(ent('conta', `https://t.me/+${dig}`, 'link do Telegram', { props: { aviso: 'abre o perfil se o número usar Telegram e deixar ser achado pelo número' } }));
    out.push(ent('conta', `https://signal.me/#p/+${dig}`, 'link do Signal', { props: { aviso: 'abre a conversa se o número usar Signal' } }));
  }
  return { entidades: out, props: { país: i.pais, DDI: i.ddi, DDD: i.ddd || '', tipo: i.tipo || '', região: i.regiao || '', 'jeitos de escrever': (i.formatos || []).slice(1).join(' · ') } };
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
export async function wikipedia(ctx, nome) {
  const d = await ctx.json(`https://pt.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=10&srsearch=${encodeURIComponent('"' + nome + '"')}`);
  const res = (d && d.query && d.query.search) || [];
  return { entidades: res.map((a) => ent('url', `https://pt.wikipedia.org/wiki/${encodeURIComponent(a.title.replace(/ /g, '_'))}`, 'citado na Wikipédia', { rotulo: `Wikipédia · ${a.title}`, props: { trecho: tira(a.snippet) } })), props: { Wikipédia: `${(d && d.query && d.query.searchinfo && d.query.searchinfo.totalhits) || 0} artigos citam o nome` }, aviso: res.length ? '' : 'Nenhum artigo da Wikipédia cita este nome.' };
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
  { id: 'documentos', de: ['dominio'], nome: 'Documentos públicos e metadados (autores, usuários)', fonte: 'o próprio site + Wayback', run: documentos },
  { id: 'rastreadores', de: ['dominio'], nome: 'IDs de rastreamento (Analytics, AdSense, Pixel)', fonte: 'o próprio site', rapida: true, run: rastreadores },
  { id: 'site', de: ['dominio'], nome: 'Ler o site (e-mails, perfis, links)', fonte: 'o próprio site', run: site },
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
  { id: 'rdap-ip', de: ['ip', 'rede'], nome: 'Dono do bloco (RDAP)', fonte: 'rdap.org', run: rdapIP },
  { id: 'asn-prefixos', de: ['asn'], nome: 'Prefixos anunciados', fonte: 'RIPEstat', run: asnPrefixos },
  { id: 'asn-dono', de: ['asn'], nome: 'Quem opera o sistema autônomo', fonte: 'RIPEstat', rapida: true, run: asnDono },
  { id: 'asn-vizinhos', de: ['asn'], nome: 'Vizinhos (trânsito)', fonte: 'RIPEstat', run: asnVizinhos },
  { id: 'url-dominio', de: ['url'], nome: 'Domínio da URL', fonte: 'local', rapida: true, run: urlDominio },
  { id: 'github-repo', de: ['url'], nome: 'Repositório do GitHub (dono, contribuidores, e-mails)', fonte: 'GitHub', run: githubRepo },
  { id: 'url-seguir', de: ['url'], nome: 'Seguir redirecionamentos e ler cabeçalhos', fonte: 'o próprio site', rapida: true, run: urlSeguir },
  { id: 'email-dominio', de: ['email'], nome: 'Domínio do e-mail (e se ele recebe)', fonte: 'DNS', rapida: true, run: emailDominio },
  { id: 'gravatar', de: ['email'], nome: 'Perfil no Gravatar', fonte: 'Gravatar', rapida: true, run: gravatar },
  { id: 'email-github', de: ['email'], nome: 'Contas do GitHub que usam o e-mail', fonte: 'GitHub', rapida: true, run: emailGithub },
  { id: 'nome-apelidos', de: ['pessoa'], nome: 'Apelidos prováveis', fonte: 'local', run: nomeApelidos },
  { id: 'emails-provaveis', de: ['pessoa'], nome: 'E-mails prováveis nos domínios ligados', fonte: 'DNS + Gravatar', run: emailsProvaveis },
  { id: 'pessoa-wikidata', de: ['pessoa'], nome: 'Pessoa pública: cargos, onde trabalha, contas oficiais', fonte: 'Wikidata', rapida: true, run: pessoaWikidata },
  { id: 'orcid', de: ['pessoa'], nome: 'Pesquisador com este nome e instituição', fonte: 'ORCID', run: orcid },
  { id: 'github-nome', de: ['pessoa'], nome: 'Contas do GitHub com este nome', fonte: 'GitHub', run: githubNome },
  { id: 'wikipedia', de: ['pessoa', 'organizacao'], nome: 'Artigos da Wikipédia que citam o nome', fonte: 'Wikipédia', run: wikipedia },
  { id: 'contas-amplo', de: ['apelido'], nome: 'Contas em centenas de sites (regras do Maigret)', fonte: `até ${sitesMaigret().length} sites`, run: contasAmplo },
  { id: 'contas', de: ['apelido'], nome: 'Procurar contas com este nome', fonte: `${SITES.length} sites`, rapida: true, run: contas },
  { id: 'github', de: ['apelido'], nome: 'Perfil, e-mails dos commits e chaves no GitHub', fonte: 'GitHub', run: github },
  { id: 'github-rede', de: ['apelido'], nome: 'Rede no GitHub (seguidores, seguidos, membros)', fonte: 'GitHub', run: githubRede },
  { id: 'github-repos', de: ['apelido'], nome: 'Repositórios, linguagens e organizações', fonte: 'GitHub', run: githubRepos },
  { id: 'conta-apelido', de: ['conta'], nome: 'Nome de usuário da conta', fonte: 'local', rapida: true, run: contaApelido },
  { id: 'telefone', de: ['telefone'], nome: 'Tipo, região e apps de mensagem', fonte: 'local', rapida: true, run: telefone },
  { id: 'web', de: ['telefone', 'email', 'apelido', 'pessoa', 'cnpj', 'organizacao', 'dominio', 'cripto', 'hash'], nome: 'Procurar na web', fonte: 'DuckDuckGo (Bing de reserva)', run: web },
  { id: 'wikidata', de: ['organizacao'], nome: 'Site oficial, sede, donos e fundadores', fonte: 'Wikidata', rapida: true, run: wikidata },
  { id: 'cnpj', de: ['cnpj'], nome: 'Razão social, sócios, endereço, regime e matriz', fonte: 'Receita (BrasilAPI ou Minha Receita)', rapida: true, run: cnpj },
  { id: 'rastreador-sites', de: ['rastreador'], nome: 'Outros sites com o mesmo ID', fonte: 'HackerTarget (50 por dia)', rapida: true, run: rastreadorSites },
  { id: 'dorks', de: ['dominio', 'pessoa', 'email', 'telefone', 'apelido', 'cnpj', 'organizacao'], nome: 'Buscas prontas (dorks) para abrir no navegador', fonte: 'local', run: dorks },
  { id: 'cpf', de: ['cpf'], nome: 'Validar e ver a região fiscal', fonte: 'local', rapida: true, run: cpf },
  { id: 'cep', de: ['cep'], nome: 'Endereço e coordenadas', fonte: 'BrasilAPI', rapida: true, run: cep },
  { id: 'coordenadas', de: ['local'], nome: 'Coordenadas e mapa', fonte: 'OpenStreetMap', rapida: true, run: coordenadas },
  { id: 'bitcoin', de: ['cripto'], nome: 'Saldo e carteiras ligadas', fonte: 'Blockstream', rapida: true, run: bitcoin },
  { id: 'cve', de: ['cve'], nome: 'Detalhes, CVSS e EPSS', fonte: 'MITRE + FIRST', rapida: true, run: cve },
  { id: 'texto-entidades', de: ['texto'], nome: 'Extrair entidades do texto', fonte: 'local', rapida: true, run: textoEntidades },
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
  const r = (await t.run(ctx, v, tipo === 'texto' ? completo : tipo)) || {};
  // cada entidade sai com o id (a forma canônica): é por ele que a página junta o que já está no grafo
  const entidades = unicos((r.entidades || []).filter((e) => e.valor && !(e.tipo === tipo && e.valor === v && !e.de)))
    .map((e) => ({ ...e, id: chave(e.tipo, e.valor), de: e.de ? { ...e.de, id: chave(e.de.tipo, e.de.valor) } : undefined }));
  const props = Object.fromEntries(Object.entries(r.props || {}).filter(([, x]) => x !== '' && x != null));
  return { entidades, props, aviso: r.aviso || '', alerta: !!r.alerta };
}
