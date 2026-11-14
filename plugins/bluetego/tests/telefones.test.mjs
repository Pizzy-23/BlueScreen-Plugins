// Testes das fontes de telefone da 0.6 (sem rede): celular no formato antigo, operadora original e cidade (libphonenumber),
// Wikidata, OpenStreetMap e tellows. node tests/telefones.test.mjs
import assert from 'node:assert/strict';
import { rodar } from '../lib/transformacoes.mjs';
import { detectar, normalizar, telefoneInfo } from '../lib/entidades.mjs';
import { numeracao } from '../lib/numeracao.mjs';
import { MAQUINAS } from '../lib/maquinas.mjs';

let ok = 0;
const pendentes = [];
const caso = (nome, fn) => pendentes.push(Promise.resolve().then(fn).then(() => ok++, (e) => { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }));

caso('celular de 8 dígitos (antes do nono dígito) vira o número de hoje, e as formas antigas entram na busca', () => {
  for (const x of ['5199553811', '(51) 9955-3811', '+555199553811']) {
    assert.equal(detectar(x), 'telefone', x);
    assert.equal(normalizar('telefone', x), '+5551999553811', x);
  }
  const i = telefoneInfo('5199553811');
  assert.equal(i.tipo, 'celular'); assert.equal(i.antigo, '(51) 9955-3811');
  assert.ok(i.formatos.includes('5199553811') && i.formatos.includes('(51) 99955-3811'));
  assert.equal(normalizar('telefone', '(51) 3333-4444'), '+555133334444', 'fixo continua fixo');
  assert.equal(detectar('5119553811'), 'texto', '3º dígito 1 não é telefone');
  assert.equal(telefoneInfo('(51) 3333-4444').antigo, undefined);
});
caso('numeração: operadora original e cidade pelo maior prefixo, sem rede', () => {
  assert.equal(numeracao('5511981967825').operadora, 'TIM');
  assert.equal(numeracao('5551999553811').operadora, 'Vivo');
  assert.equal(numeracao('555136010000').cidade, 'Osório - RS');
  assert.deepEqual(numeracao('351912345678'), { operadora: '', cidade: '' });
});
caso('transformação telefone: operadora vira organização, fixo ganha a cidade, sem "Brasil" solto', async () => {
  const c = await rodar('telefone', 'telefone', '5199553811', {});
  assert.ok(c.entidades.some((e) => e.tipo === 'organizacao' && e.valor === 'Vivo'));
  assert.ok(!c.entidades.some((e) => e.valor === 'Brasil'));
  assert.match(c.props['formato antigo'], /\(51\) 9955-3811/);
  const f = await rodar('telefone', 'telefone', '+55 51 3601-0000', {});
  assert.ok(f.entidades.some((e) => e.tipo === 'local' && e.valor === 'Osório - RS'));
});
caso('Wikidata: confere o DDD (os 8 dígitos podem repetir em outro estado)', async () => {
  let pedido = '';
  const ctx = { async json(u) { pedido = decodeURIComponent(u); return { results: { bindings: [
    { i: { value: 'http://www.wikidata.org/entity/Q1' }, iLabel: { value: 'Museu Certo' }, t: { value: '+55 (14) 3491-2202' }, site: { value: 'https://museu.org.br/' } },
    { i: { value: 'http://www.wikidata.org/entity/Q2' }, iLabel: { value: 'Outro Estado' }, t: { value: '+55 21 3491-2202' } },
  ] } }; } };
  const r = await rodar('telefone-wikidata', 'telefone', '+55 14 3491-2202', ctx);
  assert.match(pedido, /3\[\^0-9\]\?4\[\^0-9\]\?9/);
  assert.deepEqual(r.entidades.map((e) => e.valor), ['Museu Certo', 'https://museu.org.br/']);
});
caso('OpenStreetMap: regex POSIX com o nono dígito opcional, no estado do DDD; servidor de reserva', async () => {
  const pedidos = [];
  const ctx = { async json(u) { pedidos.push(decodeURIComponent(u)); if (pedidos.length === 1) throw new Error('502'); return { elements: [{ type: 'node', id: 7, lat: -28.8, lon: -51.8, tags: { name: 'Prefeitura', amenity: 'townhall', 'addr:street': 'Avenida Sílvio Sanson', 'addr:housenumber': '1135', website: 'https://pref.rs.gov.br' } }, { type: 'node', id: 8, tags: { phone: 'x' } }] }; } };
  const r = await rodar('telefone-osm', 'telefone', '5199553811', ctx);
  assert.match(pedidos[0], /BR-RS/); assert.match(pedidos[0], /51\[\^0-9\]\{0,3\}9\?/); assert.ok(!/\\D/.test(pedidos[0]));
  assert.match(pedidos[1], /maps\.mail\.ru/);
  assert.deepEqual(r.entidades.map((e) => e.tipo), ['organizacao', 'local', 'url']);
  assert.equal(r.entidades[0].props.mapa, 'https://www.openstreetmap.org/node/7');
});
caso('tellows: nota, avaliações e categoria; sem avaliação não inventa nota; comentários ficam de fora', async () => {
  const ld = { '@type': 'AggregateRating', itemReviewed: { description: 'Número de telefone +5511999999999 de São Paulo, SP marcado como Tentativa de golpe 9 vezes' }, ratingValue: '8', ratingCount: '27' };
  const r = await rodar('tellows', 'telefone', '11 99999-9999', { async pagina() { return { status: 200, texto: `<script type="application/ld+json">${JSON.stringify(ld)}</script><p>Pesquisas: <b>12925</b></p><p class="comentario">Fulano de Tal me ligou</p>` }; } });
  assert.equal(r.alerta, true);
  assert.equal(r.props.categoria, 'Tentativa de golpe'); assert.equal(r.props['pesquisas no tellows'], '12925');
  assert.ok(!JSON.stringify(r).includes('Fulano'));
  const v = await rodar('tellows', 'telefone', '11 98196-7825', { async pagina() { return { status: 200, texto: 'este número de telefone ainda não foi avaliado!' }; } });
  assert.equal(v.props.tellows, 'sem avaliações'); assert.equal(v.alerta, false);
});
caso('o Rastro do telefone usa Wikidata e OpenStreetMap; o tellows fica à mão (cada consulta aumenta o contador público)', () => {
  const ts = MAQUINAS.find((m) => m.id === 'telefone').passos.map((p) => p.t);
  assert.ok(ts.includes('telefone-wikidata') && ts.includes('telefone-osm') && !ts.includes('tellows'));
});

await Promise.all(pendentes);
console.log(`testes das fontes de telefone do Bluetego: ${ok} de ${pendentes.length} passaram`);
