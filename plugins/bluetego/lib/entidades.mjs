// Bluetego: os tipos de entidade, como reconhecer cada um num valor solto, a forma canônica (para duas entidades
// iguais virarem uma só no grafo) e a extração de entidades de um texto qualquer. Sem rede: tudo aqui é testável.

// cor e ícone (caminho SVG 24x24, traço) de cada tipo; a página desenha o ícone no canvas com Path2D
export const TIPOS = {
  dominio: { nome: 'Domínio', cor: '#4f8cff', icone: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9M12 3C9.5 5.5 8.5 8.5 8.5 12s1 6.5 3.5 9' },
  ip: { nome: 'Endereço IP', cor: '#1fa39a', icone: 'M4 5h16v6H4zM4 13h16v6H4zM7.5 8h.01M7.5 16h.01M11 8h5M11 16h5' },
  rede: { nome: 'Rede (CIDR)', cor: '#12806f', icone: 'M12 4v5M12 9l-6 5M12 9l6 5M6 14v1M18 14v1M4 16h4v4H4zM16 16h4v4h-4zM10 2h4v4h-4z' },
  asn: { nome: 'Sistema autônomo', cor: '#7a5af8', icone: 'M5 6a2 2 0 1 0 0 .1M19 6a2 2 0 1 0 0 .1M12 18a2 2 0 1 0 0 .1M7 6h10M6 8l5 8M18 8l-5 8' },
  email: { nome: 'E-mail', cor: '#e8a33d', icone: 'M4 6h16v12H4zM4 7l8 6 8-6' },
  url: { nome: 'URL', cor: '#3fa7d6', icone: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' },
  pessoa: { nome: 'Pessoa', cor: '#e5534b', icone: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM5 20c1-4 4-6 7-6s6 2 7 6' },
  apelido: { nome: 'Apelido', cor: '#d9598c', icone: 'M16 12a4 4 0 1 1-1.2-2.8M16 8v5.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1' },
  conta: { nome: 'Conta on-line', cor: '#2d9cdb', icone: 'M4 5h16v14H4zM9 10a2 2 0 1 0 0 .1M6.5 16c.5-2 1.5-3 2.5-3s2 1 2.5 3M14 10h3.5M14 13.5h3.5' },
  organizacao: { nome: 'Organização', cor: '#8a63d2', icone: 'M4 20V6l8-3 8 3v14M4 20h16M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 20v-3h4v3' },
  telefone: { nome: 'Telefone', cor: '#4caf50', icone: 'M6 4h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.5 1.5A16 16 0 0 1 4.5 5.5 1.5 1.5 0 0 1 6 4z' },
  local: { nome: 'Local', cor: '#c97a3a', icone: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z' },
  porta: { nome: 'Porta aberta', cor: '#607d8b', icone: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3' },
  cve: { nome: 'Vulnerabilidade', cor: '#d93838', icone: 'M12 3l9 16H3zM12 10v4M12 17h.01' },
  hash: { nome: 'Hash de arquivo', cor: '#8d6e63', icone: 'M9 4 7 20M17 4l-2 16M4 9h17M3 15h17' },
  texto: { nome: 'Texto', cor: '#8a8f98', icone: 'M5 6h14M5 10h14M5 14h9M5 18h6' },
};
export const tipoValido = (t) => Object.hasOwn(TIPOS, t);

// extensões que parecem TLD num texto mas são nome de arquivo (app.js, foto.png): não viram domínio
const NAO_TLD = new Set(['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'json', 'css', 'scss', 'html', 'htm', 'xml', 'yml', 'yaml', 'md', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'pdf', 'zip', 'gz', 'tar', 'rar', 'exe', 'dll', 'jar', 'war', 'class', 'java', 'py', 'rs', 'go', 'rb', 'php', 'cs', 'cpp', 'h', 'hpp', 'c', 'sh', 'ps1', 'bat', 'cmd', 'log', 'lock', 'toml', 'ini', 'cfg', 'conf', 'env', 'map', 'min', 'bak', 'tmp', 'old', 'mp3', 'mp4', 'wav', 'csv', 'xls', 'xlsx', 'doc', 'docx', 'ppt', 'pptx', 'sql', 'db', 'wasm', 'vue', 'svelte', 'kt', 'swift', 'gradle', 'properties', 'xsd', 'wsdl', 'jsp', 'aspx', 'local', 'internal', 'lan', 'test', 'example', 'invalid', 'localhost']);

const RE = {
  cve: /^CVE-\d{4}-\d{4,}$/i,
  email: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}$/,
  url: /^https?:\/\/[^\s/$.?#][^\s]*$/i,
  ipv4: /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/,
  cidr4: /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}\/(3[0-2]|[12]?\d)$/,
  asn: /^AS\s?\d{1,10}$/i,
  hash: /^(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})$/i,
  telefone: /^\+?[\d\s().-]{8,20}$/,
  dominio: /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\.?$/i,
  apelido: /^@[A-Za-z0-9_.-]{2,39}$/,
};
export function ehIPv6(v) {
  const s = String(v).trim();
  if (!/^[0-9a-f:.]+$/i.test(s) || !s.includes(':')) return false;
  const duplo = s.split('::');
  if (duplo.length > 2) return false;
  const grupos = s.replace('::', ':x:').split(':').filter((g) => g && g !== 'x');
  if (grupos.some((g) => !/^[0-9a-f]{1,4}$/i.test(g) && !RE.ipv4.test(g))) return false;
  return duplo.length === 2 ? grupos.length < 8 : grupos.length === 8;
}
export const ehIP = (v) => RE.ipv4.test(String(v).trim()) || ehIPv6(v);
const tldBom = (d) => { const t = d.replace(/\.$/, '').split('.').pop().toLowerCase(); return !NAO_TLD.has(t) && !/^\d+$/.test(t); };

// adivinha o tipo de um valor digitado ou colado
export function detectar(valor) {
  const v = String(valor ?? '').trim();
  if (!v) return 'texto';
  if (RE.cve.test(v)) return 'cve';
  if (RE.email.test(v)) return 'email';
  if (RE.url.test(v)) return 'url';
  if (ehIP(v)) return 'ip';
  if (RE.cidr4.test(v) || (/\/\d{1,3}$/.test(v) && ehIPv6(v.split('/')[0]))) return 'rede';
  if (RE.asn.test(v)) return 'asn';
  if (RE.hash.test(v)) return 'hash';
  if (RE.dominio.test(v) && tldBom(v)) return 'dominio';
  if (RE.apelido.test(v)) return 'apelido';
  if (RE.telefone.test(v) && v.replace(/\D/g, '').length >= 8) return 'telefone';
  if (/^[A-Za-zÀ-ÿ'-]+(\s+[A-Za-zÀ-ÿ'-]+){1,4}$/.test(v)) return 'pessoa';
  if (/^[A-Za-z0-9_.-]{3,39}$/.test(v)) return 'apelido';
  return 'texto';
}

// forma canônica: é ela que decide se duas entidades são a mesma
export function normalizar(tipo, valor) {
  let v = String(valor ?? '').trim();
  switch (tipo) {
    case 'dominio': return v.toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    case 'email': return v.toLowerCase();
    case 'hash': return v.toLowerCase();
    case 'cve': return v.toUpperCase();
    case 'asn': return 'AS' + v.replace(/^AS\s?/i, '');
    case 'ip': return ehIPv6(v) ? v.toLowerCase() : v;
    case 'rede': return v.toLowerCase();
    case 'apelido': return v.replace(/^@/, '');
    case 'telefone': { const d = v.replace(/[^\d+]/g, ''); return d.startsWith('+') ? '+' + d.slice(1).replace(/\+/g, '') : d; }
    case 'url': try { const u = new URL(v); u.hash = ''; return u.href; } catch { return v; }
    default: return v.replace(/\s+/g, ' ');
  }
}
export const chave = (tipo, valor) => tipo + ':' + (['pessoa', 'organizacao', 'local', 'texto', 'apelido'].includes(tipo) ? normalizar(tipo, valor).toLowerCase() : normalizar(tipo, valor));

// tira entidades de um texto: log, e-mail, código, relatório. Devolve [{ tipo, valor }] sem repetidos
export function extrair(texto, limite = 500) {
  const s = String(texto ?? '');
  const out = [], vistos = new Set();
  const por = (tipo, valor) => {
    const v = normalizar(tipo, valor), k = chave(tipo, v);
    if (!v || vistos.has(k) || out.length >= limite) return;
    vistos.add(k); out.push({ tipo, valor: v });
  };
  const limpar = (u) => u.replace(/[),.;:'"\]>}]+$/, '');
  for (const m of s.matchAll(/\bhttps?:\/\/[^\s<>"'`]+/gi)) por('url', limpar(m[0]));
  for (const m of s.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g)) if (tldBom(m[0].split('@')[1])) por('email', m[0]);
  for (const m of s.matchAll(/\bCVE-\d{4}-\d{4,}\b/gi)) por('cve', m[0]);
  for (const m of s.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g)) {
    if (m[0].includes('/')) { if (RE.cidr4.test(m[0])) por('rede', m[0]); }
    else if (RE.ipv4.test(m[0])) por('ip', m[0]);
  }
  for (const m of s.matchAll(/(?<![\w:])(?:[0-9a-f]{1,4}:){2,7}(?::|[0-9a-f]{1,4})(?![\w:])|(?<![\w:])(?:[0-9a-f]{1,4}:){1,6}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,5})?(?![\w:])/gi)) if (ehIPv6(m[0]) && /[a-f\d]{2}/i.test(m[0])) por('ip', m[0]);
  for (const m of s.matchAll(/\bAS\d{2,10}\b/g)) por('asn', m[0]);
  for (const m of s.matchAll(/\b[a-f0-9]{64}\b|\b[a-f0-9]{40}\b|\b[a-f0-9]{32}\b/gi)) if (/[a-f]/i.test(m[0]) && /\d/.test(m[0])) por('hash', m[0]);
  // domínios: fora de e-mail (o domínio do e-mail sai do próprio e-mail, pela transformação)
  for (const m of s.matchAll(/(?<![@\w.-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\b(?![\w@-])/gi)) if (tldBom(m[0]) && !RE.ipv4.test(m[0]) && /[a-z]/i.test(m[0].split('.').slice(-2)[0])) por('dominio', m[0]);
  for (const m of s.matchAll(/(?<![\w/])\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{3,5}[\s.-]?\d{3,5}\b/g)) por('telefone', m[0]);
  return out;
}

// ---------- telefone: país pelo DDI e, no Brasil, estado pelo DDD ----------
const DDI = { 1: 'Estados Unidos / Canadá', 7: 'Rússia / Cazaquistão', 20: 'Egito', 27: 'África do Sul', 30: 'Grécia', 31: 'Países Baixos', 32: 'Bélgica', 33: 'França', 34: 'Espanha', 36: 'Hungria', 39: 'Itália', 40: 'Romênia', 41: 'Suíça', 43: 'Áustria', 44: 'Reino Unido', 45: 'Dinamarca', 46: 'Suécia', 47: 'Noruega', 48: 'Polônia', 49: 'Alemanha', 51: 'Peru', 52: 'México', 53: 'Cuba', 54: 'Argentina', 55: 'Brasil', 56: 'Chile', 57: 'Colômbia', 58: 'Venezuela', 60: 'Malásia', 61: 'Austrália', 62: 'Indonésia', 63: 'Filipinas', 64: 'Nova Zelândia', 65: 'Singapura', 66: 'Tailândia', 81: 'Japão', 82: 'Coreia do Sul', 84: 'Vietnã', 86: 'China', 90: 'Turquia', 91: 'Índia', 92: 'Paquistão', 93: 'Afeganistão', 94: 'Sri Lanka', 98: 'Irã', 212: 'Marrocos', 234: 'Nigéria', 244: 'Angola', 258: 'Moçambique', 351: 'Portugal', 352: 'Luxemburgo', 353: 'Irlanda', 354: 'Islândia', 358: 'Finlândia', 380: 'Ucrânia', 420: 'Tchéquia', 502: 'Guatemala', 506: 'Costa Rica', 507: 'Panamá', 591: 'Bolívia', 593: 'Equador', 595: 'Paraguai', 598: 'Uruguai', 852: 'Hong Kong', 886: 'Taiwan', 971: 'Emirados Árabes', 972: 'Israel', 966: 'Arábia Saudita' };
const DDD = { SP: [11, 12, 13, 14, 15, 16, 17, 18, 19], RJ: [21, 22, 24], ES: [27, 28], MG: [31, 32, 33, 34, 35, 37, 38], PR: [41, 42, 43, 44, 45, 46], SC: [47, 48, 49], RS: [51, 53, 54, 55], DF: [61], GO: [62, 64], TO: [63], MT: [65, 66], MS: [67], AC: [68], RO: [69], BA: [71, 73, 74, 75, 77], SE: [79], PE: [81, 87], AL: [82], PB: [83], RN: [84], CE: [85, 88], PI: [86, 89], PA: [91, 93, 94], AM: [92, 97], RR: [95], AP: [96], MA: [98, 99] };
const UF = { SP: 'São Paulo', RJ: 'Rio de Janeiro', ES: 'Espírito Santo', MG: 'Minas Gerais', PR: 'Paraná', SC: 'Santa Catarina', RS: 'Rio Grande do Sul', DF: 'Distrito Federal', GO: 'Goiás', TO: 'Tocantins', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', AC: 'Acre', RO: 'Rondônia', BA: 'Bahia', SE: 'Sergipe', PE: 'Pernambuco', AL: 'Alagoas', PB: 'Paraíba', RN: 'Rio Grande do Norte', CE: 'Ceará', PI: 'Piauí', PA: 'Pará', AM: 'Amazonas', RR: 'Roraima', AP: 'Amapá', MA: 'Maranhão' };
export function telefoneInfo(valor) {
  const n = normalizar('telefone', valor);
  if (!n.startsWith('+')) return null;
  const d = n.slice(1);
  const ddi = [3, 2, 1].map((k) => d.slice(0, k)).find((p) => DDI[p]);
  if (!ddi) return null;
  const info = { ddi: '+' + ddi, pais: DDI[ddi] };
  if (ddi === '55') {
    const ddd = Number(d.slice(2, 4));
    const uf = Object.keys(DDD).find((u) => DDD[u].includes(ddd));
    if (uf) Object.assign(info, { ddd, uf, estado: UF[uf], celular: d.length === 13 && d[4] === '9' });
  }
  return info;
}

// IP reverso para a consulta PTR: 1.2.3.4 -> 4.3.2.1.in-addr.arpa; IPv6 vira os nibbles ao contrário
export function nomeReverso(ip) {
  const s = String(ip).trim();
  if (RE.ipv4.test(s)) return s.split('.').reverse().join('.') + '.in-addr.arpa';
  if (!ehIPv6(s)) throw new Error('não é um endereço IP: ' + s);
  const [a, b = ''] = s.split('::');
  const pa = a ? a.split(':') : [], pb = b ? b.split(':') : [];
  const grupos = s.includes('::') ? [...pa, ...Array(8 - pa.length - pb.length).fill('0'), ...pb] : pa;
  return grupos.map((g) => g.padStart(4, '0')).join('').split('').reverse().join('.') + '.ip6.arpa';
}

// apelidos prováveis a partir de um nome (para procurar contas): "Ana Maria Souza" -> anasouza, ana.souza, asouza...
export function apelidosDeNome(nome) {
  const p = String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((x) => x.length > 1 && !['da', 'de', 'do', 'das', 'dos', 'e'].includes(x));
  if (p.length < 2) return p.length ? [p[0]] : [];
  const [pri, ult] = [p[0], p[p.length - 1]];
  return [...new Set([pri + ult, pri + '.' + ult, pri + '_' + ult, pri[0] + ult, pri + ult[0], ult + pri, pri + '-' + ult, p.slice(0, -1).map((x) => x[0]).join('') + ult])];
}
