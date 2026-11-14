// Testes da pegada da empresa pelo CNPJ (sem rede): PNCP e Compras.gov, BNDES, registro.br, órgãos reguladores
// (CVM, Banco Central, ANEEL, ANTT, ANS), Diário Oficial e o histórico de tributação. node tests/empresa.test.mjs
import assert from 'node:assert/strict';
import { rodar } from '../lib/transformacoes.mjs';

let ok = 0;
const pendentes = [];
const caso = (nome, fn) => pendentes.push(Promise.resolve().then(fn).then(() => ok++, (e) => { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }));
const CNPJ = '11.222.333/0001-81', D = '11222333000181';
// os arquivos inteiros (CVM, ANS) ficam num cache do módulo: todos os testes usam o mesmo conteúdo
const cvm = 'CNPJ_CIA;DENOM_SOCIAL;SIT;TP_MERC;CD_CVM;SETOR_ATIV;CONTROLE_ACIONARIO;CATEG_REG;CNPJ_AUDITOR;AUDITOR\n11.222.333/0001-81;EMPRESA S.A.;ATIVO;BOLSA;9512;Energia Elétrica;PRIVADO;Categoria A;57.755.217/0001-29;KPMG AUDITORES\n';
const ans = 'REGISTRO_OPERADORA;CNPJ;MODALIDADE;DATA_REGISTRO_ANS\n"326305";"11222333000181";"Medicina de Grupo";"1998-12-17"\n';
function falso(rotas, extra = {}) {
  const achar = (url) => { const k = Object.keys(rotas).filter((p) => url.startsWith(p)).sort((a, b) => b.length - a.length)[0]; return k ? rotas[k] : undefined; };
  return {
    async json(url, opt = {}) { const r = achar(url); if (r === undefined) throw new Error('sem rota: ' + url); if (r === 404) return opt.nulo404 ? null : Promise.reject(new Error('404')); return typeof r === 'function' ? r(url) : r; },
    async binario(url) { const r = achar(url); if (r === undefined) throw new Error('sem rota: ' + url); return { status: 200, dados: Buffer.from(typeof r === 'function' ? r(url) : r, url.includes('cvm') ? 'latin1' : 'utf8') }; },
    async pagina(url) { const r = achar(url); return { status: 200, texto: r || '' }; },
    ...extra,
  };
}

caso('PNCP: separa quem contratou a empresa de quem ela contratou, soma por órgão, tenta de novo se a conexão cair', async () => {
  let quedas = 0;
  const item = (orgao, nomeOrg, forn, valor, desc) => ({ orgao_cnpj: orgao, orgao_nome: nomeOrg, fornecedor_ni: forn, fornecedor_nome: 'X', valor_global: valor, description: desc, data_assinatura: '2026-05-01T00:00:00', municipio_nome: 'Fortaleza', uf: 'CE', esfera_nome: 'Municipal', item_url: '/contratos/1' });
  const ctx = falso({
    'https://pncp.gov.br/api/search/': (u) => { if (/contrato/.test(u) && quedas++ === 0) throw new Error('ECONNRESET'); return /contrato/.test(u) ? { total: 3, items: [item('07722779000106', 'UFABC', D, 100, 'serviço A'), item('07722779000106', 'UFABC', D, 50, 'serviço B'), item('99999999000191', 'OUTRO', '12345678000195', 9, 'não é dela')] } : { total: 0, items: [] }; },
    'https://dadosabertos.compras.gov.br/': { resultado: [{ ativo: true, habilitadoLicitar: true, porteEmpresaNome: 'DEMAIS' }] },
  });
  const r = await rodar('pncp', 'cnpj', CNPJ, ctx);
  assert.equal(quedas, 2, 'tentou de novo');
  assert.equal(r.entidades.length, 1);
  const o = r.entidades[0];
  assert.equal(o.tipo, 'cnpj'); assert.equal(o.ligacao, 'contratou a empresa (PNCP)'); assert.equal(o.props.contratos, 2);
  assert.equal(o.props.link, 'https://pncp.gov.br/app/contratos/1');
  assert.match(r.props['fornecedor do governo federal'], /ativo, habilitado a licitar, porte demais/);
});
caso('BNDES: filtra pelo CNPJ exato (a busca acha por trecho) e soma os financiamentos', async () => {
  const ctx = falso({ 'https://dadosabertos.bndes.gov.br/': { result: { records: [{ cnpj: CNPJ, data_da_contratacao: '2014-01-02', valor_contratado_reais: 1000000, descricao_do_projeto: 'Fábrica', produto: 'FINEM' }, { cnpj: '11.222.333/0002-62', valor_contratado_reais: 5 }] } } });
  const r = await rodar('bndes', 'cnpj', CNPJ, ctx);
  assert.match(r.props.BNDES, /^1 financiamento, R\$\s?1\.000\.000 contratados \(o mais recente em 2014\)$/);
  assert.equal(r.entidades[0].valor, 'BNDES');
  assert.equal((await rodar('bndes', 'cnpj', CNPJ, falso({ 'https://dadosabertos.bndes.gov.br/': { result: { records: [] } } }))).props.BNDES, 'nenhum financiamento');
});
caso('registro.br: contagens e data; 404 é "nada"', async () => {
  const r = await rodar('registro-br', 'cnpj', CNPJ, falso({ 'https://rdap.registro.br/entity/': { nicbr_domainCount: 203, nicbr_inetCount: 2, nicbr_autnumCount: 1, events: [{ eventAction: 'registration', eventDate: '1998-02-05T12:00:00Z' }] } }));
  assert.equal(r.props['domínios .br'], 203); assert.equal(r.props['no registro.br desde'], '1998-02-05');
  assert.match((await rodar('registro-br', 'cnpj', CNPJ, falso({ 'https://rdap.registro.br/entity/': 404 }))).props['registro.br'], /nenhum/);
});
caso('reguladores: CVM (latin1, com o auditor), Banco Central pela raiz, ANEEL, ANTT (arquivo do mês mais recente), ANS', async () => {
  let recurso = '';
  const ctx = falso({
    'https://dados.cvm.gov.br/': cvm,
    'https://olinda.bcb.gov.br/': (u) => { assert.ok(u.includes("codigoCNPJ8%20eq%20'11222333'")); return { value: [{ descricaoTipoEntidadeSupervisionada: 'Banco Múltiplo', descricaoTipoSituacaoPessoaJuridica: 'Autorizada em Atividade' }] }; },
    'https://dadosabertos.aneel.gov.br/': { result: { total: 2, records: [{ NomEmpreendimento: 'UTE A', DscFaseUsina: 'Operação' }, { NomEmpreendimento: 'PCH B' }] } },
    'https://dados.antt.gov.br/api/3/action/package_show': { result: { resources: [{ id: 'velho', datastore_active: true, created: '2026-05-01' }, { id: 'novo', datastore_active: true, created: '2026-10-10' }] } },
    'https://dados.antt.gov.br/api/3/action/datastore_search': (u) => { recurso = u; return { result: { records: [{ numero_rntrc: '123', situacao_rntrc: 'ATIVO', categoria_transportador: 'ETC' }] } }; },
    'https://dadosabertos.ans.gov.br/': ans,
  });
  const r = await rodar('reguladores', 'cnpj', CNPJ, ctx);
  assert.match(recurso, /resource_id=novo/);
  assert.equal(r.props['órgãos reguladores'], 'CVM, Banco Central, ANEEL, ANTT, ANS');
  const lig = Object.fromEntries(r.entidades.map((e) => [e.valor, e.ligacao]));
  assert.match(lig['Comissão de Valores Mobiliários'], /companhia aberta \(bolsa; ativo\)/);
  assert.equal(lig['57.755.217/0001-29'], 'auditor (CVM)');
  assert.match(lig['Banco Central do Brasil'], /banco múltiplo/);
  assert.match(lig.ANTT, /RNTRC ativo/);
  assert.match(lig.ANS, /medicina de grupo/);
});
caso('reguladores: fonte fora do ar não derruba as outras e aparece como "não responderam"', async () => {
  const ctx = falso({ 'https://dados.cvm.gov.br/': cvm, 'https://olinda.bcb.gov.br/': { value: [] }, 'https://dadosabertos.aneel.gov.br/': () => { throw new Error('fora'); }, 'https://dados.antt.gov.br/': { result: { resources: [] } }, 'https://dadosabertos.ans.gov.br/': ans });
  const r = await rodar('reguladores', 'cnpj', '45.723.174/0001-10', ctx);
  assert.equal(r.props['órgãos reguladores'], 'nenhum registro');
  assert.equal(r.props['não responderam'], 'ANEEL');
});
caso('Diário Oficial também por CNPJ (sem exigir nome completo)', async () => {
  let q = '';
  const r = await rodar('dou', 'cnpj', CNPJ, falso({}, { async pagina(u) { q = decodeURIComponent(u); return { status: 200, texto: '<script id="_br_com_seatecnologia_in_buscadou_BuscaDouPortlet_params">{"jsonArray":[{"urlTitle":"x","title":"Extrato","pubDate":"01/01/2026","hierarchyStr":"Poder Executivo/Ministério/X"}]}</script>' }; } }));
  assert.match(q, /q="11\.222\.333\/0001-81"/);
  assert.equal(r.entidades.filter((e) => e.tipo === 'url').length, 1);
});
caso('Receita: histórico de tributação e datas do Simples e do MEI', async () => {
  const d = { razao_social: 'EMPRESA', descricao_situacao_cadastral: 'ATIVA', opcao_pelo_simples: false, data_opcao_pelo_simples: '2018-01-01', data_exclusao_do_simples: '2021-12-31', regime_tributario: [{ ano: 2022, forma_de_tributacao: 'LUCRO PRESUMIDO' }, { ano: 2024, forma_de_tributacao: 'LUCRO REAL' }], qsa: [] };
  const r = await rodar('cnpj', 'cnpj', CNPJ, falso({ 'https://brasilapi.com.br/': d, 'https://minhareceita.org/': d }));
  assert.equal(r.props['tributação por ano'], '2024: lucro real · 2022: lucro presumido');
  assert.equal(r.props['Simples e MEI'], 'entrou no Simples em 2018-01-01; saiu do Simples em 2021-12-31');
});

await Promise.all(pendentes);
console.log(`testes da pegada da empresa do Bluetego: ${ok} de ${pendentes.length} passaram`);
