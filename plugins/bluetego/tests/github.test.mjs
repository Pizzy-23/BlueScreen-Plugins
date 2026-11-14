// Testes da investigação dos commits no GitHub (sem rede): fuso real, horários, identidades, computador vazado,
// coautores, robôs e IA, repositórios de terceiros e datas forjadas. node tests/github.test.mjs
import assert from 'node:assert/strict';
import { rodar } from '../lib/transformacoes.mjs';
import { lerDataCommit, trailers, analisarCommits } from '../lib/github.mjs';

let ok = 0;
const pendentes = [];
const caso = (nome, fn) => pendentes.push(Promise.resolve().then(fn).then(() => ok++, (e) => { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }));

const commit = (data, email, nome, repo, msg = 'corrige o login', dono = repo.split('/')[0]) => ({ html_url: 'https://github.com/' + repo + '/commit/1', repository: { full_name: repo, owner: { login: dono } }, commit: { author: { date: data, email, name: nome }, committer: { date: data, email: 'noreply@github.com', name: 'GitHub' }, message: msg } });

caso('data do commit: hora e dia locais, fuso; datas impossíveis (forjadas) fora', () => {
  assert.deepEqual(lerDataCommit('2024-05-03T22:10:00.000-03:00'), { quando: Date.parse('2024-05-03T22:10:00.000-03:00'), hora: 22, dia: 5, fuso: '-03:00', data: '2024-05-03' });
  assert.equal(lerDataCommit('2024-05-03T22:10:00Z').fuso, '+00:00');
  assert.equal(lerDataCommit('2099-12-31T23:59:59.000+03:00'), null, 'futuro');
  assert.equal(lerDataCommit('1990-01-01T00:00:00Z'), null, 'antes do Git');
  assert.equal(lerDataCommit('lixo'), null);
});
caso('linhas de assinatura: coautor e signed-off-by com e-mail', () => {
  assert.deepEqual(trailers('arruma\n\nCo-authored-by: Ana Souza <Ana@Ex.com>\nSigned-off-by: João <joao@ex.com>\nSem e-mail: X'), [{ papel: 'co-authored-by', nome: 'Ana Souza', email: 'ana@ex.com' }, { papel: 'signed-off-by', nome: 'João', email: 'joao@ex.com' }]);
});
caso('retrato: janela de horário, fim de semana, idioma e fuso de cada e-mail', () => {
  const itens = [];
  for (let i = 0; i < 8; i++) itens.push(commit(`2024-05-0${(i % 5) + 1}T2${i % 3}:00:00.000-03:00`, 'ana@ex.com', 'Ana Souza', 'ana/app', 'adiciona tela de login'));
  itens.push(commit('2024-05-04T10:00:00.000+01:00', 'bob@ex.com', 'Bob', 'ana/app', 'fix build'));
  const a = analisarCommits(itens, 'ana');
  assert.equal(a.total, 9);
  assert.equal(a.fusos[0][0], '-03:00');
  assert.equal(a.janela[0] <= 20 && a.janela[1] >= 22 % 24, true);
  assert.equal(a.idioma, 'português');
  assert.equal(a.fusoPor.get('bob@ex.com').get('+01:00'), 1);
  assert.equal(a.proprios, 9);
});
caso('usuário: fuso vira local, computador vazado vira alerta, robôs e IA à parte, repositório de terceiro', async () => {
  const itens = [];
  for (let i = 0; i < 6; i++) itens.push(commit(`2024-06-1${i}T21:00:00.000-03:00`, 'ana@ex.com', 'Ana Souza', 'ana/app', 'corrige bug\n\nCo-authored-by: Claude <noreply@anthropic.com>\nCo-authored-by: Carlos Lima <carlos@ex.com>'));
  itens.push(commit('2024-06-20T21:00:00.000-03:00', 'ana@DESKTOP-7QK2L.localdomain', 'ana', 'outra/lib', 'ajusta'));
  itens.push(commit('2024-06-21T21:00:00.000-03:00', '49699333+dependabot[bot]@users.noreply.github.com', 'dependabot[bot]', 'ana/app', 'bump x'));
  const pedidos = [];
  const ctx = { async gh(c) { pedidos.push(c); if (c.startsWith('search/commits')) return { items: itens }; if (c.startsWith('repos/ana/app/commits')) return [{ commit: { verification: { verified: true } } }, { commit: { verification: { verified: false } } }]; return null; } };
  const r = await rodar('github-commits', 'apelido', 'ana', ctx);
  assert.match(decodeURIComponent(pedidos[0]), /q=author:ana&/);
  const v = (t) => r.entidades.filter((e) => e.tipo === t).map((e) => e.valor);
  assert.ok(v('local')[0].startsWith('UTC-03:00: Brasil'));
  assert.equal(v('texto').length, 1); assert.match(v('texto')[0], /^desktop-7qk2l\.localdomain$/i);
  assert.equal(r.entidades.find((e) => e.tipo === 'texto').alerta, true);
  assert.ok(v('email').includes('ana@ex.com') && v('email').includes('carlos@ex.com'));
  assert.ok(!v('email').includes('noreply@anthropic.com'), 'IA não é pessoa');
  assert.match(r.props['robôs e IA nos commits'], /Claude/);
  assert.ok(v('url').includes('https://github.com/outra/lib'));
  assert.equal(r.props.assinatura, '50% assinados e verificados (2 commits de ana/app)');
  assert.equal(r.entidades.find((e) => e.tipo === 'pessoa' && /ana souza/i.test(e.valor)).de.tipo, 'email', 'o nome fica ligado ao e-mail');
});
caso('repositório: busca com a data no lugar do texto obrigatório; privado dá aviso claro', async () => {
  let q = '';
  const r = await rodar('github-commits', 'url', 'https://github.com/ana/app', { async gh(c) { if (c.startsWith('search')) { q = decodeURIComponent(c); return { items: [commit('2024-06-10T09:00:00.000+09:00', 'ken@ex.jp', 'Ken Sato', 'ana/app')] }; } return []; } });
  assert.match(q, /repo:ana\/app committer-date:>2005-01-01/);
  assert.equal(r.entidades.find((e) => e.valor === 'ken@ex.jp').props.fuso, 'UTC+09:00 (Japão, Coreia do Sul)');
  const p = await rodar('github-commits', 'url', 'https://github.com/ana/privado', { async gh() { throw new Error('api.github.com respondeu 422.'); } });
  assert.match(p.aviso, /privado/);
  const fora = await rodar('github-commits', 'url', 'https://gitlab.com/ana/app', {});
  assert.match(fora.aviso, /GitHub/);
});
caso('e-mail e usuário sem commits: aviso, sem erro', async () => {
  const ctx = { async gh() { return { items: [] }; } };
  assert.match((await rodar('github-commits', 'email', 'ninguem@ex.com', ctx)).aviso, /Nenhum commit/);
  assert.match((await rodar('github-commits', 'apelido', 'ninguem', ctx)).aviso, /Nenhum commit/);
});

await Promise.all(pendentes);
console.log(`testes dos commits do GitHub no Bluetego: ${ok} de ${pendentes.length} passaram`);
