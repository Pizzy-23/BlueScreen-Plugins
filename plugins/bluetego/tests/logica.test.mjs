// Testes da lógica do Bluetego (sem rede: as fontes respondem por um fetch falso): node tests/logica.test.mjs
import assert from 'node:assert/strict';
import { detectar, normalizar, chave, extrair, telefoneInfo, nomeReverso, apelidosDeNome, ehIPv6, TIPOS } from '../lib/entidades.mjs';
import { rodar, lerPagina, TRANSFORMACOES } from '../lib/transformacoes.mjs';
import { MAQUINAS } from '../lib/maquinas.mjs';

let ok = 0;
const pendentes = [];
const caso = (nome, fn) => pendentes.push(Promise.resolve().then(fn).then(() => ok++, (e) => { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }));

// fetch falso: cada URL (pelo começo) tem a sua resposta
function falso(rotas, extra = {}) {
  const achar = (url) => { const k = Object.keys(rotas).filter((p) => url.startsWith(p)).sort((a, b) => b.length - a.length)[0]; return k ? rotas[k] : undefined; };
  return {
    limite: 40,
    async json(url, opt = {}) { const r = achar(url); if (r === undefined) throw new Error('sem rota: ' + url); if (r === 404) { if (opt.nulo404) return null; throw new Error('404'); } return typeof r === 'function' ? r(url) : r; },
    async pagina(url) { const r = achar(url); if (!r) throw new Error('sem rota: ' + url); return r; },
    async cofre() { throw new Error('sem cofre'); },
    ...extra,
  };
}
const dnsResp = (tipo, dados) => ({ Status: 0, Answer: dados.map((data) => ({ type: { A: 1, NS: 2, CNAME: 5, PTR: 12, MX: 15, TXT: 16, AAAA: 28 }[tipo], data })) });

// ---------- entidades ----------
caso('detectar: os tipos comuns', () => {
  const casos = { 'exemplo.com.br': 'dominio', 'sub.exemplo.com': 'dominio', '8.8.8.8': 'ip', '2001:4860:4860::8888': 'ip', 'ana@empresa.com': 'email', 'https://x.com/a?b=1': 'url', '10.0.0.0/8': 'rede', 'AS15169': 'asn', 'as 13335': 'asn', 'CVE-2024-3400': 'cve', 'd41d8cd98f00b204e9800998ecf8427e': 'hash', '+55 51 99999-1234': 'telefone', '@martindevbr': 'apelido', 'Ana Maria Souza': 'pessoa', 'app.js': 'apelido', 'qualquer coisa com mais de cinco palavras aqui': 'texto' };
  for (const [v, t] of Object.entries(casos)) assert.equal(detectar(v), t, v);
});
caso('normalizar e chave: o mesmo valor escrito de jeitos diferentes vira uma entidade só', () => {
  assert.equal(normalizar('dominio', 'WWW.Exemplo.COM.'), 'www.exemplo.com');
  assert.equal(normalizar('dominio', '*.exemplo.com'), 'exemplo.com');
  assert.equal(normalizar('asn', 'as 15169'), 'AS15169');
  assert.equal(normalizar('telefone', '+55 (51) 99999-1234'), '+5551999991234');
  assert.equal(normalizar('url', 'https://Exemplo.com/a#topo'), 'https://exemplo.com/a');
  assert.equal(chave('pessoa', 'Ana  Souza'), chave('pessoa', 'ana souza'));
  assert.notEqual(chave('dominio', 'a.com'), chave('email', 'a.com'));
});
caso('IPv6: aceita os formatos válidos e recusa o resto', () => {
  for (const v of ['::1', '2001:db8::1', 'fe80::1:2:3:4', '2001:0db8:0000:0000:0000:ff00:0042:8329']) assert.ok(ehIPv6(v), v);
  for (const v of ['1:2:3', '2001:db8::1::2', 'abc', '12:34']) assert.ok(!ehIPv6(v), v);
});
caso('extrair: acha cada tipo num texto misturado, sem nomes de arquivo', () => {
  const t = `Alerta: conexão de 185.220.101.4 para api.exemplo.com.br (AS13335) às 10h.
    Avisar seguranca@exemplo.com.br e ver https://exemplo.com.br/painel?x=1).
    Hash: 44d88612fea8a8f36de82e1278abb02f · CVE-2021-44228 · rede 10.20.0.0/16 · +55 51 3333-4444
    Arquivos: app.js, config.json, foto.png. IPv6 2001:db8::1`;
  const por = {};
  for (const e of extrair(t)) (por[e.tipo] = por[e.tipo] || []).push(e.valor);
  assert.deepEqual(por.ip.sort(), ['185.220.101.4', '2001:db8::1']);
  assert.ok(por.dominio.includes('api.exemplo.com.br'));
  assert.ok(!por.dominio.some((d) => /\.(js|json|png)$/.test(d)), 'nome de arquivo virou domínio: ' + por.dominio);
  assert.ok(!por.dominio.includes('exemplo.com.br') || por.url, 'domínio do e-mail não deve vir sozinho');
  assert.deepEqual(por.email, ['seguranca@exemplo.com.br']);
  assert.deepEqual(por.url, ['https://exemplo.com.br/painel?x=1']);
  assert.deepEqual(por.cve, ['CVE-2021-44228']);
  assert.deepEqual(por.asn, ['AS13335']);
  assert.deepEqual(por.rede, ['10.20.0.0/16']);
  assert.deepEqual(por.hash, ['44d88612fea8a8f36de82e1278abb02f']);
  assert.deepEqual(por.telefone, ['+555133334444']);
});
caso('telefone: país e, no Brasil, estado e celular', () => {
  const i = telefoneInfo('+55 51 99999-1234');
  assert.deepEqual([i.ddi, i.pais, i.ddd, i.uf, i.estado, i.celular, i.tipo], ['+55', 'Brasil', 51, 'RS', 'Rio Grande do Sul', true, 'celular']);
  assert.match(i.regiao, /Porto Alegre/);
  assert.ok(i.formatos.includes('(51) 99999-1234'));
  assert.equal(telefoneInfo('+351 912 345 678').pais, 'Portugal');
  // sem o +55, um número com DDD válido também é reconhecido
  assert.equal(telefoneInfo('51 99999-1234').uf, 'RS');
  assert.equal(telefoneInfo('0800 123 4567').tipo, 'gratuito (0800)');
  assert.equal(telefoneInfo('12345'), null);
});
caso('nomeReverso: IPv4 e IPv6', () => {
  assert.equal(nomeReverso('8.8.4.4'), '4.4.8.8.in-addr.arpa');
  assert.equal(nomeReverso('2001:db8::1'), '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa');
  assert.throws(() => nomeReverso('x'));
});
caso('apelidosDeNome: sem acento, sem "de/da"', () => {
  const a = apelidosDeNome('Ana Maria de Souza');
  assert.ok(a.includes('anasouza') && a.includes('ana.souza') && a.includes('asouza') && a.includes('amsouza'), a.join(','));
});

// ---------- transformações ----------
caso('catálogo: todo tipo de origem existe e todo passo de máquina é uma transformação', () => {
  for (const t of TRANSFORMACOES) for (const d of t.de) assert.ok(TIPOS[d], `${t.id}: tipo ${d}`);
  for (const m of MAQUINAS) { assert.ok(TIPOS[m.de], m.id); for (const p of m.passos) { const t = TRANSFORMACOES.find((x) => x.id === p.t); assert.ok(t, `${m.id}: ${p.t}`); } }
  assert.equal(new Set(TRANSFORMACOES.map((t) => t.id)).size, TRANSFORMACOES.length);
});
caso('dns-ip: CNAME e IPs, com id em cada entidade', async () => {
  const ctx = falso({ 'https://dns.google/resolve?name=www.exemplo.com&type=A': dnsResp('A', ['93.184.216.34']), 'https://dns.google/resolve?name=www.exemplo.com&type=AAAA': dnsResp('AAAA', ['2606:2800:220:1::248']), 'https://dns.google/resolve?name=www.exemplo.com&type=CNAME': dnsResp('CNAME', ['exemplo.edgekey.net.']) });
  const r = await rodar('dns-ip', 'dominio', 'WWW.exemplo.com', ctx);
  assert.deepEqual(r.entidades.map((e) => e.id), ['dominio:exemplo.edgekey.net', 'ip:93.184.216.34', 'ip:2606:2800:220:1::248']);
});
caso('dns: cai para a Cloudflare quando o Google falha', async () => {
  const ctx = falso({ 'https://cloudflare-dns.com/dns-query?name=exemplo.com&type=NS': dnsResp('NS', ['a.iana-servers.net.']) });
  const r = await rodar('dns-ns', 'dominio', 'exemplo.com', ctx);
  assert.deepEqual(r.entidades.map((e) => e.valor), ['a.iana-servers.net']);
});
caso('dns-txt: SPF vira domínios e redes; verificações viram serviços; DMARC ausente vira aviso', async () => {
  const ctx = falso({
    'https://dns.google/resolve?name=exemplo.com&type=TXT': dnsResp('TXT', ['"v=spf1 include:_spf.google.com ip4:200.1.2.0/24 ip4:200.1.2.3 -all"', '"google-site-verification=abc"', '"MS=ms123"', '"algo qualquer"']),
    'https://dns.google/resolve?name=_dmarc.exemplo.com&type=TXT': { Status: 3 },
  });
  const r = await rodar('dns-txt', 'dominio', 'exemplo.com', ctx);
  const ids = r.entidades.map((e) => e.id);
  for (const id of ['dominio:_spf.google.com', 'rede:200.1.2.0/24', 'ip:200.1.2.3', 'organizacao:google workspace / search console', 'organizacao:microsoft 365', 'texto:algo qualquer']) assert.ok(ids.includes(id), id + ' em ' + ids);
  assert.match(r.props.DMARC, /não tem/);
});
caso('subdomínios: tira curinga, repetidos, o próprio domínio e os de fora; mais recentes primeiro', async () => {
  const ctx = falso({ 'https://crt.sh/': [
    { name_value: '*.exemplo.com\nexemplo.com', not_before: '2024-01-01T00:00:00' },
    { name_value: 'vpn.exemplo.com\nmail.exemplo.com', not_before: '2023-05-01T00:00:00' },
    { name_value: 'vpn.exemplo.com', not_before: '2025-02-01T00:00:00' },
    { name_value: 'outro.com', not_before: '2025-01-01T00:00:00' },
  ] });
  const r = await rodar('subdominios', 'dominio', 'exemplo.com', ctx);
  assert.deepEqual(r.entidades.map((e) => e.valor), ['vpn.exemplo.com', 'mail.exemplo.com']);
  assert.equal(r.entidades[0].props['último certificado'], '2025-02-01');
});
caso('limite: corta e avisa', async () => {
  const lista = Array.from({ length: 12 }, (_, i) => ({ name_value: `h${i}.exemplo.com`, not_before: '2024-01-01' }));
  const r = await rodar('subdominios', 'dominio', 'exemplo.com', { ...falso({ 'https://crt.sh/': lista }), limite: 5 });
  assert.equal(r.entidades.length, 5);
  assert.match(r.aviso, /5 de 12/);
});
caso('rdap-dominio: registrante, e-mail, servidores e datas; dados ocultos ficam de fora', async () => {
  const ctx = falso({ 'https://rdap.org/domain/exemplo.com.br': {
    events: [{ eventAction: 'registration', eventDate: '2010-03-04T00:00:00Z' }, { eventAction: 'expiration', eventDate: '2030-03-04T00:00:00Z' }],
    status: ['active'], nameservers: [{ ldhName: 'NS1.HOST.COM' }],
    entities: [
      { roles: ['registrant'], vcardArray: ['vcard', [['fn', {}, 'text', 'Empresa Exemplo Ltda'], ['email', {}, 'text', 'dono@exemplo.com.br']]] },
      { roles: ['technical'], vcardArray: ['vcard', [['fn', {}, 'text', 'REDACTED FOR PRIVACY'], ['email', {}, 'text', 'redacted@privacy.net']]] },
      { roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'Registro.br']]], entities: [{ roles: ['abuse'], vcardArray: ['vcard', [['email', {}, 'text', 'abuse@registro.br']]] }] },
    ],
  } });
  const r = await rodar('rdap-dominio', 'dominio', 'exemplo.com.br', ctx);
  const ids = r.entidades.map((e) => e.id);
  for (const id of ['organizacao:empresa exemplo ltda', 'email:dono@exemplo.com.br', 'organizacao:registro.br', 'email:abuse@registro.br', 'dominio:ns1.host.com']) assert.ok(ids.includes(id), id + ' em ' + ids);
  assert.ok(!ids.some((i) => /redacted/i.test(i)), 'dado oculto entrou: ' + ids);
  assert.equal(r.props.registro, '2010-03-04');
  assert.equal(r.props.expira, '2030-03-04');
});
caso('ip-asn: prefixo ligado ao IP e ASN ligado ao prefixo', async () => {
  const ctx = falso({ 'https://stat.ripe.net/data/network-info/': { data: { asns: ['15169'], prefix: '8.8.8.0/24' } }, 'https://stat.ripe.net/data/as-overview/': { data: { holder: 'GOOGLE - Google LLC' } } });
  const r = await rodar('ip-asn', 'ip', '8.8.8.8', ctx);
  assert.deepEqual(r.entidades.map((e) => [e.id, e.de && e.de.id]), [['rede:8.8.8.0/24', undefined], ['asn:AS15169', 'rede:8.8.8.0/24']]);
  assert.equal(r.entidades[1].rotulo, 'AS15169 · GOOGLE');
});
caso('internetdb: portas arriscadas e CVEs viram alerta; sem dados vira aviso', async () => {
  const ctx = falso({ 'https://internetdb.shodan.io/1.2.3.4': { ports: [443, 3389], hostnames: ['srv.exemplo.com'], vulns: ['CVE-2019-0708'], tags: ['self-signed'], cpes: [] }, 'https://internetdb.shodan.io/5.6.7.8': 404 });
  const r = await rodar('internetdb', 'ip', '1.2.3.4', ctx);
  const rdp = r.entidades.find((e) => e.id === 'porta:1.2.3.4:3389');
  assert.ok(rdp.alerta && /não deveria/.test(rdp.props.risco));
  assert.equal(rdp.rotulo, '3389 RDP');
  assert.ok(!r.entidades.find((e) => e.id === 'porta:1.2.3.4:443').alerta);
  assert.ok(r.entidades.find((e) => e.id === 'cve:CVE-2019-0708').alerta);
  assert.equal(r.props.tags, 'self-signed');
  const vazio = await rodar('internetdb', 'ip', '5.6.7.8', ctx);
  assert.equal(vazio.entidades.length, 0); assert.match(vazio.aviso, /nada/);
});
caso('ptr: monta o nome reverso', async () => {
  const ctx = falso({ 'https://dns.google/resolve?name=8.8.8.8.in-addr.arpa&type=PTR': dnsResp('PTR', ['dns.google.']) });
  assert.deepEqual((await rodar('ptr', 'ip', '8.8.8.8', ctx)).entidades.map((e) => e.id), ['dominio:dns.google']);
});
caso('lerPagina: título, e-mails, telefones, perfis e domínios externos (sem CDN nem compartilhar)', () => {
  const html = `<html><head><title> Exemplo  S.A. </title><meta name="description" content="A empresa"><meta name="generator" content="WordPress 6.4"></head><body>
    <a href="mailto:contato@exemplo.com?subject=oi">fale</a> vendas@exemplo.com <img src="logo@2x.png">
    <a href="tel:+55 51 3333-4444">ligue</a>
    <a href="https://www.linkedin.com/company/exemplo/">in</a> <a href="https://twitter.com/intent/tweet?x">tweet</a> <a href="https://github.com/exemplo">gh</a>
    <a href="https://parceiro.com.br/x">parceiro</a> <script src="https://cdn.jsdelivr.net/npm/x.js"></script> <a href="https://loja.exemplo.com">loja</a></body></html>`;
  const p = lerPagina(html, 'https://exemplo.com/');
  assert.equal(p.titulo, 'Exemplo S.A.');
  assert.equal(p.gerador, 'WordPress 6.4');
  assert.deepEqual(p.emails.sort(), ['contato@exemplo.com', 'vendas@exemplo.com']);
  assert.deepEqual(p.telefones, ['+55 51 3333-4444']);
  assert.deepEqual(p.sociais.sort(), ['https://github.com/exemplo', 'https://www.linkedin.com/company/exemplo']);
  assert.deepEqual(p.externos, ['parceiro.com.br']);
  assert.deepEqual(p.internos, ['loja.exemplo.com']);
});
caso('url-seguir: cadeia de redirecionamentos', async () => {
  const ctx = falso({
    'http://curto.ly/abc': { status: 301, headers: { location: 'https://meio.com/x' }, texto: '' },
    'https://meio.com/x': { status: 302, headers: { location: '/fim' }, texto: '' },
    'https://meio.com/fim': { status: 200, headers: { server: 'nginx', 'content-type': 'text/html' }, texto: '<title>Fim</title>' },
  });
  const r = await rodar('url-seguir', 'url', 'http://curto.ly/abc', ctx);
  assert.deepEqual(r.entidades.map((e) => [e.valor, e.de && e.de.valor]), [['https://meio.com/x', undefined], ['https://meio.com/fim', 'https://meio.com/x']]);
  assert.equal(r.props.título, 'Fim');
  assert.equal(r.props['destino final'], 'https://meio.com/fim');
});
caso('contas: só entra o site que confirma o usuário', async () => {
  const ctx = falso({
    'https://api.github.com/users/fulano': { login: 'fulano', html_url: 'https://github.com/fulano' },
    'https://gitlab.com/api/v4/users': [],
    'https://www.reddit.com/user/': 404, 'https://keybase.io/': { them: [null] }, 'https://hacker-news.firebaseio.com/': null,
    'https://dev.to/': 404, 'https://hub.docker.com/': 404,
    'https://api.chess.com/': { username: 'fulano', url: 'https://www.chess.com/member/fulano' }, 'https://lichess.org/': 404,
  });
  const r = await rodar('contas', 'apelido', '@fulano', ctx);
  assert.deepEqual(r.entidades.map((e) => e.valor).sort(), ['https://github.com/fulano', 'https://www.chess.com/member/fulano']);
});
caso('github: perfil e e-mails dos commits, sem os noreply', async () => {
  const ctx = falso({
    'https://api.github.com/users/fulano/events': [{ payload: { commits: [{ author: { email: 'fulano@pessoal.dev' } }, { author: { email: '1+fulano@users.noreply.github.com' } }] } }],
    'https://api.github.com/users/fulano': { login: 'fulano', html_url: 'https://github.com/fulano', name: 'Fulano de Tal', company: '@Empresa, Outra', blog: 'fulano.dev', location: 'Porto Alegre', public_repos: 3, created_at: '2015-01-02T00:00:00Z' },
  });
  const r = await rodar('github', 'apelido', 'fulano', ctx);
  const ids = r.entidades.map((e) => e.id);
  for (const id of ['conta:https://github.com/fulano', 'pessoa:fulano de tal', 'organizacao:empresa', 'organizacao:outra', 'url:https://fulano.dev/', 'local:porto alegre', 'email:fulano@pessoal.dev']) assert.ok(ids.includes(id), id + ' em ' + ids);
  assert.ok(!ids.some((i) => /noreply/.test(i)));
  assert.equal(r.props['criada em'], '2015-01-02');
});
caso('conta-apelido e telefone (locais)', async () => {
  assert.deepEqual((await rodar('conta-apelido', 'conta', 'https://www.linkedin.com/in/fulano-tal/', falso({}))).entidades.map((e) => e.valor), ['fulano-tal']);
  const t = await rodar('telefone', 'telefone', '+55 11 3000-0000', falso({}));
  assert.equal(t.entidades[0].valor, 'São Paulo e Grande SP (SP)'); assert.equal(t.props.tipo, 'fixo');
  // fixo não ganha links de app de mensagem (ganha a cidade pelo prefixo); celular ganha WhatsApp, Telegram e Signal
  assert.deepEqual(t.entidades.map((e) => e.tipo), ['local', 'local']);
  assert.equal(t.entidades[1].ligacao, 'cidade do telefone fixo');
  const c = await rodar('telefone', 'telefone', '(51) 99999-1234', falso({}));
  assert.deepEqual(c.entidades.filter((e) => e.tipo === 'conta').map((e) => e.valor), ['https://wa.me/5551999991234', 'https://t.me/+5551999991234', 'https://signal.me/#p/+5551999991234']);
  assert.match(c.props['jeitos de escrever'], /\(51\) 99999-1234/);
  assert.deepEqual((await rodar('conta-apelido', 'conta', 'https://wa.me/5551999991234', falso({}))).entidades, []);
});
caso('cve: resumo, CVSS, fornecedor e EPSS', async () => {
  const ctx = falso({
    'https://cveawg.mitre.org/api/cve/CVE-2021-44228': { cveMetadata: { datePublished: '2021-12-10T00:00:00Z' }, containers: { cna: { descriptions: [{ value: 'Log4Shell' }], metrics: [{ cvssV3_1: { baseScore: 10, baseSeverity: 'CRITICAL' } }], affected: [{ vendor: 'Apache Software Foundation', product: 'Log4j2' }], references: [{ url: 'https://logging.apache.org/log4j/2.x/security.html' }] } } },
    'https://api.first.org/': { data: [{ epss: '0.97' }] },
  });
  const r = await rodar('cve', 'cve', 'cve-2021-44228', ctx);
  assert.equal(r.props.CVSS, '10 (CRITICAL)');
  assert.match(r.props.EPSS, /97\.0%/);
  assert.ok(r.entidades.some((e) => e.id === 'organizacao:apache software foundation'));
});
caso('rodar: recusa tipo errado, transformação desconhecida e IP inválido', async () => {
  await assert.rejects(rodar('dns-ip', 'ip', '1.1.1.1', falso({})), /não serve/);
  await assert.rejects(rodar('nao-existe', 'ip', '1.1.1.1', falso({})), /desconhecida/);
  await assert.rejects(rodar('ptr', 'ip', '999.1.1.1', falso({})), /não é um endereço IP/);
});
caso('virustotal: sem a chave, o erro pede o Cofre', async () => {
  const ctx = falso({}, { async cofre() { return { status: 401, ok: false, json: () => ({}) }; } });
  await assert.rejects(rodar('virustotal', 'dominio', 'exemplo.com', ctx), (e) => e.codigo === 'cofre');
  const ctx2 = falso({}, { async cofre(url) { assert.match(url, /domains\/exemplo\.com$/); return { status: 200, ok: true, json: () => ({ data: { attributes: { last_analysis_stats: { malicious: 3, harmless: 60, undetected: 7 }, reputation: -12 } } }) }; } });
  const r = await rodar('virustotal', 'dominio', 'exemplo.com', ctx2);
  assert.equal(r.props.VirusTotal, '3 de 70 motores dizem malicioso');
  assert.ok(r.alerta);
});

await Promise.all(pendentes);
console.log(`testes do Bluetego: ${ok} de ${pendentes.length} passaram`);
