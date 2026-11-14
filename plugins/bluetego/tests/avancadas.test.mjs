// Testes da 0.3 (sem rede): metadados de documentos, JavaScript, rastreadores, subdomínios de várias fontes,
// busca ampla de contas, e-mails prováveis, buscas prontas e o aprendizado. node tests/avancadas.test.mjs
import assert from 'node:assert/strict';
import { metadados, lerZip } from '../lib/metadados.mjs';
import { rodar, analisarJs, rastreadoresDe, padroesEmail, TRANSFORMACOES } from '../lib/transformacoes.mjs';
import { confere, procurar, sitesMaigret } from '../lib/maigret.mjs';
import { pensar } from '../lib/pistas.mjs';
import { detectar } from '../lib/entidades.mjs';

let ok = 0;
const pendentes = [];
const caso = (nome, fn) => pendentes.push(Promise.resolve().then(fn).then(() => ok++, (e) => { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }));
function falso(rotas, extra = {}) {
  const achar = (url) => { const k = Object.keys(rotas).filter((p) => url.startsWith(p)).sort((a, b) => b.length - a.length)[0]; return k ? rotas[k] : undefined; };
  return {
    limite: 40,
    async json(url, opt = {}) { const r = achar(url); if (r === undefined) throw new Error('sem rota: ' + url); if (r === 404) { if (opt.nulo404) return null; throw new Error('404'); } return typeof r === 'function' ? r(url) : r; },
    async pagina(url) { const r = achar(url); if (!r) throw new Error('sem rota: ' + url); return typeof r === 'function' ? r(url) : { headers: {}, url, ...r }; },
    async binario(url) { const r = achar(url); return r ? { status: 200, dados: r.dados } : { status: 404, dados: null }; },
    ...extra,
  };
}
// um ZIP de verdade (sem compressão) para fazer um docx de teste
function zip(arquivos) {
  const locais = [], centrais = [];
  let pos = 0;
  for (const [nome, texto] of Object.entries(arquivos)) {
    const n = Buffer.from(nome), d = Buffer.from(texto);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt32LE(d.length, 18); l.writeUInt32LE(d.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(pos, 42);
    locais.push(l, n, d); centrais.push(c, n);
    pos += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(centrais), fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(Object.keys(arquivos).length, 8); fim.writeUInt16LE(Object.keys(arquivos).length, 10); fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(pos, 16);
  return Buffer.concat([...locais, cd, fim]);
}
const DOCX = zip({
  'docProps/core.xml': '<cp:coreProperties><dc:creator>Ana Souza</dc:creator><cp:lastModifiedBy>jsilva</cp:lastModifiedBy><dc:title>Proposta comercial</dc:title><dcterms:created>2025-03-04T10:00:00Z</dcterms:created></cp:coreProperties>',
  'docProps/app.xml': '<Properties><Application>Microsoft Office Word</Application><AppVersion>16.0000</AppVersion><Company>Empresa X Ltda</Company></Properties>',
  'word/document.xml': '<w:document>contato: vendas@empresax.com.br</w:document>',
  'word/settings.xml': '<w:attachedTemplate r:id="C:\\Users\\jsilva\\AppData\\Roaming\\Microsoft\\Templates\\Normal.dotm"/>',
});
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Author (Carlos Lima) /Creator (Microsoft\\256 Word 2019) /Producer <FEFF004100630072006F006200610074> /CreationDate (D:20240102120000) /Title (Relat\\363rio anual) >>\nendobj\ntrailer << /Info 1 0 R >>\n%%EOF', 'latin1');

// ---------- metadados ----------
caso('docx: autor, último a editar, empresa, programa, usuário do Windows e e-mail', () => {
  assert.equal(lerZip(DOCX).size, 4);
  const m = metadados(DOCX, 'proposta.docx');
  assert.equal(m.autor, 'Ana Souza'); assert.equal(m.ultimoAutor, 'jsilva'); assert.equal(m.empresa, 'Empresa X Ltda');
  assert.equal(m.programa, 'Microsoft Office Word 16.0000'); assert.equal(m.tipo, 'Word'); assert.equal(m.criado, '2025-03-04');
  assert.deepEqual(m.usuarios, ['jsilva']); assert.deepEqual(m.emails, ['vendas@empresax.com.br']);
});
caso('PDF: literal com escapes, hexadecimal UTF-16 e datas', () => {
  const m = metadados(PDF, 'r.pdf');
  assert.equal(m.autor, 'Carlos Lima'); assert.equal(m.programa, 'Microsoft® Word 2019'); assert.equal(m.produtor, 'Acrobat');
  assert.equal(m.titulo, 'Relatório anual'); assert.equal(m.criado, '2024-01-02'); assert.equal(m.versao, '1.4');
});
caso('documentos: lê os achados e transforma autores e usuários em entidades, com alerta', async () => {
  const ctx = falso({
    'https://web.archive.org/cdx/': [['original', 'timestamp', 'mimetype', 'statuscode'], ['http://x.com.br/prop.docx', '20240101000000', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '200']],
    'https://x.com.br/': { status: 200, texto: '<a href="/files/rel.pdf">relatório</a>' },
    'https://x.com.br/prop.docx': { dados: DOCX }, 'https://x.com.br/files/rel.pdf': { dados: PDF },
  });
  const r = await rodar('documentos', 'dominio', 'x.com.br', ctx);
  const ids = r.entidades.map((e) => e.id);
  for (const id of ['pessoa:ana souza', 'apelido:jsilva', 'organizacao:empresa x ltda', 'email:vendas@empresax.com.br', 'pessoa:carlos lima']) assert.ok(ids.includes(id), id + ' em ' + ids);
  assert.ok(r.alerta); assert.match(r.props['usuários internos'], /jsilva/);
});

// ---------- JavaScript, rastreadores, buscas prontas ----------
caso('JavaScript: rotas de API, subdomínios e chaves expostas (mascaradas)', () => {
  const chave = 'AKIA' + 'IOSFODNN7EXAMPLE';
  const a = analisarJs(`fetch("/api/v2/users");const u="https://staging.x.com/a";const k="${chave}";`, 'x.com');
  assert.deepEqual(a.endpoints, ['/api/v2/users']); assert.deepEqual(a.hosts, ['staging.x.com']);
  assert.equal(a.segredos[0].nome, 'chave da AWS'); assert.ok(!a.segredos[0].valor.includes(chave), 'a chave não pode aparecer inteira');
});
caso('explorar o site: robots, .env exposto e cabeçalhos que faltam', async () => {
  const ctx = falso({
    'https://x.com/': { status: 200, url: 'https://x.com/', headers: { 'strict-transport-security': 'max-age=1' }, texto: '<script src="/app.js"></script>' },
    'https://x.com/robots.txt': { status: 200, texto: 'User-agent: *\nDisallow: /backup.zip\nDisallow: /busca$\nDisallow: /\n' },
    'https://x.com/sitemap.xml': { status: 404, texto: '' },
    'https://x.com/.git/HEAD': { status: 404, texto: '' }, 'https://x.com/.DS_Store': { status: 404, texto: '' },
    'https://x.com/.env': { status: 200, texto: 'DB_PASSWORD=segredo\nAPP_KEY=x' },
    'https://x.com/app.js': { status: 200, texto: 'fetch("/api/login")' },
  });
  const r = await rodar('explorar-site', 'dominio', 'x.com', ctx);
  const ids = r.entidades.map((e) => e.id);
  assert.ok(ids.includes('url:https://x.com/backup.zip')); assert.ok(!ids.some((i) => i.includes('busca$')));
  assert.ok(ids.includes('url:https://x.com/.env')); assert.ok(r.alerta);
  assert.match(r.props['cabeçalhos de segurança que faltam'], /CSP/); assert.ok(!/HSTS/.test(r.props['cabeçalhos de segurança que faltam']));
  assert.equal(r.props['rotas de API no JavaScript'], '/api/login');
});
caso('IDs de rastreamento: tipos, detecção e outros sites com o mesmo ID', async () => {
  const ids = rastreadoresDe(`gtag('config','G-ABC123DEF4'); _gaq.push(['_setAccount','UA-1234567-1']); google_ad_client="ca-pub-1234567890123456"; fbq('init', '123456789012345');`).map((x) => x.id).sort();
  assert.deepEqual(ids, ['123456789012345', 'G-ABC123DEF4', 'UA-1234567-1', 'ca-pub-1234567890123456']);
  assert.equal(detectar('UA-1234567-1'), 'rastreador'); assert.equal(detectar('ca-pub-1234567890123456'), 'rastreador');
  const r = await rodar('rastreador-sites', 'rastreador', 'UA-1234567-1', falso({ 'https://api.hackertarget.com/analyticslookup/': { status: 200, texto: 'irmao.com.br\noutro.com' } }));
  assert.deepEqual(r.entidades.map((e) => e.valor), ['irmao.com.br', 'outro.com']);
});
caso('buscas prontas: links do Google para o tipo', async () => {
  const r = await rodar('dorks', 'dominio', 'x.com', falso({}));
  assert.ok(r.entidades.length >= 8); assert.ok(r.entidades.every((e) => e.valor.startsWith('https://www.google.com/search?q=')));
  assert.ok(r.entidades.some((e) => /filetype%3Apdf/.test(e.valor)));
});

// ---------- subdomínios, e-mails, contas ----------
caso('subdomínios: junta as fontes, ordena pelas que mais confirmam e sobrevive a fonte caída', async () => {
  const ctx = falso({
    'https://crt.sh/': [{ name_value: 'a.x.com\nb.x.com', not_before: '2025-01-01' }],
    'https://api.certspotter.com/': [{ dns_names: ['a.x.com', 'c.x.com', '*.x.com', 'x.com'], not_before: '2025-02-01' }],
    'https://api.hackertarget.com/hostsearch/': { status: 200, texto: 'a.x.com,1.2.3.4\nd.x.com,1.2.3.5' },
  });
  const r = await rodar('subdominios', 'dominio', 'x.com', ctx);
  assert.deepEqual(r.entidades.map((e) => e.valor), ['a.x.com', 'c.x.com', 'b.x.com', 'd.x.com']);
  assert.equal(r.entidades[0].props['achado por'], 'crt.sh, certspotter, HackerTarget');
  assert.match(r.props['subdomínios por fonte'], /Wayback: fora do ar/);
});
caso('e-mails prováveis: padrões, domínio dos vizinhos e confirmação no Gravatar', async () => {
  assert.deepEqual(padroesEmail('Ana Maria de Souza').slice(0, 4), ['ana.souza', 'anasouza', 'asouza', 'ana']);
  const sem = await rodar('emails-provaveis', 'pessoa', 'Ana Souza', falso({}));
  assert.match(sem.aviso, /Ligue a pessoa a um domínio/);
  const crypto = await import('node:crypto');
  const h = crypto.createHash('sha256').update('asouza@x.com').digest('hex');
  const ctx = falso({ 'https://dns.google/resolve?name=x.com&type=MX': { Status: 0, Answer: [{ type: 15, data: '10 mx.x.com.' }] }, [`https://api.gravatar.com/v3/profiles/${h}`]: { display_name: 'Ana' }, 'https://api.gravatar.com/v3/profiles/': 404 }, { vizinhos: [{ tipo: 'dominio', valor: 'x.com' }] });
  const r = await rodar('emails-provaveis', 'pessoa', 'Ana Souza', ctx);
  assert.deepEqual(r.entidades.map((e) => e.valor), ['asouza@x.com']);
  assert.match(r.props['e-mails prováveis (não confirmados)'], /ana\.souza@x\.com/);
});
caso('busca ampla: regras do Maigret e reconferência com o nome que não existe', async () => {
  assert.ok(sitesMaigret().length > 2000);
  assert.ok(!sitesMaigret().some((s) => (s.t || []).includes('porn')), 'sites adultos ficam de fora');
  const bom = { n: 'Bom', u: 'https://bom.com/{username}', c: 'status_code', y: 'a', z: 'naoexiste' };
  const msg = { n: 'Msg', u: 'https://msg.com/u/{username}', c: 'message', a: ['Usuário não encontrado'], y: 'a', z: 'naoexiste' };
  const quebrado = { n: 'Quebrado', u: 'https://q.com/{username}', c: 'status_code', y: 'a', z: 'naoexiste' };
  const ctx = falso({
    'https://bom.com/fulano': { status: 200, texto: '' }, 'https://bom.com/naoexiste': { status: 404, texto: '' },
    'https://msg.com/u/fulano': { status: 200, texto: 'Perfil de fulano' }, 'https://msg.com/u/naoexiste': { status: 200, texto: 'Usuário não encontrado' },
    'https://q.com/': { status: 200, texto: 'qualquer coisa' },
  });
  assert.equal(await confere(ctx, msg, 'naoexiste'), false);
  // a lista real é trocada pela de teste
  const r = await procurar(ctx, 'fulano', { lista: [bom, msg, quebrado] });
  assert.deepEqual(r.achados.map((a) => a.site).sort(), ['Bom', 'Msg']);
  assert.deepEqual(r.descartados, ['Quebrado']);
});

// ---------- aprendizado ----------
caso('aprendizado: a pista sugere a transformação que mais rendeu e esquece a que nunca rende', () => {
  const grafo = { nos: [{ id: 'd', tipo: 'dominio', valor: 'x.com', props: {}, feitas: [] }], ligacoes: [] };
  const ap = { 'dominio|dns-ip': { n: 6, a: 0 }, 'dominio|certificado': { n: 3, a: 30 } };
  const p = pensar(grafo, TRANSFORMACOES, ap).find((x) => x.tipo === 'proximo');
  assert.equal(p.acao.t, 'certificado');
  assert.match(p.texto, /Costuma trazer 10 resultados/);
});
caso('catálogo: toda transformação tem nome, fonte e tipo de origem', () => { for (const t of TRANSFORMACOES) assert.ok(t.nome && t.fonte && t.de.length && typeof t.run === 'function', t.id); });

await Promise.all(pendentes);
console.log(`testes avançados do Bluetego: ${ok} de ${pendentes.length} passaram`);
