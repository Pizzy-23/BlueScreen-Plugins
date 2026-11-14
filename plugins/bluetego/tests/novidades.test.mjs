// Testes das partes da 0.2 (sem rede): CNPJ, carteira, domínios parecidos, tecnologias, certificado, security.txt,
// OTX, Receita, pistas sem IA e o pedido e a resposta da IA. node tests/novidades.test.mjs
import assert from 'node:assert/strict';
import { detectar, cnpjValido, extrair, normalizar } from '../lib/entidades.mjs';
import { rodar, permutacoes, partesDominio, tecnologiasDe, lerSecurityTxt, lerBusca, lerBing, consultaWeb, TRANSFORMACOES } from '../lib/transformacoes.mjs';
import { MAQUINAS } from '../lib/maquinas.mjs';
import { pensar, base, dentroDaRede } from '../lib/pistas.mjs';
import { resumoGrafo, montarPedido, lerResposta } from '../lib/ia.mjs';

let ok = 0;
const pendentes = [];
const caso = (nome, fn) => pendentes.push(Promise.resolve().then(fn).then(() => ok++, (e) => { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }));
function falso(rotas, extra = {}) {
  const achar = (url) => { const k = Object.keys(rotas).filter((p) => url.startsWith(p)).sort((a, b) => b.length - a.length)[0]; return k ? rotas[k] : undefined; };
  return {
    limite: 40,
    async json(url, opt = {}) { const r = achar(url); if (r === undefined) throw new Error('sem rota: ' + url); if (r === 404) { if (opt.nulo404) return null; throw new Error('404'); } return typeof r === 'function' ? r(url) : r; },
    async pagina(url) { const r = achar(url); if (!r) throw new Error('sem rota: ' + url); return r; },
    ...extra,
  };
}

// ---------- entidades ----------
caso('CNPJ: dígitos verificadores, formatos e extração', () => {
  assert.ok(cnpjValido('33.000.167/0001-01')); assert.ok(cnpjValido('33000167000101'));
  assert.ok(!cnpjValido('33.000.167/0001-02')); assert.ok(!cnpjValido('11111111111111'));
  assert.equal(detectar('33000167000101'), 'cnpj');
  assert.equal(normalizar('cnpj', '33000167000101'), '33.000.167/0001-01');
  assert.deepEqual(extrair('pedido 12345678901234, empresa 33.000.167/0001-01').filter((e) => e.tipo === 'cnpj').map((e) => e.valor), ['33.000.167/0001-01']);
});
caso('carteira de Bitcoin: bc1 e base58 com letras e números; palavra comprida não passa', () => {
  assert.equal(detectar('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'), 'cripto');
  assert.equal(detectar('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'), 'cripto');
  assert.notEqual(detectar('1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), 'cripto');
});

// ---------- transformações novas ----------
caso('domínios parecidos: técnicas, sem o original, sufixo duplo do .br', () => {
  assert.deepEqual(partesDominio('www.loja.exemplo.com.br'), { nome: 'exemplo', sufixo: 'com.br' });
  assert.deepEqual(partesDominio('exemplo.com.br'), { nome: 'exemplo', sufixo: 'com.br' });
  const p = permutacoes('banco.com.br');
  const d = new Map(p.map((x) => [x.dominio, x.tecnica]));
  assert.ok(!d.has('banco.com.br'));
  assert.equal(d.get('banc0.com.br'), 'letra parecida');
  assert.equal(d.get('banco.com'), 'outro final');
  assert.equal(d.get('bnco.com.br'), 'letra a menos');
  assert.equal(d.get('bacno.com.br'), 'letras trocadas');
  assert.equal(d.get('banco-login.com.br'), 'palavra a mais');
  assert.ok(p.every((x) => /^[a-z0-9-]+\.[a-z.]+$/.test(x.dominio)));
});
caso('domínios parecidos: só entram os que existem, com alerta', async () => {
  const resolve = (url) => ({ Status: 0, Answer: /name=banc0\.com\.br&type=A/.test(url) ? [{ type: 1, data: '6.6.6.6' }] : /name=banco\.com&type=NS/.test(url) ? [{ type: 2, data: 'ns.x.com.' }] : [] });
  const r = await rodar('parecidos', 'dominio', 'banco.com.br', falso({ 'https://dns.google/': resolve }));
  assert.deepEqual(r.entidades.map((e) => e.valor).sort(), ['banc0.com.br', 'banco.com']);
  assert.ok(r.entidades.every((e) => e.alerta));
  assert.equal(r.entidades.find((e) => e.valor === 'banco.com').props.IPs, 'registrado, sem site');
});
caso('tecnologias: cabeçalhos, HTML, cookies e versão', () => {
  const t = tecnologiasDe({ headers: { server: 'nginx/1.18.0', 'x-powered-by': 'PHP/7.4.3', 'set-cookie': 'PHPSESSID=abc', 'cf-ray': 'x' }, texto: '<meta name="generator" content="WordPress 6.4.2"><script src="/wp-includes/js/jquery/jquery.min.js"></script><script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>' });
  const m = new Map(t.map((x) => [x.nome, x]));
  assert.equal(m.get('nginx').versao, '1.18.0');
  assert.equal(m.get('PHP').versao, '7.4.3');
  assert.equal(m.get('WordPress').versao, '6.4.2');
  for (const n of ['Cloudflare', 'jQuery', 'Google Analytics']) assert.ok(m.has(n), n);
  assert.ok(!m.has('Shopify'));
});
caso('certificado: outros nomes, emissor e alerta de vencimento', async () => {
  const daqui10 = new Date(Date.now() + 10 * 86400000).toUTCString();
  const ctx = falso({}, { tls: async () => ({ sujeito: 'exemplo.com', emissor: "Let's Encrypt", ate: daqui10, san: ['exemplo.com', 'www.exemplo.com', '*.api.exemplo.com'], valido: true, erro: '', protocolo: 'TLSv1.3' }) });
  const r = await rodar('certificado', 'dominio', 'exemplo.com', ctx);
  assert.deepEqual(r.entidades.map((e) => e.id).sort(), ['dominio:api.exemplo.com', 'dominio:www.exemplo.com', "organizacao:let's encrypt"].sort());
  assert.ok(r.alerta); assert.match(r.props.risco, /vence em (9|10) dias/);
});
caso('security.txt e SOA', async () => {
  assert.deepEqual(lerSecurityTxt('Contact: mailto:sec@x.com\nContact: https://x.com/bug\nExpires: 2027-01-01T00:00:00Z\nPolicy: https://x.com/p').contatos, ['mailto:sec@x.com', 'https://x.com/bug']);
  const ctx = falso({
    'https://x.com/.well-known/security.txt': { status: 200, texto: 'Contact: mailto:sec@x.com\nPolicy: https://x.com/p\nExpires: 2027-01-01T00:00:00Z' },
    'https://dns.google/resolve?name=x.com&type=SOA': { Status: 0, Answer: [{ type: 6, data: 'ns1.x.com. host\\.master.x.com. 1 2 3 4 5' }] },
  });
  const r = await rodar('contatos-seguranca', 'dominio', 'x.com', ctx);
  const ids = r.entidades.map((e) => e.id);
  for (const id of ['email:sec@x.com', 'url:https://x.com/p', 'email:host.master@x.com', 'url:https://x.com/.well-known/security.txt']) assert.ok(ids.includes(id), id + ' em ' + ids);
  assert.match(r.props['security.txt'], /^sim, vence em 2027-01-01/);
});
caso('OTX: contagem vira alerta, sem entidades inventadas', async () => {
  const r = await rodar('otx', 'ip', '6.6.6.6', falso({ 'https://otx.alienvault.com/api/v1/indicators/IPv4/6.6.6.6/general': { pulse_info: { count: 3, pulses: [{ name: 'Botnet X', tags: ['c2'], malware_families: [{ display_name: 'Mirai' }] }] } } }));
  assert.ok(r.alerta); assert.equal(r.entidades.length, 0); assert.match(r.props.OTX, /^3 relatórios/);
});
caso('Receita: razão social, sócios, endereço e situação', async () => {
  const r = await rodar('cnpj', 'cnpj', '33000167000101', falso({ 'https://brasilapi.com.br/api/cnpj/v1/33000167000101': { razao_social: 'EMPRESA X SA', nome_fantasia: 'X', descricao_situacao_cadastral: 'BAIXADA', qsa: [{ nome_socio: 'ANA SOUZA', qualificacao_socio: 'Diretor', cnpj_cpf_do_socio: '***123456**' }, { nome_socio: 'HOLDING Y LTDA', qualificacao_socio: 'Sócio', cnpj_cpf_do_socio: '11222333000181' }], logradouro: 'R A', numero: '1', municipio: 'PORTO ALEGRE', uf: 'RS', ddd_telefone_1: '5133334444', email: 'X@X.COM' } }));
  const ids = r.entidades.map((e) => e.id);
  for (const id of ['organizacao:empresa x sa', 'organizacao:x', 'pessoa:ana souza', 'cnpj:11.222.333/0001-81', 'telefone:+555133334444', 'email:x@x.com']) assert.ok(ids.includes(id), id + ' em ' + ids);
  assert.ok(r.alerta); assert.match(r.props.risco, /baixada/);
});
caso('catálogo: ids únicos e máquinas que só usam transformações que existem', () => {
  assert.equal(new Set(TRANSFORMACOES.map((t) => t.id)).size, TRANSFORMACOES.length);
  assert.equal(MAQUINAS.length, 12);
  for (const m of MAQUINAS) for (const p of m.passos) assert.ok(TRANSFORMACOES.some((t) => t.id === p.t), `${m.id}: ${p.t}`);
});

// ---------- pistas (sem IA) ----------
const grafo = {
  nos: [
    { id: 'd1', tipo: 'dominio', valor: 'exemplo.com', props: {} }, { id: 'd2', tipo: 'dominio', valor: 'loja.exemplo.com', props: {} },
    { id: 'd3', tipo: 'dominio', valor: 'outra.net', props: {} }, { id: 'e1', tipo: 'email', valor: 'ana.souza@exemplo.com', props: {} },
    { id: 'p1', tipo: 'pessoa', valor: 'Ana Souza', props: {} }, { id: 'i1', tipo: 'ip', valor: '10.0.0.5', props: { provedor: 'Hospeda Ltda' }, alerta: true },
    { id: 'r1', tipo: 'rede', valor: '10.0.0.0/24', props: {} }, { id: 'o1', tipo: 'organizacao', valor: 'Hospeda Ltda', props: {} },
  ],
  ligacoes: [{ de: 'd1', para: 'i1' }, { de: 'd3', para: 'i1' }],
};
caso('pistas: ligações que faltam, infraestrutura em comum, alerta e próximos passos', () => {
  const ps = pensar(grafo, TRANSFORMACOES);
  const lig = ps.filter((p) => p.tipo === 'ligacao').map((p) => `${p.acao.de}>${p.acao.para}:${p.acao.rotulo}`);
  for (const l of ['e1>d1:domínio do e-mail', 'd2>d1:subdomínio de', 'i1>r1:dentro do bloco', 'i1>o1:citado nas propriedades', 'p1>e1:parece ser o e-mail de']) assert.ok(lig.includes(l), l + ' em ' + lig);
  assert.ok(ps.some((p) => p.tipo === 'descoberta' && /2 domínios diferentes com o mesmo servidor/.test(p.titulo)));
  assert.equal(ps[0].tipo, 'alerta');
  assert.ok(ps.some((p) => p.tipo === 'proximo' && p.acao.id === 'i1'));
});
caso('pistas: não sugere o que já está ligado', () => {
  const ps = pensar({ ...grafo, ligacoes: [...grafo.ligacoes, { de: 'd1', para: 'e1' }] }, TRANSFORMACOES);
  assert.ok(!ps.some((p) => p.tipo === 'ligacao' && p.acao.de === 'e1' && p.acao.para === 'd1'));
});
caso('base e rede', () => {
  assert.equal(base('a.b.exemplo.com.br'), 'exemplo.com.br'); assert.equal(base('www.github.com'), 'github.com');
  assert.ok(dentroDaRede('10.0.0.255', '10.0.0.0/24')); assert.ok(!dentroDaRede('10.0.1.0', '10.0.0.0/24')); assert.ok(dentroDaRede('200.1.2.3', '0.0.0.0/0'));
});

// ---------- IA: pedido e resposta ----------
caso('resumo do grafo: apelidos curtos, foco primeiro, alerta marcado', () => {
  const { texto, mapa } = resumoGrafo(grafo, { foco: ['p1'] });
  assert.equal(mapa.e1, 'p1');
  assert.match(texto, /e1 \[pessoa\] Ana Souza ★FOCO/);
  assert.match(texto, /\[ip\] 10\.0\.0\.5 ⚠ALERTA \{provedor=Hospeda Ltda\}/);
  assert.match(texto, /-\[ligado a\]->/);
});
caso('pedido: tarefa do modo, transformações por tipo e formato da resposta', () => {
  const { prompt } = montarPedido({ grafo, objetivo: 'achar o dono', modo: 'piloto', transformacoes: TRANSFORMACOES });
  assert.match(prompt, /OBJETIVO: achar o dono/);
  assert.match(prompt, /- dominio: dns-ip \(Resolver IPs/);
  assert.match(prompt, /"concluido": false/);
});
caso('resposta: aceita JSON entre crases, traduz apelidos e descarta o que não confere', () => {
  const { mapa } = resumoGrafo(grafo);
  const ref = Object.fromEntries(Object.entries(mapa).map(([r, id]) => [id, r]));
  const texto = 'Claro! ```json\n' + JSON.stringify({
    resumo: 'Dois domínios no mesmo IP.',
    hipoteses: [{ texto: 'Mesmo dono', confianca: 'media', entidades: [ref.d1, ref.d3, 'e999'] }],
    ligacoes: [{ de: ref.d1, para: ref.d3, rotulo: 'mesmo dono', motivo: 'mesmo IP' }, { de: ref.d1, para: 'e999', rotulo: 'x' }, { de: ref.d1, para: ref.d1, rotulo: 'x' }],
    entidades: [{ tipo: 'dominio', valor: 'WWW.Exemplo.com.', ligarA: ref.d1, motivo: 'comum' }, { tipo: 'nave', valor: 'x' }],
    proximos: [{ entidade: ref.d3, transformacao: 'dns-mx', motivo: 'e-mail' }, { entidade: ref.d3, transformacao: 'ptr' }, { entidade: ref.i1, transformacao: 'inventada' }],
    concluido: false,
  }) + '\n```';
  const r = lerResposta(texto, mapa, grafo, TRANSFORMACOES);
  assert.ok(r.ok);
  assert.deepEqual(r.hipoteses[0].entidades, ['d1', 'd3']); assert.equal(r.hipoteses[0].confianca, 'média');
  assert.deepEqual(r.ligacoes.map((l) => [l.de, l.para]), [['d1', 'd3']]);
  assert.deepEqual(r.entidades.map((e) => e.id), ['dominio:www.exemplo.com']);
  assert.deepEqual(r.proximos.map((p) => p.t), ['dns-mx']);
});
caso('resposta fora do formato vira erro legível', () => {
  const r = lerResposta('não sei', {}, grafo, TRANSFORMACOES);
  assert.equal(r.ok, false); assert.match(r.erro, /formato/);
});

// ---------- telefone, web, contas e GitHub ----------
caso('busca na web: DuckDuckGo e Bing, com o endereço de verdade', () => {
  const ddg = '<div class="result results_links"><div class="result__body"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexemplo.com%2Fcontato&amp;rut=x">Fale <b>conosco</b></a><a class="result__snippet" href="x">Ligue (51) 3214-4000 ou contato@exemplo.com</a></div></div>';
  assert.deepEqual(lerBusca(ddg), [{ url: 'https://exemplo.com/contato', titulo: 'Fale conosco', trecho: 'Ligue (51) 3214-4000 ou contato@exemplo.com' }]);
  const bing = `<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&amp;u=a1${Buffer.from('https://site.com/p').toString('base64url')}&amp;ntb=1">Título</a></h2><p>trecho</p></li>`;
  assert.deepEqual(lerBing(bing), [{ url: 'https://site.com/p', titulo: 'Título', trecho: 'trecho' }]);
});
caso('consulta da web: o telefone em vários jeitos de escrever; o domínio fora do próprio site', () => {
  assert.match(consultaWeb('telefone', '+5551999991234'), /"\(51\) 99999-1234" OR/);
  assert.equal(consultaWeb('dominio', 'x.com'), '"x.com" -site:x.com');
  assert.equal(consultaWeb('apelido', 'fizzy'), '"fizzy" OR "@fizzy"');
});
caso('procurar na web: resultados viram URLs, perfis viram contas, e o que o trecho cita fica ligado', async () => {
  const html = ['https://exemplo.com/contato', 'https://www.instagram.com/fulano?igsh=1'].map((u, i) => `<div class="result__body"><a class="result__a" href="${u}">R${i}</a><a class="result__snippet">${i ? 'fone 51 3214-4000' : 'e-mail: ana@exemplo.com · (51) 3214-4000'}</a></div>`).join('') + '<div class="result__body"><a class="result__a" href="https://canva.com/">Canva</a><a class="result__snippet">design</a></div>';
  const r = await rodar('web', 'telefone', '(51) 3214-4000', falso({ 'https://html.duckduckgo.com/': { status: 200, texto: html } }));
  const ids = r.entidades.map((e) => e.id);
  assert.ok(ids.includes('url:https://exemplo.com/contato'));
  assert.ok(ids.includes('conta:https://www.instagram.com/fulano'), ids.join(' '));
  const email = r.entidades.find((e) => e.id === 'email:ana@exemplo.com');
  assert.equal(email.de.id, 'url:https://exemplo.com/contato');
});
caso('contas: dados do perfil viram entidades ligadas à conta', async () => {
  const ctx = falso({
    'https://api.github.com/users/fizzy': 404,
    'https://mastodon.social/api/v1/accounts/lookup': { id: '1', url: 'https://mastodon.social/@fizzy', display_name: 'Fizzy Pop', note: '<p>dev em Porto Alegre · fizzy@exemplo.com</p>', fields: [{ value: '<a href="https://fizzy.dev">fizzy.dev</a>' }] },
    'https://t.me/fizzy': { status: 200, texto: '<meta property="og:title" content="Fizzy"><div class="tgme_page_title">Fizzy</div>' },
    'https://steamcommunity.com/': { status: 200, texto: '<response><error>no</error></response>' },
  }, { gh: async () => null });
  const r = await rodar('contas', 'apelido', 'fizzy', ctx);
  const ids = r.entidades.map((e) => e.id);
  for (const id of ['conta:https://mastodon.social/@fizzy', 'pessoa:fizzy pop', 'email:fizzy@exemplo.com', 'url:https://fizzy.dev/', 'conta:https://t.me/fizzy']) assert.ok(ids.includes(id), id + ' em ' + ids);
  assert.ok(!ids.some((i) => /steam/.test(i)), 'Steam sem perfil entrou');
  assert.equal(r.entidades.find((e) => e.id === 'pessoa:fizzy pop').de.valor, 'https://mastodon.social/@fizzy');
});
caso('GitHub: e-mails de commits e GPG (sem noreply), nomes, chaves SSH', async () => {
  const gh = async (c) => ({
    'users/fizzy': { login: 'fizzy', html_url: 'https://github.com/fizzy', name: 'Fizzy', location: 'Recife', followers: 3, created_at: '2020-01-01T00:00:00Z' },
    'users/fizzy/events/public?per_page=100': [{ payload: { commits: [{ author: { email: '1+fizzy@users.noreply.github.com', name: 'Fizzy' } }] } }],
    'users/fizzy/gpg_keys': [{ emails: [{ email: 'fizzy@pessoal.dev' }] }],
  })[c] ?? (c.startsWith('search/commits') ? { total_count: 2, items: [{ commit: { author: { email: 'joao.silva@empresa.com', name: 'João Silva' } }, repository: { full_name: 'empresa/app' } }] } : null);
  const r = await rodar('github', 'apelido', 'fizzy', falso({ 'https://github.com/fizzy.keys': { status: 200, texto: 'ssh-ed25519 AAAA\nssh-rsa BBBB\n' } }, { gh }));
  const ids = r.entidades.map((e) => e.id);
  for (const id of ['email:fizzy@pessoal.dev', 'email:joao.silva@empresa.com', 'pessoa:joão silva', 'local:recife']) assert.ok(ids.includes(id), id + ' em ' + ids);
  assert.ok(!ids.some((i) => /noreply/.test(i)));
  assert.equal(r.props['chaves SSH'], '2 (ssh-ed25519, ssh-rsa)');
  assert.match(r.props['commits achados'], /^2 em empresa\/app/);
});
caso('e-mail no GitHub e repositório', async () => {
  const gh = async (c) => (c.startsWith('search/commits') ? { total_count: 1, items: [{ author: { login: 'fizzy', html_url: 'https://github.com/fizzy' }, commit: { author: { name: 'Fizzy Pop' } }, repository: { full_name: 'fizzy/site' } }] }
    : c === 'repos/fizzy/site' ? { owner: { login: 'fizzy', type: 'User' }, homepage: 'fizzy.dev', language: 'TypeScript', stargazers_count: 5, topics: ['blog'], license: { spdx_id: 'MIT' } }
      : c.startsWith('repos/fizzy/site/contributors') ? [{ login: 'amiga', contributions: 3 }, { login: 'dependabot[bot]', type: 'Bot' }]
        : c.startsWith('repos/fizzy/site/commits') ? [{ commit: { author: { email: 'Fizzy@Pessoal.dev', name: 'Fizzy Pop' } } }] : null);
  const e = await rodar('email-github', 'email', 'fizzy@pessoal.dev', falso({}, { gh }));
  assert.deepEqual(e.entidades.map((x) => x.id).sort(), ['apelido:fizzy', 'conta:https://github.com/fizzy', 'pessoa:fizzy pop', 'url:https://github.com/fizzy/site'].sort());
  const r = await rodar('github-repo', 'url', 'https://github.com/fizzy/site', falso({}, { gh }));
  const ids = r.entidades.map((x) => x.id);
  for (const id of ['apelido:fizzy', 'apelido:amiga', 'dominio:fizzy.dev', 'email:fizzy@pessoal.dev', 'tecnologia:TypeScript']) assert.ok(ids.includes(id), id + ' em ' + ids);
  assert.ok(!ids.some((i) => /bot/.test(i)));
});
caso('IA: os apelidos no texto viram nomes', () => {
  const { mapa } = resumoGrafo(grafo);
  const ref = Object.fromEntries(Object.entries(mapa).map(([r, id]) => [id, r]));
  const r = lerResposta(JSON.stringify({ resumo: `O registrante (${ref.p1}, ${ref.e1}) usa ${ref.d1}.`, hipoteses: [{ texto: `${ref.i1} é compartilhado`, entidades: [ref.i1] }] }), mapa, grafo, TRANSFORMACOES);
  assert.equal(r.resumo, 'O registrante usa exemplo.com.');
  assert.equal(r.hipoteses[0].texto, '10.0.0.5 é compartilhado');
});
caso('pistas: muitos casos de infraestrutura do mesmo tipo viram três mais um resumo', () => {
  const nos = [], ligacoes = [];
  for (let i = 0; i < 6; i++) { nos.push({ id: 'ip' + i, tipo: 'ip', valor: `10.0.0.${i}`, props: {} }); for (let j = 0; j < 2; j++) { nos.push({ id: `d${i}${j}`, tipo: 'dominio', valor: `s${i}${j}.com`, props: {} }); ligacoes.push({ de: `d${i}${j}`, para: 'ip' + i }); } }
  const ds = pensar({ nos, ligacoes }, TRANSFORMACOES).filter((p) => p.tipo === 'descoberta' && /servidor/.test(p.titulo));
  assert.equal(ds.length, 4);
  assert.match(ds[3].titulo, /^Mais 3 casos/);
});

// ---------- CPF, CEP e nomes ----------
caso('CPF: validação, região fiscal, formatos e cruzamento com o sócio mascarado', async () => {
  const { cpfValido, regiaoCPF, cpfCombina, detectar: det } = await import('../lib/entidades.mjs');
  assert.ok(cpfValido('529.982.247-25')); assert.ok(!cpfValido('529.982.247-24')); assert.ok(!cpfValido('111.111.111-11'));
  assert.equal(regiaoCPF('529.982.247-25'), 'ES e RJ');
  assert.equal(det('52998224725'), 'cpf'); assert.equal(det('51999991234'), 'telefone');
  assert.ok(cpfCombina('529.982.247-25', '***982247**')); assert.ok(!cpfCombina('529.982.247-25', '***000000**'));
  const r = await rodar('cpf', 'cpf', '52998224725', falso({}));
  assert.equal(r.entidades.length, 0, 'CPF nunca vai para fora');
  assert.match(r.props['região fiscal de emissão'], /^ES e RJ/);
  const ps = pensar({ nos: [{ id: 'c', tipo: 'cpf', valor: '529.982.247-25', props: {} }, { id: 'p', tipo: 'pessoa', valor: 'Ana', props: { 'CPF na Receita': '***982247**' } }], ligacoes: [] }, TRANSFORMACOES);
  assert.ok(ps.some((p) => p.tipo === 'ligacao' && p.acao.de === 'c' && p.acao.para === 'p' && p.acao.rotulo === 'CPF do sócio'));
});
caso('CEP: endereço e coordenadas', async () => {
  const r = await rodar('cep', 'cep', '95590000', falso({ 'https://brasilapi.com.br/api/cep/v2/95590000': { city: 'Tramandaí', state: 'RS', location: { coordinates: { latitude: '-29.98', longitude: '-50.13' } } } }));
  assert.deepEqual(r.entidades.map((e) => e.valor), ['Tramandaí - RS']);
  assert.equal(r.entidades[0].props.latitude, '-29.98'); assert.match(r.props.abrangência, /cidade inteira/);
});
caso('CNPJ: Minha Receita quando a BrasilAPI falha, CEP e matriz da filial', async () => {
  const ctx = falso({ 'https://brasilapi.com.br/': 404, 'https://minhareceita.org/33000167000282': { razao_social: 'X SA', cep: '20031170', descricao_identificador_matriz_filial: 'FILIAL', opcao_pelo_simples: true, descricao_situacao_cadastral: 'ATIVA', qsa: [] } });
  const r = await rodar('cnpj', 'cnpj', '33.000.167/0002-82', ctx);
  const ids = r.entidades.map((e) => e.id);
  assert.ok(ids.includes('cep:20031-170')); assert.ok(ids.includes('cnpj:33.000.167/0001-01'), 'matriz: ' + ids);
  assert.equal(r.props.regime, 'Simples Nacional');
});
caso('nome: pessoa pública no Wikidata, só se for ser humano', async () => {
  const ctx = falso({
    'https://www.wikidata.org/w/api.php?format=json&action=wbsearchentities': { search: [{ id: 'Q1' }, { id: 'Q2' }] },
    'https://www.wikidata.org/w/api.php?format=json&action=wbgetentities&props=claims|descriptions|labels|sitelinks': { entities: {
      Q1: { id: 'Q1', claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q4830453' } } } }] } },
      Q2: { id: 'Q2', labels: { pt: { value: 'Ana Souza' } }, descriptions: { pt: { value: 'cientista' } }, claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }], P108: [{ mainsnak: { datavalue: { value: { id: 'Q9' } } } }], P2037: [{ mainsnak: { datavalue: { value: 'anasouza' } } }], P569: [{ mainsnak: { datavalue: { value: { time: '+1980-01-01T00:00:00Z' } } } }] } },
    } },
    'https://www.wikidata.org/w/api.php?format=json&action=wbgetentities&props=labels': { entities: { Q9: { labels: { pt: { value: 'UFRGS' } } } } },
  });
  const r = await rodar('pessoa-wikidata', 'pessoa', 'Ana Souza', ctx);
  const ids = r.entidades.map((e) => e.id);
  assert.ok(ids.includes('organizacao:ufrgs') && ids.includes('conta:https://github.com/anasouza'), ids.join(','));
  assert.equal(r.props.nascimento, '1980'); assert.equal(r.props.descrição, 'cientista');
});
caso('nome: primeiro nome sozinho não vai para a busca nem para o GitHub', async () => {
  assert.match((await rodar('web', 'pessoa', 'Josh', falso({}))).aviso, /primeiro nome/);
  assert.match((await rodar('github-nome', 'pessoa', 'Josh', falso({}))).aviso, /nome completo/);
});

caso('busca na web: resultado que não cita o termo sai', async () => {
  const { citaTermo } = await import('../lib/transformacoes.mjs');
  assert.ok(citaTermo({ titulo: 'Fizzy Gamer - YouTube', trecho: '', url: 'https://youtube.com/x' }, 'apelido', '@Fizzy'));
  assert.ok(!citaTermo({ titulo: 'Canva: Visual Suite', trecho: 'design online', url: 'https://www.canva.com/' }, 'apelido', 'Fizzy'));
  assert.ok(citaTermo({ titulo: 'Souza, Ana Maria', trecho: '', url: 'https://x.com' }, 'pessoa', 'Ana Souza'));
  assert.ok(citaTermo({ titulo: 'Contato', trecho: 'ligue (51) 3214-4000', url: 'https://x.com' }, 'telefone', '+555132144000'));
});

caso('busca na web bloqueada: o aviso diz isso e oferece abrir no navegador', async () => {
  const ctx = falso({ 'https://html.duckduckgo.com/': { status: 202, texto: '<html>anomaly detected</html>' }, 'https://www.bing.com/': { status: 200, texto: '<li class="b_algo"><h2><a href="https://canva.com/">Canva</a></h2><p>design</p></li>' } });
  const r = await rodar('web', 'apelido', 'fizzy', ctx);
  assert.equal(r.entidades.length, 0);
  assert.match(r.aviso, /verificação de robô/);
  assert.match(r.props['abrir a busca no navegador'], /^https:\/\/duckduckgo\.com\/\?q=/);
});

await Promise.all(pendentes);
console.log(`testes das novidades do Bluetego: ${ok} de ${pendentes.length} passaram`);
