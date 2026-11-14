// Testes dos dados de contato do site (sem rede): telefones, WhatsApp, e-mails, CNPJ, endereço, schema.org e redes sociais.
// node tests/contatos.test.mjs
import assert from 'node:assert/strict';
import { rodar, contatosDaPagina, enderecosNoTexto, textoDaPagina, TRANSFORMACOES } from '../lib/transformacoes.mjs';
import { normalizar } from '../lib/entidades.mjs';
import { MAQUINAS } from '../lib/maquinas.mjs';

let ok = 0;
const pendentes = [];
const caso = (nome, fn) => pendentes.push(Promise.resolve().then(fn).then(() => ok++, (e) => { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }));

const INICIAL = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","legalName":"Loja Exemplo Comércio Ltda","telephone":"+55 51 3333-4444","taxID":"11.222.333/0001-81","address":{"@type":"PostalAddress","streetAddress":"Av. Brasil, 100","addressLocality":"Porto Alegre","addressRegion":"RS","postalCode":"90000-000"},"sameAs":["https://www.instagram.com/lojaexemplo/","https://www.youtube.com/@lojaexemplo"]}]}</script></head>
<body><a href="https://wa.me/5551999998888?text=oi">WhatsApp</a> <a href="tel:555133334444">ligue</a>
<a href="https://www.facebook.com/lojaexemplo">fb</a> <a href="https://www.facebook.com/sharer/sharer.php?u=x">compartilhar</a> <a href="https://www.instagram.com/p/ABC123/">post</a>
<a href="/fale-conosco">Fale conosco</a> <a href="/blog/novidades">Blog</a> <a href="https://outro.com/contato">outro site</a>
<form><input placeholder="exemplo@mail.com"></form><p>exemplo@mail.com</p></body></html>`;
const CONTATO = `<html><body><footer><p>Loja Exemplo | CNPJ 11.222.333/0001-81</p><p>Rua das Flores, 25 - Centro</p><p>Porto Alegre - RS, CEP 90010-000 – Tel (51) 3333-4444</p><a href="mailto:sac@lojaexemplo.com.br">sac@lojaexemplo.com.br</a></footer></body></html>`;

caso('telefone: 55 sem +, 0 de discagem e o formato com + viram o mesmo número', () => {
  for (const x of ['555133334444', '+55 (51) 3333-4444', '051 3333-4444', '(51) 3333-4444']) assert.equal(normalizar('telefone', x), '+555133334444', x);
  assert.equal(normalizar('telefone', '0800 724 4770'), '08007244770');
});
caso('texto da página: sem script nem estilo, quebras nas linhas certas', () => {
  const t = textoDaPagina('<style>.a{}</style><script>var x="(11) 9999-9999"</script><p>Linha&nbsp;um</p><p>Linha dois</p>');
  assert.equal(t.trim(), 'Linha um\nLinha dois');
});
caso('endereço: a linha do CEP junta a rua da linha de cima e corta o telefone', () => {
  assert.deepEqual(enderecosNoTexto('Rua das Flores, 25 - Centro\nPorto Alegre - RS, CEP 90010-000 – Tel (51) 3333-4444'), ['Rua das Flores, 25 - Centro, Porto Alegre - RS, CEP 90010-000']);
  assert.deepEqual(enderecosNoTexto('Pedido 12345-678 enviado'), [], 'número com traço sem rua não é endereço');
});
caso('página: schema.org, WhatsApp, redes sociais (sem posts e sem compartilhar), e-mail de exemplo fora', () => {
  const c = contatosDaPagina(INICIAL, 'https://lojaexemplo.com.br/');
  assert.deepEqual(c.whats, ['+5551999998888']);
  assert.ok(c.telefones.includes('555133334444') && c.telefones.includes('+55 51 3333-4444'));
  assert.deepEqual(c.cnpjs, ['11.222.333/0001-81']);
  assert.deepEqual(c.nomes, ['Loja Exemplo Comércio Ltda']);
  assert.deepEqual(c.enderecos, ['Av. Brasil, 100, Porto Alegre, RS, 90000-000']);
  assert.deepEqual(c.sociais.sort(), ['https://www.facebook.com/lojaexemplo', 'https://www.instagram.com/lojaexemplo', 'https://www.youtube.com/@lojaexemplo']);
  assert.deepEqual(c.emails, []);
});
caso('site inteiro: lê a inicial e a página de contato do mesmo site, junta tudo sem repetir', async () => {
  const lidas = [];
  const ctx = { limite: 40, async pagina(u) { lidas.push(u); if (u === 'https://lojaexemplo.com.br/') return { status: 200, url: u, texto: INICIAL }; if (u === 'https://lojaexemplo.com.br/fale-conosco') return { status: 200, url: u, texto: CONTATO }; throw new Error('não devia ler ' + u); } };
  const r = await rodar('contatos-site', 'dominio', 'lojaexemplo.com.br', ctx);
  assert.deepEqual(lidas, ['https://lojaexemplo.com.br/', 'https://lojaexemplo.com.br/fale-conosco'], 'blog e outro site não são lidos');
  const por = (t) => r.entidades.filter((e) => e.tipo === t).map((e) => e.valor);
  assert.deepEqual(por('telefone').sort(), ['+555133334444', '+5551999998888']);
  assert.deepEqual(por('cnpj'), ['11.222.333/0001-81']);
  assert.deepEqual(por('email'), ['sac@lojaexemplo.com.br']);
  assert.equal(por('local').length, 2);
  assert.equal(r.entidades.find((e) => e.valor === '+5551999998888').ligacao, 'WhatsApp do site');
  assert.equal(r.props['redes sociais'], 3);
});
caso('site que bloqueia robôs: aviso claro, sem erro', async () => {
  const r = await rodar('contatos-site', 'dominio', 'bloqueado.com.br', { async pagina() { return { status: 403, texto: 'Forbidden' }; } });
  assert.equal(r.entidades.length, 0); assert.match(r.aviso, /403, provável proteção contra robôs/);
});
caso('também serve para URL, e a Pegada do domínio usa (com a razão social do CNPJ)', () => {
  assert.deepEqual(TRANSFORMACOES.find((t) => t.id === 'contatos-site').de, ['dominio', 'url']);
  const ts = MAQUINAS.find((m) => m.id === 'pegada-dominio').passos.map((p) => p.t);
  assert.ok(ts.includes('contatos-site') && ts.indexOf('cnpj') > ts.indexOf('contatos-site'));
});

await Promise.all(pendentes);
console.log(`testes dos contatos do site do Bluetego: ${ok} de ${pendentes.length} passaram`);
