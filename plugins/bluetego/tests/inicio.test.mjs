// Testes do primeiro olhar (sem rede): a poda dos resultados e a coerência dos roteiros com o catálogo.
// node tests/inicio.test.mjs
import assert from 'node:assert/strict';
import { INICIO, podar } from '../lib/inicio.mjs';
import { TRANSFORMACOES } from '../lib/transformacoes.mjs';

let ok = 0;
const pendentes = [];
const caso = (nome, fn) => pendentes.push(Promise.resolve().then(fn).then(() => ok++, (e) => { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }));
const e = (tipo, valor, extra = {}) => ({ tipo, valor, id: `${tipo}:${valor}`, ligacao: 'x', ...extra });

caso('poda: alerta fica mesmo além do limite e vem primeiro; o resto conta', () => {
  const r = { entidades: [e('url', 'a'), e('url', 'b'), e('url', 'c'), e('organizacao', 'OFAC', { alerta: true })], props: { p: 1 } };
  const p = podar(r, { lim: 1 });
  assert.deepEqual(p.entidades.map((x) => x.valor), ['a', 'OFAC'], 'na ordem original');
  assert.equal(p.podados, 2);
  assert.deepEqual(p.props, { p: 1 });
});
caso('poda: só os tipos pedidos; [] deixa só as propriedades', () => {
  const r = { entidades: [e('local', 'SP'), e('conta', 'https://wa.me/1'), e('organizacao', 'TIM')] };
  assert.deepEqual(podar(r, { so: ['local', 'organizacao'] }).entidades.map((x) => x.valor), ['SP', 'TIM']);
  assert.equal(podar(r, { so: [] }).entidades.length, 0);
  assert.equal(podar(r, { so: [] }).podados, 3);
});
caso('poda: quem pendia de uma entidade podada se liga direto à origem (senão a página recriaria a podada)', () => {
  const rede = e('rede', '1.2.3.0/24');
  const r = { entidades: [rede, e('asn', 'AS1', { de: { tipo: 'rede', valor: '1.2.3.0/24', id: rede.id } })] };
  const p = podar(r, { lim: 1, so: ['asn'] });
  assert.deepEqual(p.entidades.map((x) => x.valor), ['AS1']);
  assert.equal(p.entidades[0].de, undefined);
  assert.equal(p.podados, 1);
  // pai que não veio no resultado (é a própria entidade de origem ou já está no grafo) não derruba o filho
  const r2 = { entidades: [e('url', 'y', { de: { tipo: 'conta', valor: 'c', id: 'conta:c' } })] };
  assert.equal(podar(r2, { lim: 5 }).entidades.length, 1);
});
caso('poda: sem pedido ou resultado vazio passa igual', () => {
  const r = { entidades: [e('url', 'a')] };
  assert.equal(podar(r, null), r);
  assert.equal(podar(null, { lim: 1 }), null);
  assert.equal(podar({ entidades: [] }, { lim: 1 }).podados, 0);
});

// fontes que trazem homônimos ou dezenas de itens soltos não entram no primeiro olhar
const BARULHENTAS = new Set(['contas-amplo', 'nome-apelidos', 'emails-provaveis', 'github-nome', 'bluesky-busca', 'fediverso', 'stackexchange', 'launchpad', 'wikipedia', 'subdominios', 'parecidos', 'mesmo-ip', 'explorar-site', 'documentos', 'wayback', 'common-crawl', 'certificado', 'dorks', 'tellows', 'imprensa', 'github-rede']);
const PEQUENAS = new Set(['ibge-nome', 'sancoes', 'tcu', 'url-dominio', 'cpf', 'cpf-tcu']);
caso('roteiros coerentes com o catálogo: existem, servem, são curtos e podados', () => {
  for (const [tipo, passos] of Object.entries(INICIO)) {
    assert.ok(passos.length && passos.length <= 12, `${tipo}: roteiro curto`);
    const primeiro = TRANSFORMACOES.find((t) => t.id === passos[0].t);
    assert.ok(primeiro.de.includes(tipo), `${tipo}: o primeiro passo serve para o tipo`);
    for (const p of passos) {
      const t = TRANSFORMACOES.find((x) => x.id === p.t);
      const onde = `${tipo} → ${p.t}`;
      assert.ok(t, `${onde}: não existe`);
      assert.ok(!t.cofre, `${onde}: precisa do Cofre`);
      assert.ok(!BARULHENTAS.has(p.t), `${onde}: barulhenta demais para o primeiro olhar`);
      assert.ok(Number.isInteger(p.max) && p.max >= 1 && p.max <= 2, `${onde}: max entre 1 e 2`);
      if (p.tipos) assert.ok(p.tipos.every((x) => t.de.includes(x)), `${onde}: tipos que a transformação não aceita`);
      if (p.t === 'web') assert.ok(p.tipos && !p.tipos.includes('pessoa'), `${onde}: busca na web por nome traz homônimos`);
      assert.ok(PEQUENAS.has(p.t) || p.lim != null || Array.isArray(p.so), `${onde}: precisa de lim ou so (o resultado pode crescer)`);
    }
  }
});
caso('tipos principais têm primeiro olhar', () => {
  for (const t of ['pessoa', 'telefone', 'dominio', 'url', 'email', 'apelido', 'ip', 'cnpj', 'organizacao']) assert.ok(INICIO[t], t);
});

await Promise.all(pendentes);
console.log(`testes do primeiro olhar do Bluetego: ${ok} de ${pendentes.length} passaram`);
