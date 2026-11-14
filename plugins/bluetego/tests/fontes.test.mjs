// Testes das fontes da 0.4 (sem rede): chaves PGP, Launchpad, Stack Exchange, npm, OpenAlex, ORCID, Wikimedia, IBGE,
// Câmara, reputação do IP, CVE explorada, hashlookup, infostealer, segurança do e-mail, PeeringDB. node tests/fontes.test.mjs
import assert from 'node:assert/strict';
import { rodar, lerIndicePgp, TRANSFORMACOES } from '../lib/transformacoes.mjs';
import { MAQUINAS } from '../lib/maquinas.mjs';

let ok = 0;
const pendentes = [];
const caso = (nome, fn) => pendentes.push(Promise.resolve().then(fn).then(() => ok++, (e) => { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }));
function falso(rotas, extra = {}) {
  const achar = (url) => { const k = Object.keys(rotas).filter((p) => url.startsWith(p)).sort((a, b) => b.length - a.length)[0]; return k ? rotas[k] : undefined; };
  return {
    limite: 40,
    async json(url, opt = {}) { const r = achar(url); if (r === undefined) throw new Error('sem rota: ' + url); if (r === 404) { if (opt.nulo404) return null; throw new Error('404'); } return typeof r === 'function' ? r(url) : r; },
    async pagina(url) { const r = achar(url); if (r === undefined) throw new Error('sem rota: ' + url); if (r === 404) return { status: 404, texto: 'Not Found', headers: {} }; return { headers: {}, url, ...r }; },
    ...extra,
  };
}

// ---------- pessoas ----------
caso('PGP: o índice do servidor de chaves, sem as chaves envenenadas (sem UID)', () => {
  const ks = lerIndicePgp('info:1:3\npub:AAAA1111:1:4096:1316795861::\nuid:Greg%20Kroah-Hartman%20%3Cgregkh@kernel.org%3E:1511977792::\npub:BBBB2222:1:4096:1576954000::\n');
  assert.equal(ks.length, 1); assert.equal(ks[0].uids[0], 'Greg Kroah-Hartman <gregkh@kernel.org>'); assert.equal(ks[0].criada, '2011-09-23');
});
caso('PGP por e-mail: verificado e autodeclarado aparecem diferentes', async () => {
  const ctx = falso({
    'https://keys.openpgp.org/vks/v1/by-email/': { status: 200, texto: '-----BEGIN PGP PUBLIC KEY BLOCK-----\r\nComment: D477 040C 70C2 156A 5C29  8549 BB7E 9101 495E 6BF7\r\nComment: <ana@pessoal.org>\r\nComment: <ana@empresa.com>\r\n' },
    'https://keyserver.ubuntu.com/': { status: 200, texto: 'pub:FFFF0000:1:4096:1500000000::\nuid:Ana%20Souza%20(trabalho)%20%3Cana.souza@outra.com%3E:1500000000::\n' },
  });
  const r = await rodar('pgp-email', 'email', 'ana@empresa.com', ctx);
  const por = Object.fromEntries(r.entidades.map((e) => [e.id, e.ligacao]));
  assert.equal(por['email:ana@pessoal.org'], 'mesma chave PGP (e-mail verificado)');
  assert.equal(por['email:ana.souza@outra.com'], 'mesma chave PGP (autodeclarado)');
  assert.equal(por['pessoa:ana souza'], 'nome na chave PGP (autodeclarado)');
  assert.ok(!por['email:ana@empresa.com'], 'o próprio e-mail não volta');
  assert.match(r.props['chaves PGP'], /495E6BF7 \(verificada\)/);
});
caso('Launchpad: por apelido só o nome exato; equipe não conta; nunca por e-mail', async () => {
  assert.ok(!TRANSFORMACOES.find((t) => t.id === 'launchpad').de.includes('email'));
  const ctx = falso({
    'https://api.launchpad.net/1.0/people?': { entries: [{ name: 'sabdfl', display_name: 'Mark Shuttleworth', karma: 10, date_created: '2005-06-15T00:00:00Z' }, { name: 'sabdfl-team', display_name: 'Equipe', is_team: true }, { name: 'sabdflx', display_name: 'Outro' }] },
    'https://api.launchpad.net/1.0/~sabdfl/irc_nicknames': { entries: [{ network: 'irc.libera.chat', nickname: 'sabdfl' }] },
    'https://api.launchpad.net/1.0/~sabdfl/gpg_keys': { entries: [{ fingerprint: '70E4' }] },
  });
  const r = await rodar('launchpad', 'apelido', 'sabdfl', ctx);
  const ids = r.entidades.map((e) => e.id);
  assert.deepEqual(ids.sort(), ['conta:https://launchpad.net/~sabdfl', 'pessoa:mark shuttleworth'].sort());
  assert.equal(r.entidades.find((e) => e.tipo === 'conta').props['chaves GPG'], '70E4');
});
caso('Stack Exchange: só o nome exato, e as contas associadas só quando o perfil é um só', async () => {
  const ctx = falso({
    'https://api.stackexchange.com/2.3/users?': { items: [{ display_name: 'Jon Skeet', link: 'https://stackoverflow.com/users/22656/jon-skeet', account_id: 11683, location: 'Reading, United Kingdom', reputation: 1 }, { display_name: 'Jon Skeetish', link: 'https://stackoverflow.com/users/1/x', account_id: 2 }], quota_remaining: 290 },
    'https://api.stackexchange.com/2.3/users/11683/associated': { items: [{ site_name: 'Meta Stack Overflow', site_url: 'https://meta.stackoverflow.com', user_id: 22656, reputation: 5 }] },
  });
  const r = await rodar('stackexchange', 'pessoa', 'Jon Skeet', ctx);
  const ids = r.entidades.map((e) => e.id);
  assert.ok(ids.includes('local:reading, united kingdom'));
  assert.ok(ids.includes('conta:https://meta.stackoverflow.com/users/22656'));
  assert.ok(!ids.some((i) => i.includes('/users/1/x')));
});
caso('npm: o e-mail do próprio mantenedor e os repositórios', async () => {
  const ctx = falso({ 'https://registry.npmjs.org/-/v1/search': { total: 2, objects: [{ package: { name: 'a', publisher: { username: 'fulano', email: 'fulano@x.com' }, maintainers: [{ username: 'outro', email: 'outro@y.com' }], links: { repository: 'git+https://github.com/fulano/a.git' } } }] } });
  const r = await rodar('npm', 'apelido', 'Fulano', ctx);
  const ids = r.entidades.map((e) => e.id);
  assert.ok(ids.includes('email:fulano@x.com')); assert.ok(!ids.includes('email:outro@y.com'));
  assert.ok(ids.includes('url:https://github.com/fulano/a'));
});
caso('ORCID e Wikimedia: perfil completo e conta global ausente', async () => {
  const ctx = falso({
    'https://pub.orcid.org/v3.0/0000-0002-1825-0097/person': { name: { 'given-names': { value: 'Josiah' }, 'family-name': { value: 'Carberry' } }, 'researcher-urls': { 'researcher-url': [{ 'url-name': 'Wikipedia', url: { value: 'https://en.wikipedia.org/wiki/Josiah_Carberry' } }] } },
    'https://pub.orcid.org/v3.0/0000-0002-1825-0097/employments': { 'affiliation-group': [{ summaries: [{ 'employment-summary': { 'role-title': 'Professor', organization: { name: 'Brown University' }, 'start-date': { year: { value: '1929' } } } }] }] },
    'https://meta.wikimedia.org/': { query: { globaluserinfo: { missing: '' } } },
  });
  const r = await rodar('orcid-perfil', 'conta', 'https://orcid.org/0000-0002-1825-0097', ctx);
  const ids = r.entidades.map((e) => e.id);
  assert.ok(ids.includes('pessoa:josiah carberry') && ids.includes('organizacao:brown university'));
  assert.equal((await rodar('orcid-perfil', 'conta', 'https://github.com/x', ctx)).aviso, 'Só serve para contas do ORCID.');
  assert.match((await rodar('wikimedia', 'apelido', 'naoexiste', ctx)).aviso, /Nenhuma conta global/);
});
caso('IBGE: risco de homônimo pelo primeiro nome', async () => {
  const ctx = falso({ 'https://servicodados.ibge.gov.br/api/v2/censos/nomes/maria?groupBy=UF': [{ localidade: '33', res: [{ proporcao: 9000 }] }], 'https://servicodados.ibge.gov.br/api/v2/censos/nomes/maria': [{ res: [{ periodo: '[1960,1970[', frequencia: 2000000 }, { periodo: '[1970,1980[', frequencia: 1500000 }] }] });
  const r = await rodar('ibge-nome', 'pessoa', 'Maria Silva', ctx);
  assert.equal(r.props['risco de homônimo'], 'alto'); assert.equal(r.props['década mais comum de nascimento'], '1960–1970');
});

// ---------- infraestrutura ----------
caso('reputação do IP: Tor e listas de ameaça dão alerta; lista informativa não', async () => {
  const comum = { 'https://www.spamhaus.org/drop/drop_v4.json': { status: 200, texto: '{"cidr":"6.6.0.0/16","sblid":"SBL1"}\n' }, 'https://onionoo.torproject.org/': { relays: [] }, 'https://api.stopforumspam.org/': { ip: { appears: 0 } }, 'https://api.greynoise.io/': 404 };
  const benigno = await rodar('ip-reputacao', 'ip', '8.8.8.8', falso({ ...comum, 'https://isc.sans.edu/': { ip: { threatfeeds: { openresolver: { lastseen: '2026-11-14' }, myip: {} }, asabusecontact: 'network-abuse@google.com' } } }));
  assert.ok(!benigno.alerta); assert.ok(benigno.entidades.some((e) => e.id === 'email:network-abuse@google.com'));
  const ruim = await rodar('ip-reputacao', 'ip', '6.6.1.1', falso({ ...comum, 'https://isc.sans.edu/': { ip: { threatfeeds: { talos: { lastseen: '2026-10-25' } } } } }));
  assert.ok(ruim.alerta); assert.match(ruim.props.risco, /SANS ISC: talos/); assert.match(ruim.props['Spamhaus DROP'], /SBL1/);
  assert.match((await rodar('ip-reputacao', 'ip', '192.168.0.10', falso({}))).aviso, /privado/);
});
caso('CVE: explorada de fato (CISA KEV), com ransomware e avistamentos', async () => {
  const ctx = falso({
    'https://www.cisa.gov/': { status: 200, texto: JSON.stringify({ vulnerabilities: [{ cveID: 'CVE-2021-44228', vendorProject: 'Apache', product: 'Log4j2', dateAdded: '2021-12-10', dueDate: '2021-12-24', knownRansomwareCampaignUse: 'Known', cwes: ['CWE-502'] }] }) },
    'https://vulnerability.circl.lu/': { metadata: { count: 2057 }, data: [{ type: 'exploited', source: 'Shadowserver (2026-11-13)' }] },
  });
  const r = await rodar('cve-exploracao', 'cve', 'CVE-2021-44228', ctx);
  assert.ok(r.alerta); assert.match(r.props.ransomware, /ransomware/); assert.match(r.props['avistamentos (CIRCL)'], /^2057 .*2026-11-13/);
  assert.ok(r.entidades.some((e) => e.id === 'organizacao:apache'));
});
caso('hashlookup: os outros hashes do mesmo arquivo e o alerta de malicioso', async () => {
  const r = await rodar('hashlookup', 'hash', '44d88612fea8a8f36de82e1278abb02f', falso({ 'https://hashlookup.circl.lu/lookup/md5/': { FileName: 'eicar.com', FileSize: '68', KnownMalicious: 'malshare.com', MD5: '44D88612FEA8A8F36DE82E1278ABB02F', 'SHA-1': '3395856CE81F2B7382DEE72602F798B642F14140' } }));
  assert.deepEqual(r.entidades.map((e) => e.id), ['hash:3395856ce81f2b7382dee72602f798b642f14140']);
  assert.ok(r.alerta); assert.equal(r.props.arquivo, 'eicar.com');
});
caso('infostealer: funcionários infectados viram alerta, e só as URLs do próprio domínio entram', async () => {
  const r = await rodar('infostealer', 'dominio', 'x.com', falso({ 'https://cavalier.hudsonrock.com/': { total: 5, employees: 2, users: 3, data: { employees_urls: [{ url: 'https://vpn.x.com/login', occurrence: 2 }, { url: 'https://github.com', occurrence: 9 }] } } }));
  assert.ok(r.alerta); assert.deepEqual(r.entidades.map((e) => e.valor), ['https://vpn.x.com/login']);
  const nada = await rodar('infostealer', 'dominio', 'y.com', falso({ 'https://cavalier.hudsonrock.com/': { total: 0 } }));
  assert.ok(!nada.alerta); assert.match(nada.props.infostealer, /nenhum/);
});
caso('segurança do e-mail: sem DMARC é alerta; com DMARC, quem recebe os relatórios vira e-mail', async () => {
  const resp = (dados) => ({ Status: 0, Answer: dados.map((d) => ({ type: 16, data: `"${d}"` })) });
  const ctx = falso({
    'https://dns.google/resolve?name=_dmarc.x.com': resp(['v=DMARC1; p=reject; rua=mailto:dmarc@x.com']),
    'https://dns.google/resolve?name=google._domainkey.x.com': resp(['v=DKIM1; k=rsa; p=MIGf']),
    'https://dns.google/resolve': { Status: 3 },
    'https://cloudflare-dns.com/': { AD: true },
  });
  const r = await rodar('seguranca-email', 'dominio', 'x.com', ctx);
  assert.ok(!r.alerta); assert.match(r.props.DMARC, /^reject/); assert.equal(r.props['DKIM (seletores achados)'], 'google'); assert.match(r.props.DNSSEC, /^sim/);
  assert.ok(r.entidades.some((e) => e.id === 'email:dmarc@x.com'));
  const sem = await rodar('seguranca-email', 'dominio', 'y.com', falso({ 'https://dns.google/resolve': { Status: 3 }, 'https://cloudflare-dns.com/': { AD: false } }));
  assert.ok(sem.alerta); assert.match(sem.props.risco, /sem DMARC/);
});
caso('catálogo: as máquinas só usam transformações que existem', () => {
  for (const m of MAQUINAS) for (const p of m.passos) assert.ok(TRANSFORMACOES.some((t) => t.id === p.t), `${m.id}: ${p.t}`);
});

await Promise.all(pendentes);
console.log(`testes das fontes do Bluetego: ${ok} de ${pendentes.length} passaram`);
