// Testes dos bugs corrigidos no motor do Bluetego (sem rede: fetch falso): node tests/bugs.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectar, normalizar, chave, extrair, ehIPv6, nomeReverso } from '../lib/entidades.mjs';
import { rodar, lerPagina, lerBusca, citaTermo, contaApelido } from '../lib/transformacoes.mjs';
import { metadados } from '../lib/metadados.mjs';

let ok = 0;
const pendentes = [];
const caso = (nome, fn) => pendentes.push(Promise.resolve().then(fn).then(() => ok++, (e) => { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }));
function falso(rotas, extra = {}) {
  const achar = (url) => { const k = Object.keys(rotas).filter((p) => url.startsWith(p)).sort((a, b) => b.length - a.length)[0]; return k ? rotas[k] : undefined; };
  return {
    limite: 40,
    async json(url, opt = {}) { const r = achar(url); if (r === undefined) throw new Error('sem rota: ' + url); if (r === 404) { if (opt.nulo404) return null; throw new Error('404'); } return typeof r === 'function' ? r(url) : r; },
    async pagina(url) { const r = achar(url); if (!r) throw new Error('sem rota: ' + url); return typeof r === 'function' ? r(url) : r; },
    async binario(url) { const r = achar(url); if (!r) return { status: 404, dados: null }; return r; },
    async cofre() { throw new Error('sem cofre'); },
    ...extra,
  };
}
const dnsResp = (tipo, dados) => ({ Status: 0, Answer: dados.map((data) => ({ type: { A: 1, NS: 2, CNAME: 5, PTR: 12, MX: 15, TXT: 16, AAAA: 28 }[tipo], data })) });

// ---------- extrair: falsos positivos ----------
caso('extrair: número de versão e OID não viram IP; IP no fim da frase continua', () => {
  const ips = extrair('versão 1.2.3.4.5, OID 1.3.6.1.4.1.311, build v10.0.0.1 e o servidor 8.8.8.8.').filter((e) => e.tipo === 'ip').map((e) => e.valor);
  assert.deepEqual(ips, ['8.8.8.8']);
  assert.deepEqual(extrair('rede 10.0.0.0/8 e 192.168.0.1').map((e) => e.valor), ['10.0.0.0/8', '192.168.0.1']);
});
caso('extrair: intervalo de anos depois de um número não vira telefone', () => {
  const t = extrair('Turma 11 2019-2020, contrato 51 2023-2024. Ligue (51) 3214-4000 ou (11) 2019-2020.').filter((e) => e.tipo === 'telefone').map((e) => e.valor);
  assert.deepEqual(t, ['+555132144000', '+551120192020']);
});
caso('extrair: URL com parênteses equilibrados fica inteira; parêntese da frase sai', () => {
  const u = extrair('veja https://en.wikipedia.org/wiki/Foo_(bar) e (https://x.com/a).').filter((e) => e.tipo === 'url').map((e) => e.valor);
  assert.deepEqual(u, ['https://en.wikipedia.org/wiki/Foo_(bar)', 'https://x.com/a']);
});

// ---------- normalização: a mesma entidade com uma chave só ----------
caso('IPv6: forma canônica (zeros à esquerda, maiúsculas, maior sequência de zeros)', () => {
  assert.equal(normalizar('ip', '2001:0DB8:0:0::1'), '2001:db8::1');
  assert.equal(chave('ip', '2001:0db8:0000:0000:0000:0000:0000:0001'), chave('ip', '2001:db8::1'));
  assert.equal(normalizar('ip', '2001:db8:0:0:1:0:0:1'), '2001:db8::1:0:0:1');
  assert.equal(normalizar('ip', '0:0:0:0:0:0:0:1'), '::1');
  assert.equal(normalizar('ip', '2001:db8:0:1:1:1:1:1'), '2001:db8:0:1:1:1:1:1');
  assert.equal(normalizar('rede', '2001:0DB8::/32'), '2001:db8::/32');
  assert.equal(nomeReverso(normalizar('ip', '2001:0DB8::1')), nomeReverso('2001:db8::1'));
});
caso('IPv6: dois-pontos sobrando é inválido; IPv4 embutido conta como dois grupos', () => {
  for (const v of [':::', '1:2:3:4:5:6:7:8:', ':1:2:3:4:5:6:7:8', '1.2.3.4::1']) assert.ok(!ehIPv6(v), v);
  for (const v of ['::', '::ffff:1.2.3.4', '1:2:3:4:5:6:1.2.3.4', '1::']) assert.ok(ehIPv6(v), v);
});
caso('telefone: "+55 (051)" e "+55 51" viram o mesmo número', () => {
  assert.equal(normalizar('telefone', '+55 (051) 99999-1234'), '+5551999991234');
  assert.equal(normalizar('telefone', '+55 (051) 3214-4000'), '+555132144000');
  assert.equal(detectar('+55 (051) 99999-1234'), 'telefone');
});

// ---------- exceções que derrubavam a transformação ----------
caso('metadados: PDF cortado depois de uma barra invertida e arquivo minúsculo não lançam erro', () => {
  const b = String.fromCharCode(92);
  assert.equal(metadados(Buffer.from('%PDF-1.4 /Author (Ana' + b + 'x', 'latin1')).autor, 'Ana');
  assert.equal(metadados(Buffer.from('%PDF-1.4 /Author (Ana' + b + '1', 'latin1')).autor, 'Ana');
  assert.equal(metadados(Buffer.from('PK')), null);
  assert.equal(metadados(Buffer.from([1])), null);
});
caso('"%" malformado na página, na busca e no link do perfil não lança URIError', () => {
  const p = lerPagina('<a href="mailto:ana%ZZ@ex.com">x</a><a href="tel:+55%2051%2032144000">t</a><a href="tel:%E0%A4%A">r</a>', 'https://ex.com/');
  assert.deepEqual(p.telefones, ['+55 51 32144000']);
  assert.equal(p.emails.length, 1);
  const res = lerBusca('<div class="result results_links"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fa.com%2F%FF&rut=1">ruim</a></div><div class="result results_links"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fb.com%2Fok&rut=1">bom</a></div>');
  assert.deepEqual(res.map((r) => r.url), ['https://b.com/ok']);
  assert.equal(citaTermo({ titulo: 'x', trecho: '', url: 'https://x.com/%FF/martindevbr' }, 'apelido', 'martindevbr'), true);
  assert.equal(contaApelido({}, 'https://x.com/%E0%A4%A').entidades.length, 1);
});
caso('documentos: arquivo corrompido não derruba os outros; outro domínio com o mesmo final não entra', async () => {
  const pdf = Buffer.from('%PDF-1.4\n/Author (Ana Souza)\n', 'latin1');
  const b = String.fromCharCode(92);
  const vistos = [];
  const ctx = falso({
    'https://web.archive.org/cdx': [['original', 'timestamp', 'mimetype', 'statuscode']],
    'https://ex.com/': { status: 200, url: 'https://ex.com/', headers: {}, texto: '<a href="/a.pdf">a</a><a href="/b.pdf">b</a><a href="https://outroex.com/c.pdf">c</a>' },
  }, { async binario(url) { vistos.push(url); return { status: 200, dados: url.endsWith('a.pdf') ? Buffer.from('%PDF-1.4 /Author (X' + b + 'y', 'latin1') : pdf }; } });
  const r = await rodar('documentos', 'dominio', 'ex.com', ctx);
  assert.ok(!vistos.includes('https://outroex.com/c.pdf'), 'baixou documento de outro domínio');
  assert.ok(r.entidades.some((e) => e.tipo === 'pessoa' && e.valor === 'Ana Souza'));
});
caso('infostealer: URL de outro domínio com o mesmo final não entra', async () => {
  const ctx = falso({ 'https://cavalier.hudsonrock.com/': { total: 2, employees: 1, data: { employees_urls: [{ url: 'https://login.ex.com/', occurrence: 3 }, { url: 'https://naoex.com/login', occurrence: 9 }] } } });
  const r = await rodar('infostealer', 'dominio', 'ex.com', ctx);
  assert.deepEqual(r.entidades.map((e) => e.valor), ['https://login.ex.com/']);
});

// ---------- propriedades sem valor ----------
caso('geo sem coordenadas: nada de latitude undefined nem mapa vazio', async () => {
  const ctx = falso({ 'https://ipwho.is/': { success: true, city: 'Porto Alegre', country: 'Brasil', connection: {} } });
  const r = await rodar('geo', 'ip', '8.8.8.8', ctx);
  const local = r.entidades.find((e) => e.tipo === 'local');
  assert.deepEqual(local.props, {});
});
caso('CVE com EPSS sem número não mostra "NaN%"', async () => {
  const ctx = falso({ 'https://cveawg.mitre.org/': { containers: { cna: {} } }, 'https://api.first.org/': { data: [{ cve: 'CVE-2024-1' }] } });
  const r = await rodar('cve', 'cve', 'CVE-2024-0001', ctx);
  assert.ok(!('EPSS' in r.props));
});
caso('TCU e Câmara: UF que falta não vira "undefined" no local', async () => {
  const ctx = falso({ 'https://contas.tcu.gov.br/': { items: [{ nome: 'ANA MARIA SOUZA', municipio: 'Canoas', data_final: '2030-01-01' }] } });
  const r = await rodar('tcu', 'pessoa', 'Ana Maria Souza', ctx);
  assert.ok(r.entidades.some((e) => e.tipo === 'local' && e.valor === 'Canoas'));
  assert.ok(!r.entidades.some((e) => /undefined/.test(e.valor)));
});
caso('rodar: props de entidade com undefined ou NaN saem', async () => {
  const ctx = falso({ 'https://api.launchpad.net/1.0/people': { entries: [{ name: 'ana', display_name: 'Ana Souza' }] }, 'https://api.launchpad.net/1.0/~ana': { entries: [] } });
  const r = await rodar('launchpad', 'apelido', 'ana', ctx);
  const conta = r.entidades.find((e) => e.tipo === 'conta');
  assert.ok(conta && !('karma' in conta.props), JSON.stringify(conta && conta.props));
  assert.ok(Object.values(conta.props).every((v) => v != null && !Number.isNaN(v)));
});
caso('rodar: URL e e-mail malformados dão um aviso claro (antes: "Invalid URL" e consulta com "undefined")', async () => {
  await assert.rejects(rodar('url-dominio', 'url', 'não é url', falso({})), /não é um endereço http/);
  await assert.rejects(rodar('url-dominio', 'url', 'ftp://ex.com/a', falso({})), /não é um endereço http/);
  await assert.rejects(rodar('email-dominio', 'email', 'semarroba', falso({})), /não parece um e-mail/);
});
caso('SPF: include com macro e ip4 malformado não viram entidade', async () => {
  const ctx = falso({ 'https://dns.google/resolve?name=ex.com&type=TXT': dnsResp('TXT', ['"v=spf1 include:_spf.google.com include:%{i}._spf.ex.com ip4:1.2.3.4 ip4:10.0.0.0/8 ip4:999.1 -all"']), 'https://dns.google/resolve?name=_dmarc': { Status: 3 } });
  const r = await rodar('dns-txt', 'dominio', 'ex.com', ctx);
  assert.deepEqual(r.entidades.map((e) => e.id).sort(), ['dominio:_spf.google.com', 'ip:1.2.3.4', 'rede:10.0.0.0/8']);
});
caso('seguir redirecionamentos: Location inválido encerra a cadeia sem erro', async () => {
  const ctx = falso({ 'https://ex.com/': { status: 302, url: 'https://ex.com/', headers: { location: 'http://[quebrado' }, texto: '' } });
  const r = await rodar('url-seguir', 'url', 'https://ex.com/', ctx);
  assert.equal(r.props['status HTTP'], 302);
});

// ---------- servidor: cache, disjuntor e corpos ----------
// um SDK falso (só o que o server.mjs usa), para chamar as rotas sem a IDE
async function servidor() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bluetego-sdk-'));
  fs.writeFileSync(path.join(dir, 'bluescreen.js'), `class Reply { constructor(status, body) { this.status = status; this.body = body; } }
class Plugin { constructor() { this.routes = new Map(); globalThis.__btg = this; }
  route(n, fn) { this.routes.set(n, fn); } run() {} async settings() { return {}; } get vault() { return { status: async () => [] }; }
  async fetch() { throw new Error('sem IDE'); } static reply(s, b) { return new Reply(s, b); } }
module.exports = { Plugin };`);
  process.env.BLUESCREEN_SDK = dir;
  await import('../server.mjs');
  const p = globalThis.__btg;
  return (nome, corpo) => p.routes.get('bluetego/' + nome)({ method: 'POST', json: () => corpo, query: {}, remote: false });
}
const chamar = await servidor();
const fetchOriginal = globalThis.fetch;
// os casos do servidor trocam o fetch global: rodam um depois do outro
let filaServidor = Promise.resolve();
const casoServidor = (nome, fn) => caso(nome, () => (filaServidor = filaServidor.then(fn, fn).finally(() => { globalThis.fetch = fetchOriginal; })));

casoServidor('servidor: o cache não mistura dois textos que começam igual', async () => {
  const comeco = 'texto longo '.repeat(10) + '…';
  const a = await chamar('transformar', { t: 'texto-entidades', tipo: 'texto', valor: comeco, completo: comeco + ' contato ana@empresa.com' });
  const b = await chamar('transformar', { t: 'texto-entidades', tipo: 'texto', valor: comeco, completo: comeco + ' contato bia@empresa.com' });
  assert.ok(a.entidades.some((e) => e.valor === 'ana@empresa.com'));
  assert.ok(b.entidades.some((e) => e.valor === 'bia@empresa.com'), 'devolveu o resultado do outro texto (cache)');
  assert.ok(!b.guardada);
});
casoServidor('servidor: erro que não é de conexão não liga o disjuntor; tempo esgotado liga', async () => {
  let pedidos = 0;
  globalThis.fetch = async () => { pedidos++; throw new TypeError('Headers.append: "x" is an invalid header value.'); };
  const r1 = await chamar('transformar', { t: 'geo', tipo: 'ip', valor: '1.1.1.1', deNovo: true });
  const r2 = await chamar('transformar', { t: 'geo', tipo: 'ip', valor: '1.1.1.1', deNovo: true });
  assert.equal(pedidos, 2, 'o site foi marcado como fora por um erro do próprio pedido');
  assert.equal(r1.status, 502);
  assert.ok(!/pulado/.test(r2.body.error));
  pedidos = 0;
  globalThis.fetch = async () => { pedidos++; throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) }); };
  await chamar('transformar', { t: 'internetdb', tipo: 'ip', valor: '1.1.1.1', deNovo: true });
  const r4 = await chamar('transformar', { t: 'internetdb', tipo: 'ip', valor: '1.1.1.1', deNovo: true });
  assert.equal(pedidos, 1);
  assert.match(r4.body.error, /pulado/);
});
casoServidor('servidor: resposta de erro tem o corpo descartado e JSON inválido no POST vira Falha', async () => {
  const respostas = [];
  globalThis.fetch = async (url) => { const r = new Response(String(url).includes('icij') ? '<html>' : '{"erro":1}', { status: String(url).includes('icij') ? 200 : 500, headers: { 'content-type': 'application/json' } }); respostas.push(r); return r; };
  const r = await chamar('transformar', { t: 'peeringdb', tipo: 'asn', valor: 'AS64500', deNovo: true });
  assert.equal(r.status, 502);
  await new Promise((ok) => setTimeout(ok, 10));
  assert.ok(respostas[0].bodyUsed, 'o corpo da resposta com erro ficou aberto');
  const o = await chamar('transformar', { t: 'offshore', tipo: 'pessoa', valor: 'Ana Maria Souza', deNovo: true });
  assert.equal(o.status, 502);
  assert.match(o.body.error, /não devolveu JSON/);
});

await Promise.all(pendentes);
console.log(`testes dos bugs corrigidos do Bluetego: ${ok} de ${pendentes.length} passaram`);
