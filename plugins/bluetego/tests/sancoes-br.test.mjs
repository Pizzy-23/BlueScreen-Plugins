// Testes das sanções e condenações no Brasil por CPF/CNPJ (sem rede): CGU (CEIS/CNEP em ZIP), TCU (contas
// irregulares), IBAMA, lista suja do trabalho escravo, improbidade (CNJ) e TCE-RS. node tests/sancoes-br.test.mjs
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { rodar } from '../lib/transformacoes.mjs';
import { primeiroDoZip } from '../lib/sancoes-br.mjs';

let ok = 0;
const pendentes = [];
const caso = (nome, fn) => pendentes.push(Promise.resolve().then(fn).then(() => ok++, (e) => { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }));

// um ZIP de um arquivo só, como os do CGU (método 8, deflate)
function zip(nome, conteudo) {
  const dados = zlib.deflateRawSync(conteudo), n = Buffer.from(nome);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(dados.length, 18); local.writeUInt32LE(conteudo.length, 22); local.writeUInt16LE(n.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(dados.length, 20); cd.writeUInt32LE(conteudo.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(0, 42);
  const corpo = Buffer.concat([local, n, dados]);
  const fim = Buffer.alloc(22); fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(1, 8); fim.writeUInt16LE(1, 10); fim.writeUInt32LE(46 + n.length, 12); fim.writeUInt32LE(corpo.length, 16);
  return Buffer.concat([corpo, cd, n, fim]);
}
const CPF = '111.444.777-35', D = '11144477735';
const cab = '"CADASTRO";"TIPO DE PESSOA";"CPF OU CNPJ DO SANCIONADO";"NOME DO SANCIONADO";"NÚMERO DO PROCESSO";"CATEGORIA DA SANÇÃO";"VALOR DA MULTA";"DATA INÍCIO SANÇÃO";"DATA FINAL SANÇÃO";"ÓRGÃO SANCIONADOR";"ORIGEM INFORMAÇÕES"\r\n';
const ceis = Buffer.from(cab + `"CEIS";"F";"${D}";"JOÃO DA SILVA";"123";"Impedimento/proibição de contratar";"";"01/02/2025";"01/02/2027";"PREFEITURA DE X";"CGU"\r\n`, 'latin1');
const cnep = Buffer.from(cab, 'latin1');

function contexto(extra = {}) {
  const pedidos = [];
  return {
    pedidos,
    async pagina(url) { pedidos.push(url); return { status: 200, texto: '<script>arquivos.push({"ano" : "2026", "mes" : "11", "dia" : "13", "origem" :  "CEIS"});arquivos.push({"ano" : "2026", "mes" : "11", "dia" : "12", "origem" :  "CEIS"});</script>' }; },
    async binario(url) {
      pedidos.push(url);
      if (/download-de-dados\/ceis\/20261113$/.test(url)) return { status: 200, dados: zip('20261113_CEIS.csv', ceis) };
      if (/download-de-dados\/cnep\/20261113$/.test(url)) return { status: 200, dados: zip('20261113_CNEP.csv', cnep) };
      if (/cadastro_de_empregadores/.test(url)) return { status: 200, dados: Buffer.from(`ID;Ano da ação fiscal;UF;Empregador;CNPJ/CPF;Estabelecimento;Trabalhadores envolvidos;CNAE;Decisão administrativa de procedência;Inclusão no Cadastro de Empregadores\n1;2024;PA;FAZENDA Y;${CPF};Fazenda Y;12;0151;01/01/2025;04/2025\n`, 'latin1') };
      if (/tce\.rs/.test(url)) return { status: 200, dados: Buffer.from('﻿DATA_ATUALIZACAO,NOME,CPF,TEXTO_ACORDAO,TEXTO_COLEGIADO,LINK_ACORDAO,NR_PROCESSO,DT_TRANSITO_JULGADO,VALOR_DA_ORDENACAO,CD_ORGAO,NOME_ORGAO,EXERCICIO\n2026-11-13,FULANO,111.444.777/35,x,y,http://a,1/2020,2021-01-01,"1000,00",1,PREFEITURA Z,2019\n') };
      throw new Error('sem rota ' + url);
    },
    async post(url, corpo) { pedidos.push(url + ' ' + JSON.stringify(corpo)); return { totalElementos: 0, elementos: [] }; },
    async json(url) { pedidos.push(url); return { features: [] }; },
    async form(url, corpo) { pedidos.push(url + ' ' + corpo); return "+:var res = '<table><tr><td colspan=4 class=\\'msgmErro\\'>Nenhum Requerido encontrado.</td></tr></table>';"; },
    ...extra,
  };
}

caso('ZIP: abre o primeiro arquivo sem dependência', () => {
  assert.equal(primeiroDoZip(zip('a.csv', Buffer.from('olá mundo'))).toString(), 'olá mundo');
  assert.throws(() => primeiroDoZip(Buffer.from('não é zip')));
});
caso('CPF: CEIS (arquivo mais recente do CGU) e lista suja; o nome vem só da lista que o publica; resto "nada consta"', async () => {
  const ctx = contexto();
  const r = await rodar('sancoes-br', 'cpf', CPF, ctx);
  assert.ok(ctx.pedidos.some((p) => /ceis\/20261113$/.test(p)), 'pega a data mais recente');
  assert.equal(r.alerta, true);
  assert.equal(r.props.CEIS, 'consta (1)');
  assert.equal(r.props['trabalho escravo (MTE)'], 'consta (1)');
  assert.equal(r.props.CNEP, 'nada consta');
  assert.equal(r.props['improbidade (CNJ)'], 'nada consta');
  assert.equal(r.props['TCE-RS (contas irregulares)'], 'consta (1)', 'lê o CPF no formato 999.999.999/99 do TCE-RS');
  const lig = r.entidades.map((e) => `${e.tipo}:${e.valor}:${e.ligacao}`);
  assert.ok(lig.some((x) => /^organizacao:Prefeitura de X:sancionado\(a\) no CEIS: impedimento/.test(x)));
  assert.ok(lig.some((x) => /^pessoa:João da Silva:nome publicado na lista de sanção$/.test(x)));
  // consultas: TCU com o CPF formatado, IBAMA com as duas formas, CNJ com só dígitos e tipo F
  assert.ok(ctx.pedidos.some((p) => p.includes('contas-irregulares') && p.includes(`{"cpf":"${CPF}"}`)));
  assert.ok(ctx.pedidos.some((p) => decodeURIComponent(p).includes(`cpf_cnpj_infrator IN ('${CPF}','${D}')`)));
  assert.ok(ctx.pedidos.some((p) => p.includes(`rsargs[]=${D}&rsargs[]=&rsargs[]=F`)));
});
caso('IBAMA: soma só os autos não cancelados', async () => {
  const ctx = contexto({ async json(url) { if (/auto_infracao/.test(url)) return { features: [{ attributes: { val_auto_infracao: 1000, des_infracao: 'Desmatar', dat_hora_auto_infracao: Date.UTC(2025, 0, 2), municipio: 'Altamira', uf: 'PA', sit_cancelado: 'N', nome_infrator: 'FULANO' } }, { attributes: { val_auto_infracao: 99, sit_cancelado: 'S' } }] }; return { features: [] }; } });
  const r = await rodar('sancoes-br', 'cpf', '529.982.247-25', ctx);
  assert.equal(r.props['IBAMA (autos de infração)'], 'consta (1)', 'o cancelado não conta');
  assert.match(r.entidades.find((e) => e.valor === 'IBAMA').props['valor somado'], /1.000/);
});
caso('CNIA: condenação com o link e o processo; resposta estranha vira "não respondeu", não "nada consta"', async () => {
  const html = "+:var res = '<table><tr><td><a href=\\'visualizar_condenacao.php?seq_condenacao=54590\\' class=\\'link\\'>FULANO</a></td><td>CPF</td><td><a href=\\'visualizar_processo.php?seq_processo=1\\' class=\\'link\\'>00017598420078260638</a></td></tr></table><td>Número de registros: 1</td>';";
  const r = await rodar('sancoes-br', 'cnpj', '11.222.333/0001-81', contexto({ async form() { return html; } }));
  assert.equal(r.props['improbidade (CNJ)'], 'consta (1)');
  const c = r.entidades.find((e) => e.valor === 'Conselho Nacional de Justiça');
  assert.equal(c.props.processos, '00017598420078260638');
  assert.match(c.props.condenação, /seq_condenacao=54590$/);
  const e = await rodar('sancoes-br', 'cnpj', '11.222.333/0001-81', contexto({ async form() { return 'página mudou'; } }));
  assert.equal(e.props['improbidade (CNJ)'], 'não respondeu');
  assert.equal(e.props['TCE-RS (contas irregulares)'], undefined, 'TCE-RS só para CPF');
});
caso('todas as fontes fora do ar: erro claro em vez de "nada consta"', async () => {
  const quebra = async () => { throw new Error('fora'); };
  await assert.rejects(rodar('sancoes-br', 'cnpj', '11.222.333/0001-81', { pagina: quebra, binario: quebra, post: quebra, json: quebra, form: quebra }), /Nenhuma das listas/);
});

await Promise.all(pendentes);
console.log(`testes das sanções no Brasil do Bluetego: ${ok} de ${pendentes.length} passaram`);
