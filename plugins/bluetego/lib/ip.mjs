// Bluetego: mais sobre um endereço IP. De qual nuvem, CDN ou robô ele é (as faixas oficiais publicadas pelos próprios
// provedores), em quais listas de bloqueio e ameaça está (IPsum, FireHOL, Emerging Threats, DNSBLs, Spamhaus ASN-DROP),
// o histórico de roteamento (quem já anunciou o bloco, desde quando, RPKI), os domínios que já apontaram para ele (DNS
// passivo), se é proxy, VPN ou Tor (proxycheck.io) e o certificado que ele serve na porta 443.
import tls from 'node:tls';
import { normalizar } from './entidades.mjs';
import { Falha, dns } from './transformacoes.mjs';

const ent = (tipo, valor, ligacao, extra = {}) => ({ tipo, valor: normalizar(tipo, valor), ligacao, ...extra });
const unicos = (lista) => { const v = new Set(); return lista.filter((e) => { const k = e.tipo + ':' + e.valor + ':' + (e.de ? e.de.valor : ''); if (!e.valor || v.has(k)) return false; v.add(k); return true; }); };
const data = (ms) => (Number.isFinite(Number(ms)) && Number(ms) ? new Date(Number(ms)).toISOString().slice(0, 10) : '');

// ---------- endereços como números (IPv4 e IPv6), para ver se um IP cai numa faixa ----------
export function ipNumero(ip) {
  const s = String(ip).trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) { const p = s.split('.').map(Number); if (p.some((x) => x > 255)) return null; return { v: 4, n: p.reduce((a, x) => (a << 8n) + BigInt(x), 0n) }; }
  if (!s.includes(':')) return null;
  let [a, b] = s.split('::');
  if (s.split('::').length > 2) return null;
  // IPv4 no fim (::ffff:1.2.3.4) vira dois grupos
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (v4) { const p = v4[1].split('.').map(Number); const g = `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`; if (b !== undefined && b.endsWith(v4[1])) b = b.slice(0, -v4[1].length) + g; else a = a.slice(0, -v4[1].length) + g; }
  const ga = a ? a.split(':') : [], gb = b !== undefined && b ? b.split(':') : [];
  const falta = 8 - ga.length - gb.length;
  if (b === undefined ? ga.length !== 8 : falta < 1) return null;
  const grupos = [...ga, ...Array(b === undefined ? 0 : falta).fill('0'), ...gb];
  if (grupos.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return { v: 6, n: grupos.reduce((x, g) => (x << 16n) + BigInt(parseInt(g, 16)), 0n) };
}
// uma faixa pronta para comparar: base e quantos bits do começo contam
export function faixa(cidr, info) {
  const [rede, b] = String(cidr).trim().split('/');
  const r = ipNumero(rede);
  if (!r) return null;
  const total = r.v === 4 ? 32 : 128, bits = b === undefined ? total : Number(b);
  if (!(bits >= 0 && bits <= total)) return null;
  const desloca = BigInt(total - bits);
  return { v: r.v, bits, base: r.n >> desloca, desloca, cidr: `${rede}/${bits}`, info };
}
// a faixa mais específica que contém o IP
export function procurarFaixa(faixas, ip) {
  const x = ipNumero(ip);
  if (!x) return null;
  let melhor = null;
  for (const f of faixas) if (f && f.v === x.v && x.n >> f.desloca === f.base && (!melhor || f.bits > melhor.bits)) melhor = f;
  return melhor;
}

// listas baixadas inteiras, guardadas por um dia
const CACHE = new Map();
async function guardado(chave, horas, baixar) {
  const x = CACHE.get(chave);
  if (x && Date.now() - x.em < horas * 3600000) return x.v;
  const v = await baixar();
  CACHE.set(chave, { em: Date.now(), v });
  return v;
}
const texto = async (ctx, url, opt = {}) => { const b = await ctx.binario(url, { max: opt.max || 12_000_000, timeout: opt.timeout || 60000 }); if (!b || !b.dados) throw new Error(`${new URL(url).host} não respondeu`); return b.dados.toString('utf8'); };
const json = async (ctx, url, opt) => JSON.parse(await texto(ctx, url, opt));
const linhasDeIp = (t) => t.split(/\r?\n/).map((l) => l.replace(/[#;].*$/, '').trim().split(/[\s,]+/)[0]).filter(Boolean);

// ---------- de qual nuvem, CDN ou robô é o IP ----------
const NUVENS = [
  // "AMAZON" é a categoria geral: o serviço específico (EC2, S3, CLOUDFRONT) vem da faixa mais específica
  ['AWS', async (ctx) => { const j = await json(ctx, 'https://ip-ranges.amazonaws.com/ip-ranges.json'); return [...j.prefixes.map((p) => faixa(p.ip_prefix, { servico: p.service, regiao: p.region })), ...j.ipv6_prefixes.map((p) => faixa(p.ipv6_prefix, { servico: p.service, regiao: p.region }))].map((f) => (f && f.info.servico === 'AMAZON' ? { ...f, bits: f.bits - 0.5 } : f)); }],
  ['Google Cloud', async (ctx) => (await json(ctx, 'https://www.gstatic.com/ipranges/cloud.json')).prefixes.map((p) => faixa(p.ipv4Prefix || p.ipv6Prefix, { servico: p.service, regiao: p.scope }))],
  ['Google', async (ctx) => (await json(ctx, 'https://www.gstatic.com/ipranges/goog.json')).prefixes.map((p) => faixa(p.ipv4Prefix || p.ipv6Prefix, { servico: 'serviço do próprio Google (não é Google Cloud)' }))],
  ['Googlebot', async (ctx) => { const out = []; for (const [arq, nome] of [['common-crawlers', 'Googlebot'], ['special-crawlers', 'robô especial do Google'], ['user-triggered-fetchers', 'busca disparada por usuário do Google']]) for (const p of (await json(ctx, `https://developers.google.com/static/crawling/ipranges/${arq}.json`)).prefixes) out.push(faixa(p.ipv4Prefix || p.ipv6Prefix, { robo: nome })); return out; }],
  ['Bingbot', async (ctx) => (await json(ctx, 'https://www.bing.com/toolbox/bingbot.json')).prefixes.map((p) => faixa(p.ipv4Prefix || p.ipv6Prefix, { robo: 'Bingbot' }))],
  ['GPTBot', async (ctx) => (await json(ctx, 'https://openai.com/gptbot.json')).prefixes.map((p) => faixa(p.ipv4Prefix || p.ipv6Prefix, { robo: 'GPTBot (OpenAI)' }))],
  ['Cloudflare', async (ctx) => [...linhasDeIp(await texto(ctx, 'https://www.cloudflare.com/ips-v4')), ...linhasDeIp(await texto(ctx, 'https://www.cloudflare.com/ips-v6'))].map((c) => faixa(c, { servico: 'CDN e proxy (o site real fica atrás)' }))],
  ['Fastly', async (ctx) => { const j = await json(ctx, 'https://api.fastly.com/public-ip-list'); return [...(j.addresses || []), ...(j.ipv6_addresses || [])].map((c) => faixa(c, { servico: 'CDN' })); }],
  ['Oracle Cloud', async (ctx) => (await json(ctx, 'https://docs.oracle.com/en-us/iaas/tools/public_ip_ranges.json')).regions.flatMap((r) => r.cidrs.map((c) => faixa(c.cidr, { regiao: r.region, servico: (c.tags || []).join(', ') })))],
  ['Microsoft Azure', async (ctx) => {
    // o arquivo muda de nome toda semana: o link está na página de download
    const pg = await texto(ctx, 'https://www.microsoft.com/en-us/download/details.aspx?id=56519', { max: 3_000_000 });
    const url = (pg.match(/https:\/\/download\.microsoft\.com\/[^"']+ServiceTags_Public_\d+\.json/) || [])[0];
    if (!url) throw new Error('link do Azure');
    return (await json(ctx, url)).values.flatMap((v) => (v.properties.addressPrefixes || []).map((c) => faixa(c, { servico: v.name, regiao: v.properties.region || '' })));
  }],
  ['DigitalOcean', async (ctx) => linhasDeCsv(await texto(ctx, 'https://www.digitalocean.com/geo/google.csv'))],
  ['Linode (Akamai)', async (ctx) => linhasDeCsv(await texto(ctx, 'https://geoip.linode.com/'))],
  ['Vultr', async (ctx) => (await json(ctx, 'https://geofeed.constant.com/?json')).subnets.map((s) => faixa(s.ip_prefix, { regiao: [s.city, s.region, s.alpha2code].filter(Boolean).join(', ') }))],
];
// geofeed (RFC 8805): prefixo,país,região,cidade,CEP
function linhasDeCsv(t) { return t.split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => { const [c, pais, reg, cid] = l.split(','); return faixa(c, { regiao: [cid, reg, pais].filter(Boolean).join(', ') }); }); }

export async function nuvem(ctx, ip) {
  const res = await Promise.allSettled(NUVENS.map(([nome, ler]) => guardado('nuvem:' + nome, 24, () => ler(ctx)).then((fs) => [nome, procurarFaixa(fs, ip)])));
  const achados = res.filter((r) => r.status === 'fulfilled' && r.value[1]).map((r) => r.value);
  const falhas = NUVENS.filter((_, i) => res[i].status === 'rejected').map(([n]) => n);
  if (!achados.length) return { entidades: [], props: { nuvem: 'não está nas faixas publicadas de nuvem, CDN ou robô', ...(falhas.length ? { 'não responderam': falhas.join(', ') } : {}) } };
  // "Google" (o geral) só vale se não for Google Cloud nem robô; robô verificado é a informação mais forte
  const robo = achados.find(([, f]) => f.info.robo);
  const prov = achados.filter(([n]) => n !== 'Googlebot' && n !== 'Bingbot' && n !== 'GPTBot').sort((a, b) => b[1].bits - a[1].bits).filter(([n], _, l) => !(n === 'Google' && l.some(([m]) => m === 'Google Cloud')))[0];
  const out = [], props = {};
  if (robo) { props['robô verificado'] = `${robo[1].info.robo} (a faixa oficial confirma: não é alguém se passando pelo robô)`; out.push(ent('organizacao', robo[0] === 'Googlebot' ? 'Google' : robo[0] === 'Bingbot' ? 'Microsoft' : 'OpenAI', `robô verificado: ${robo[1].info.robo}`)); }
  if (prov) {
    const [nome, f] = prov;
    props.nuvem = nome;
    if (f.info.servico) props.serviço = f.info.servico;
    if (f.info.regiao) props.região = f.info.regiao;
    props['faixa publicada'] = f.cidr;
    out.push(ent('organizacao', nome, `nuvem ou CDN${f.info.servico && f.info.servico.length < 40 ? `: ${f.info.servico}` : ''}${f.info.regiao ? ` (${f.info.regiao})` : ''}`));
  }
  return { entidades: unicos(out), props };
}

// ---------- listas de bloqueio e ameaça ----------
const DNSBLS = [['bl.blocklist.de', 'blocklist.de'], ['dnsbl-1.uceprotect.net', 'UCEPROTECT'], ['dnsbl.dronebl.org', 'DroneBL'], ['bl.mailspike.net', 'Mailspike'], ['all.s5h.net', 's5h'], ['bl.spamcop.net', 'SpamCop'], ['psbl.surriel.com', 'PSBL']];
export async function listasAmeaca(ctx, ip) {
  const x = ipNumero(ip);
  if (!x) throw new Falha('IP inválido.');
  const props = {}, achou = [], out = [];
  const tarefas = [];
  if (x.v === 4) {
    tarefas.push(['IPsum', async () => {
      const m = await guardado('ipsum', 24, async () => { const t = await texto(ctx, 'https://raw.githubusercontent.com/stamparm/ipsum/master/ipsum.txt'); const mp = new Map(); for (const l of t.split('\n')) { const [i, n] = l.split('\t'); if (n) mp.set(i.trim(), Number(n)); } return mp; });
      const n = m.get(ip);
      props['IPsum (listas que citam o IP)'] = n || 0;
      if (n >= 3) achou.push(`IPsum: ${n} listas`);
    }]);
    tarefas.push(['FireHOL nível 2', async () => {
      const fs = await guardado('firehol2', 24, async () => linhasDeIp(await texto(ctx, 'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level2.netset')).map((c) => faixa(c)));
      const f = procurarFaixa(fs, ip);
      props['FireHOL nível 2 (ataques nas últimas 48 h)'] = f ? `sim (${f.cidr})` : 'não';
      if (f) achou.push('FireHOL nível 2');
    }]);
    tarefas.push(['Emerging Threats', async () => {
      const s = await guardado('et', 24, async () => new Set(linhasDeIp(await texto(ctx, 'https://rules.emergingthreats.net/blockrules/compromised-ips.txt'))));
      props['Emerging Threats (comprometidos)'] = s.has(ip) ? 'sim' : 'não';
      if (s.has(ip)) achou.push('Emerging Threats');
    }]);
    const rev = ip.split('.').reverse().join('.');
    for (const [zona, nome] of DNSBLS) tarefas.push([nome, async () => {
      const a = (await dns(ctx, `${rev}.${zona}`, 'A')).filter((r) => /^127\./.test(r));
      // 127.255.255.x é o aviso de "resolvedor bloqueado", não listagem
      if (!a.length || a.every((r) => /^127\.255\./.test(r))) { props[`DNSBL ${nome}`] = 'não'; return; }
      const motivo = (await dns(ctx, `${rev}.${zona}`, 'TXT').catch(() => [])).map((t) => t.replace(/^"|"$/g, '')).join(' ').slice(0, 160);
      props[`DNSBL ${nome}`] = `listado${motivo ? `: ${motivo}` : ` (${a[0]})`}`;
      achou.push(nome);
    }]);
  }
  tarefas.push(['Spamhaus ASN-DROP', async () => {
    // o sistema autônomo do IP numa lista de redes inteiras controladas por criminosos
    const ni = await ctx.json(`https://stat.ripe.net/data/network-info/data.json?resource=${encodeURIComponent(ip)}&sourceapp=bluetego`, { timeout: 20000 });
    const asns = ((ni && ni.data && ni.data.asns) || []).map(Number);
    const lista = await guardado('asndrop', 24, async () => { const t = await texto(ctx, 'https://www.spamhaus.org/drop/asndrop.json'); const m = new Map(); for (const l of t.split('\n')) { try { const j = JSON.parse(l); if (j.asn) m.set(Number(j.asn), j); } catch {} } return m; });
    const hit = asns.map((a) => lista.get(a)).find(Boolean);
    props['Spamhaus ASN-DROP'] = hit ? `sim: AS${hit.asn} ${hit.asname || ''}` : 'não';
    if (hit) { achou.push('Spamhaus ASN-DROP'); out.push(ent('asn', `AS${hit.asn}`, 'sistema autônomo na Spamhaus ASN-DROP (rede de criminosos)', { alerta: true, props: { nome: hit.asname || '', país: hit.cc || '', domínio: hit.domain || '' } })); }
  }]);
  if (x.v === 6) tarefas.push(['Spamhaus DROP v6', async () => {
    const fs = await guardado('dropv6', 24, async () => (await texto(ctx, 'https://www.spamhaus.org/drop/drop_v6.json')).split('\n').map((l) => { try { const j = JSON.parse(l); return j.cidr ? faixa(j.cidr) : null; } catch { return null; } }).filter(Boolean));
    const f = procurarFaixa(fs, ip);
    props['Spamhaus DROP v6'] = f ? `sim (${f.cidr})` : 'não';
    if (f) achou.push('Spamhaus DROP v6');
  }]);
  const res = await Promise.allSettled(tarefas.map(([, fn]) => fn()));
  const falhas = tarefas.filter((_, i) => res[i].status === 'rejected').map(([n]) => n);
  if (falhas.length === tarefas.length) throw new Falha('Nenhuma lista respondeu agora; tente de novo daqui a pouco.', { status: 502 });
  if (falhas.length) props['não responderam'] = falhas.join(', ');
  props['listas de bloqueio'] = achou.length ? `em ${achou.length} ${achou.length === 1 ? 'lista' : 'listas'}: ${achou.join(', ')}` : 'em nenhuma lista de bloqueio ou ameaça';
  return { entidades: out, alerta: achou.length > 0, props };
}

// ---------- histórico de roteamento: quem já anunciou o bloco, desde quando, alocação e RPKI ----------
export async function ipHistorico(ctx, ip) {
  const R = (c, q) => ctx.json(`https://stat.ripe.net/data/${c}/data.json?${q}&sourceapp=bluetego`, { timeout: 30000 }).then((r) => (r && r.data) || {}).catch(() => null);
  const [hist, rir] = await Promise.all([R('routing-history', `resource=${encodeURIComponent(ip)}&min_peers=10`), R('rir', `resource=${encodeURIComponent(ip)}&lod=2`)]);
  if (!hist && !rir) throw new Falha('O RIPEstat não respondeu.', { status: 502 });
  const origens = [];
  for (const o of (hist && hist.by_origin) || []) for (const p of o.prefixes || []) {
    if (Number(String(p.prefix).split('/')[1]) < 8) continue; // /0 a /7 é ruído
    const t = (p.timelines || []).map((x) => [x.starttime, x.endtime]).sort();
    if (t.length) origens.push({ asn: String(o.origin), prefixo: p.prefix, de: t[0][0].slice(0, 10), ate: t[t.length - 1][1].slice(0, 10) });
  }
  origens.sort((a, b) => b.ate.localeCompare(a.ate));
  const atual = origens[0];
  const out = [], props = {};
  if (atual) { props['anunciado por'] = `AS${atual.asn} em ${atual.prefixo}`; props['anunciado desde'] = origens.filter((o) => o.asn === atual.asn && o.prefixo === atual.prefixo).map((o) => o.de).sort()[0]; }
  for (const o of origens.filter((o) => atual && o.asn !== atual.asn).slice(0, 5)) out.push(ent('asn', `AS${o.asn}`, 'já anunciou este bloco', { props: { prefixo: o.prefixo, de: o.de, até: o.ate } }));
  const outros = unicos(out);
  if (outros.length) props['outros donos do bloco'] = outros.length;
  const r = rir && (rir.rirs || [])[0];
  if (r) { props.RIR = r.rir || ''; props['bloco alocado em'] = String(r.registration || '').slice(0, 10); props['bloco registrado'] = r.resource || ''; props['país do registro'] = r.country || ''; }
  if (atual) {
    const v = await R('rpki-validation', `resource=AS${atual.asn}&prefix=${encodeURIComponent(atual.prefixo)}`);
    if (v && v.status) { props.RPKI = v.status === 'valid' ? 'válido (a rota bate com a assinatura do dono)' : v.status === 'invalid' ? 'INVÁLIDO: o AS que anuncia não é o autorizado (possível sequestro de rota)' : 'sem assinatura RPKI'; }
  }
  const alerta = /INVÁLIDO/.test(props.RPKI || '');
  return { entidades: outros, alerta, props };
}

// ---------- DNS passivo: os domínios que já apontaram para o IP (Mnemonic, com datas) e os de agora (ip.thc.org) ----------
export async function dnsPassivo(ctx, ip) {
  const max = Math.max(5, Math.min(60, Number(ctx.limite) || 30));
  const [mn, thc] = await Promise.all([
    ctx.json(`https://api.mnemonic.no/pdns/v3/${encodeURIComponent(ip)}?limit=${max}`, { timeout: 30000, nulo404: true }).catch(() => null),
    ctx.post('https://ip.thc.org/api/v1/lookup', { ip_address: ip, limit: max }).catch(() => null),
  ]);
  if (!mn && !thc) throw new Falha('O DNS passivo não respondeu agora.', { status: 502 });
  const vistos = new Map();
  for (const d of (mn && mn.data) || []) {
    const nome = String(d.query || '').replace(/\.$/, '');
    if (!nome || /in-addr\.arpa|ip6\.arpa/.test(nome)) continue;
    const v = vistos.get(nome) || {};
    vistos.set(nome, { ...v, de: data(d.firstSeenTimestamp), ate: data(d.lastSeenTimestamp), vezes: d.times || '' });
  }
  for (const d of (thc && thc.domains) || []) { const nome = String(d.domain || '').replace(/\.$/, ''); if (nome && !vistos.has(nome)) vistos.set(nome, { agora: true }); }
  const lista = [...vistos.entries()].sort((a, b) => String(b[1].ate || '9').localeCompare(String(a[1].ate || '9'))).slice(0, max);
  const out = lista.map(([nome, v]) => ent('dominio', nome, v.de ? 'já apontou para este IP (DNS passivo)' : 'aponta para este IP', { props: v.de ? { 'visto de': v.de, 'visto até': v.ate, vezes: v.vezes } : {} }));
  const total = (mn && mn.count) || 0, agora = (thc && thc.matching_records) || 0;
  return { entidades: unicos(out), props: { 'DNS passivo (Mnemonic)': total, 'domínios agora (ip.thc.org)': agora }, aviso: out.length ? (vistos.size > max ? `Mostrando ${max} de ${vistos.size} domínios.` : '') : 'Nenhum domínio conhecido para este IP.' };
}

// ---------- proxy, VPN, Tor, tipo de rede (proxycheck.io, 100 por dia sem chave) ----------
export async function proxyVpn(ctx, ip) {
  const r = await ctx.json(`https://proxycheck.io/v3/${encodeURIComponent(ip)}`, { timeout: 20000 });
  const x = r && r[ip];
  if (!x) throw new Falha((r && r.message) || 'O proxycheck.io não respondeu para este IP.', { status: 502 });
  const d = x.detections || {}, n = x.network || {}, loc = x.location || {};
  const marcas = ['proxy', 'vpn', 'tor', 'hosting', 'anonymous'].filter((k) => d[k] === true);
  const nomes = { proxy: 'proxy', vpn: 'VPN', tor: 'Tor', hosting: 'hospedagem', anonymous: 'anônimo' };
  const out = [];
  const op = x.operator && (x.operator.name || x.operator);
  if (op && typeof op === 'string') out.push(ent('organizacao', op, 'serviço de VPN ou proxy que usa este IP'));
  const ataques = x.attack_history && Object.entries(x.attack_history).filter(([, v]) => v).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(', ');
  return {
    entidades: out, alerta: Number(d.risk) >= 66,
    props: { 'proxy/VPN': marcas.length ? marcas.map((k) => nomes[k]).join(', ') : 'não detectado', 'risco de proxy (proxycheck)': d.risk != null ? `${d.risk} de 100` : '', 'tipo de rede': n.type || '', provedor: n.provider || n.organisation || '', ...(ataques ? { 'ataques vistos': ataques } : {}), ...(loc.city ? { 'cidade (aproximada)': loc.city } : {}) },
  };
}

// ---------- certificado que o IP serve na 443 (toca o alvo: transformação ativa) ----------
export function certificadoDoIp(ip, porta = 443) {
  return new Promise((ok, falha) => {
    // sem SNI: o servidor mostra o certificado padrão (o nome do serviço, a organização)
    const s = tls.connect({ host: ip, port: porta, rejectUnauthorized: false, timeout: 8000 }, () => {
      const c = s.getPeerCertificate() || {};
      ok({ cn: (c.subject && c.subject.CN) || '', org: (c.subject && c.subject.O) || '', emissor: (c.issuer && (c.issuer.O || c.issuer.CN)) || '', ate: c.valid_to || '', san: String(c.subjectaltname || '').split(',').map((x) => x.trim()).filter((x) => /^DNS:/.test(x)).map((x) => x.slice(4)), sha256: c.fingerprint256 || '', auto: !!(c.subject && c.issuer && c.subject.CN === c.issuer.CN && !c.issuer.O) });
      s.end();
    });
    s.on('timeout', () => { s.destroy(); falha(new Falha(`${ip} não respondeu na porta ${porta}.`, { status: 504 })); });
    s.on('error', (e) => falha(new Falha(`Sem TLS em ${ip}:${porta} (${e.code || e.message}).`, { status: 502 })));
  });
}
export async function certificadoIp(ctx, ip) {
  const c = await (ctx.tlsIp || certificadoDoIp)(ip);
  const nomes = [...new Set([c.cn, ...c.san].map((d) => String(d).replace(/^\*\./, '')).filter((d) => /\.[a-z]{2,}$/i.test(d)))].slice(0, 20);
  const out = nomes.map((d) => ent('dominio', d, 'no certificado servido pelo IP'));
  if (c.org) out.push(ent('organizacao', c.org, 'dona do certificado servido pelo IP'));
  return { entidades: unicos(out), props: { 'certificado (CN)': c.cn, emissor: c.emissor, 'válido até': c.ate ? new Date(c.ate).toISOString().slice(0, 10) : '', 'autoassinado': c.auto ? 'sim' : 'não', 'impressão digital (SHA-256)': c.sha256 } };
}
