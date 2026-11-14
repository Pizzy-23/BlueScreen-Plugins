// Testes da verificação de integridade por CPF e CNPJ (sem rede): TCU e Portal da Transparência (formato da
// especificação oficial da API), sem chave pedindo o Cofre, e o que o Bluetego se recusa a consultar.
// node tests/integridade.test.mjs
import assert from 'node:assert/strict';
import { rodar, TRANSFORMACOES } from '../lib/transformacoes.mjs';
import { INICIO } from '../lib/inicio.mjs';

let ok = 0;
const pendentes = [];
const caso = (nome, fn) => pendentes.push(Promise.resolve().then(fn).then(() => ok++, (e) => { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }));
const CPF = '111.444.777-35';

caso('TCU pelo CPF: consulta pelo CPF formatado, condenação vira alerta com o nome publicado pelo tribunal', async () => {
  const pedidos = [];
  const ctx = { async json(u) { pedidos.push(decodeURIComponent(u)); return { items: /inabilitados/.test(u) ? [{ nome: 'JOAO DA SILVA', cpf: CPF, processo: '000.1/2025-0', deliberacao: 'AC-1/2026-PL', data_transito_julgado: '2026-01-01T03:00:00Z', data_final: '2031-01-01T03:00:00Z', uf: 'SP', municipio: 'DIADEMA' }] : [] }; } };
  const r = await rodar('cpf-tcu', 'cpf', CPF, ctx);
  assert.ok(pedidos.every((p) => p.includes('{"cpf":"111.444.777-35"}')));
  assert.equal(r.alerta, true);
  assert.deepEqual(r.entidades.map((e) => `${e.tipo}:${e.valor}`).sort(), ['local:DIADEMA - SP', 'organizacao:Tribunal de Contas da União', 'pessoa:Joao da Silva']);
  assert.match(r.props.TCU, /inabilitado até 2031-01-01/);
  const limpo = await rodar('cpf-tcu', 'cpf', CPF, { async json() { return { items: [] }; } });
  assert.equal(limpo.props.TCU, 'nada consta'); assert.equal(limpo.entidades.length, 0);
});

const resposta = (j) => ({ status: 200, ok: true, json: async () => j });
caso('Portal da Transparência: sanção, expulsão, PEP, servidor e contrato pelo CPF; a chave vai no cabeçalho pelo Cofre', async () => {
  const pedidos = [];
  const ctx = { async cofre(url, cab) {
    pedidos.push({ url, cab });
    if (/\/ceis\?/.test(url)) return resposta([{ tipoSancao: { descricaoResumida: 'Impedimento' }, orgaoSancionador: { nome: 'MINISTERIO DA SAUDE' }, sancionado: { nome: 'JOAO DA SILVA' }, dataInicioSancao: '01/02/2025', dataFimSancao: '01/02/2027', numeroProcesso: '123' }]);
    if (/\/ceaf\?/.test(url)) return resposta([{ tipoPunicao: { descricao: 'Demissão' }, orgaoLotacao: { nome: 'INSS' }, punicao: { nomePunido: 'JOAO DA SILVA', portaria: 'P 1' } }]);
    if (/\/peps\?/.test(url)) return resposta([{ nome: 'JOAO DA SILVA', descricao_funcao: 'PREFEITO', nome_orgao: 'PREFEITURA DE X', dt_inicio_exercicio: '01/01/2021' }]);
    if (/\/servidores\?/.test(url)) return resposta([{ servidor: { situacao: 'ATIVO', pessoa: { nome: 'JOAO DA SILVA' }, orgaoServidorExercicio: { nome: 'UNIVERSIDADE FEDERAL DE Y' }, funcao: { descricaoFuncaoCargo: 'PROFESSOR' } } }]);
    if (/contratos\/cpf-cnpj/.test(url)) return resposta([{ numero: '10/2025', objeto: 'Consultoria', valorFinalCompra: 5000, unidadeGestora: { orgaoMaximo: { nome: 'MINISTERIO DA EDUCACAO' } } }]);
    return resposta([]);
  } };
  const r = await rodar('transparencia', 'cpf', CPF, ctx);
  assert.equal(pedidos.length, 6);
  assert.ok(pedidos.every((p) => p.cab['chave-api-dados'] === '{{vault:bluetego.transparencia}}'));
  assert.ok(pedidos.some((p) => p.url.includes('peps?cpf=11144477735')));
  assert.ok(!pedidos.some((p) => /pessoa-fisica|remuneracao|viagens|cartoes|bolsa/.test(p.url)), 'cadastro de pessoa física e benefícios sociais nunca');
  assert.equal(r.alerta, true);
  const lig = Object.fromEntries(r.entidades.map((e) => [e.valor, e.ligacao]));
  assert.match(lig['Ministerio da Saude'], /CEIS: Impedimento/);
  assert.match(lig['Inss'], /expulso/);
  assert.match(lig['Prefeitura de X'], /politicamente exposta: prefeito/);
  assert.match(lig['Universidade Federal de Y'], /servidor\(a\) federal \(ativo\)/);
  assert.equal(lig['Ministerio da Educacao'], 'contrato com o governo federal');
  assert.equal(r.entidades.filter((e) => e.tipo === 'pessoa').length, 1);
  assert.equal(r.props['pessoa politicamente exposta'], 'sim');
  assert.equal(r.props['sanções (CNEP)'], 'nada consta');
});
caso('Portal da Transparência para CNPJ: só sanções e contratos (PEP, servidor e CEAF são de pessoa)', async () => {
  const urls = [];
  const r = await rodar('transparencia', 'cnpj', '11.222.333/0001-81', { async cofre(u) { urls.push(u); return resposta([]); } });
  assert.equal(urls.length, 3);
  assert.equal(r.props['contratos com o governo federal'], 'nada consta');
  assert.equal(r.props['pessoa politicamente exposta'], undefined);
});
caso('sem chave no Cofre: pede a chave (código cofre) em vez de falhar calado', async () => {
  await assert.rejects(rodar('transparencia', 'cpf', CPF, { async cofre() { throw new Error('sem cofre'); } }), (e) => e.codigo === 'cofre' || (e.data && e.data.codigo === 'cofre') || /Cofre/.test(e.message));
  await assert.rejects(rodar('transparencia', 'cpf', CPF, { async cofre() { return { status: 401, ok: false }; } }), /recusou a chave/);
});
caso('CPF: nada de dono — nenhuma transformação de CPF consulta cadastro, web ou dorks; o primeiro olhar não usa o Cofre', () => {
  const deCpf = TRANSFORMACOES.filter((t) => t.de.includes('cpf')).map((t) => t.id).sort();
  assert.deepEqual(deCpf, ['cpf', 'cpf-tcu', 'sancoes-br', 'transparencia']);
  assert.deepEqual(INICIO.cpf.map((p) => p.t), ['cpf', 'cpf-tcu', 'sancoes-br']);
});

await Promise.all(pendentes);
console.log(`testes da integridade por CPF e CNPJ do Bluetego: ${ok} de ${pendentes.length} passaram`);
