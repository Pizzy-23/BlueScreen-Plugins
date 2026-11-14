// Testes das fontes de nome completo da 0.5 (sem rede): STF, Diário Oficial da União, TCU, Câmara e Senado,
// sanções (OFAC, ONU, UE), Offshore Leaks, autor, Nobel e imprensa. node tests/nomes.test.mjs
import assert from 'node:assert/strict';
import { rodar, nomeCasa, palavrasNome, lerCsv } from '../lib/transformacoes.mjs';
import { MAQUINAS } from '../lib/maquinas.mjs';

let ok = 0;
const pendentes = [];
const caso = (nome, fn) => pendentes.push(Promise.resolve().then(fn).then(() => ok++, (e) => { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }));
function falso(rotas, extra = {}) {
  const achar = (url) => { const k = Object.keys(rotas).filter((p) => url.startsWith(p)).sort((a, b) => b.length - a.length)[0]; return k ? rotas[k] : undefined; };
  return {
    limite: 40,
    async json(url) { const r = achar(url); if (r === undefined) throw new Error('sem rota: ' + url); return typeof r === 'function' ? r(url) : r; },
    async pagina(url) { const r = achar(url); if (r === undefined) throw new Error('sem rota: ' + url); return { status: 200, headers: {}, url, ...r }; },
    async binario(url) { const r = achar(url); if (r === undefined) throw new Error('sem rota: ' + url); return { status: 200, dados: Buffer.from(r) }; },
    ...extra,
  };
}

caso('nome: palavras em qualquer ordem, sem acento, sem "da/de"', () => {
  assert.deepEqual(palavrasNome('Luiz Inácio Lula da Silva'), ['luiz', 'inacio', 'lula', 'silva']);
  assert.ok(nomeCasa('Nicolas Maduro', 'MADURO MOROS, Nicolás'));
  assert.ok(!nomeCasa('Nicolas Maduro', 'Nicolas Silva'));
  assert.ok(!nomeCasa('Maduro', 'MADURO MOROS, Nicolas'), 'uma palavra só não basta');
});
caso('nome completo é exigido: uma palavra só não consulta nada', async () => {
  const r = await rodar('sancoes', 'pessoa', 'Maduro', falso({}));
  assert.equal(r.entidades.length, 0); assert.match(r.aviso, /nome completo/);
});
caso('CSV com aspas, vírgula e aspas dobradas', () => {
  assert.deepEqual(lerCsv('1,"MADURO MOROS, Nicolas","diz ""oi"""\r\n2,b,c\n'), [['1', 'MADURO MOROS, Nicolas', 'diz "oi"'], ['2', 'b', 'c']]);
});

caso('STF: só a parte com o nome inteiro; link para os autos; em tramitação contada', async () => {
  const parte = (id, nome, tram) => ({ pessoaNome: nome, processoId: id, processoIdentificacao: `Pet ${id}`, processoNumeroUnico: '0000', processoDataAutuacao: '01/01/2026', processoEmTramitacao: tram });
  const ctx = falso({ 'https://digital.stf.jus.br/': (u) => ({ partes: /Tramitacao=sim/.test(u) ? [parte(1, 'ANA PAULA SOUZA', 'Sim'), parte(2, 'ANA PAULA SOUZA LIMA', 'Sim')] : [parte(3, 'Ana Paula Souza', 'Não')] }) });
  const r = await rodar('stf', 'pessoa', 'Ana Paula Souza', ctx);
  assert.deepEqual(r.entidades.map((e) => e.valor), ['https://portal.stf.jus.br/processos/detalhe.asp?incidente=1', 'https://portal.stf.jus.br/processos/detalhe.asp?incidente=3']);
  assert.equal(r.props['processos no STF'], '2 (1 em tramitação)');
});
caso('Diário Oficial: lê o JSON escondido na página, tira o destaque, órgão vira organização', async () => {
  const atos = { jsonArray: [{ pubName: 'DO2', urlTitle: 'portaria-1', title: 'Portaria 1', pubDate: '10/11/2026', artType: 'Portaria', hierarchyStr: 'Poder Executivo/Ministério da Saúde/Gabinete', content: "nomear <span class='highlight'>ANA</span> SOUZA" }] };
  const ctx = falso({ 'https://www.in.gov.br/': { texto: `<html><script type="application/json" id="_br_com_seatecnologia_in_buscadou_BuscaDouPortlet_params">${JSON.stringify(atos)}</script></html>` } });
  const r = await rodar('dou', 'pessoa', 'Ana Souza', ctx);
  const ato = r.entidades.find((e) => e.tipo === 'url');
  assert.equal(ato.valor, 'https://www.in.gov.br/web/dou/-/portaria-1');
  assert.equal(ato.props.trecho, 'nomear ANA SOUZA');
  assert.ok(r.entidades.some((e) => e.tipo === 'organizacao' && e.valor === 'Ministério da Saúde'));
});
caso('TCU: condenação vira alerta e o CPF da lista nunca aparece', async () => {
  const ctx = falso({ 'https://contas.tcu.gov.br/ords/condenacao/consulta/inabilitados': { items: [{ nome: 'JOAO DA SILVA PEREIRA', cpf: '111.444.777-35', processo: '000.1/2025-0', deliberacao: 'AC-1/2026-PL', data_transito_julgado: '2026-01-01T03:00:00Z', data_final: '2031-01-01T03:00:00Z', uf: 'SP', municipio: 'DIADEMA' }] }, 'https://contas.tcu.gov.br/ords/condenacao/consulta/inidoneos': { items: [] } });
  const r = await rodar('tcu', 'pessoa', 'João da Silva Pereira', ctx);
  assert.equal(r.alerta, true);
  assert.ok(!JSON.stringify(r).includes('111.444.777'), 'CPF não pode sair');
  assert.ok(r.entidades.every((e) => e.tipo !== 'cpf'));
  assert.match(r.props.TCU, /inabilitado até 2031-01-01/);
});
caso('parlamentar: mandatos na Câmara pelo nome parcial e suplentes do Senado', async () => {
  const sen = { ListaParlamentarLegislatura: { Parlamentares: { Parlamentar: [{ IdentificacaoParlamentar: { CodigoParlamentar: '9', NomeParlamentar: 'Fernando Collor', NomeCompletoParlamentar: 'Fernando Affonso Collor de Mello', SiglaPartidoParlamentar: 'PTB' }, Mandatos: { Mandato: [{ UfParlamentar: 'AL', Suplentes: { Suplente: [{ DescricaoParticipacao: '1º Suplente', NomeParlamentar: 'Euclydes Mello' }] } }] } }] } } };
  const ctx = falso({
    'https://dadosabertos.camara.leg.br/api/v2/deputados?': { dados: [{ id: 7, nome: 'FERNANDO COLLOR', siglaPartido: 'PDS', siglaUf: 'AL', idLegislatura: 47 }, { id: 8, nome: 'LINDOLFO COLLOR', siglaPartido: 'X', siglaUf: 'RS', idLegislatura: 30 }] },
    'https://dadosabertos.camara.leg.br/api/v2/deputados/7/ocupacoes': { dados: [] },
    'https://dadosabertos.camara.leg.br/api/v2/deputados/7': { dados: { nomeCivil: 'Fernando Affonso Collor de Mello', dataNascimento: '1949-08-12', municipioNascimento: 'Rio de Janeiro', ufNascimento: 'RJ' } },
    'https://legis.senado.leg.br/dadosabertos/senador/lista/': JSON.stringify(sen),
    'https://legis.senado.leg.br/dadosabertos/senador/9/cargos.json': {},
  });
  const r = await rodar('parlamentar', 'pessoa', 'Fernando Collor de Mello', ctx);
  const v = r.entidades.map((e) => e.valor);
  assert.ok(v.includes('Câmara dos Deputados') && v.includes('Senado Federal') && v.includes('Euclydes Mello'));
  assert.ok(!v.includes('X'), 'Lindolfo Collor é outra pessoa');
  assert.equal(r.props.nascimento, '1949-08-12');
});
caso('sanções: OFAC, ONU e UE; nome trocado de ordem casa, homônimo de uma palavra não', async () => {
  const ctx = falso({
    'https://sanctionslistservice.ofac.treas.gov/': '22790,"MADURO MOROS, Nicolas","individual","VENEZUELA","President",-0-,-0-,-0-,-0-,-0-,-0-,"DOB 23 Nov 1962"\n1,"SILVA, Nicolas","individual","X",-0-,-0-,-0-,-0-,-0-,-0-,-0-,-0-\n',
    'https://scsanctions.un.org/': '<CONSOLIDATED_LIST><INDIVIDUALS><INDIVIDUAL><FIRST_NAME>ERIC</FIRST_NAME><SECOND_NAME>BADEGE</SECOND_NAME><UN_LIST_TYPE>DRC</UN_LIST_TYPE><REFERENCE_NUMBER>CDi.001</REFERENCE_NUMBER></INDIVIDUAL></INDIVIDUALS></CONSOLIDATED_LIST>',
    'https://webgate.ec.europa.eu/': 'Entity_SubjectType;NameAlias_WholeName;NameAlias_Function;Entity_Regulation_Programme;Entity_Regulation_PublicationUrl\nP;Nicolás MADURO MOROS;Presidente;VEN;https://eur-lex\n',
  });
  const r = await rodar('sancoes', 'pessoa', 'Nicolas Maduro', ctx);
  assert.equal(r.alerta, true);
  assert.deepEqual(r.entidades.map((e) => e.valor).sort(), ['OFAC (Tesouro dos EUA)', 'União Europeia']);
  assert.equal(r.props.ONU, 'não consta');
  const b = await rodar('sancoes', 'pessoa', 'Eric Badege', ctx);
  assert.equal(b.props.ONU, 'consta');
});
caso('Offshore Leaks: a API sempre devolve alguém; só fica quem tem o nome inteiro', async () => {
  const ctx = falso({}, { async post() { return { q0: { result: [{ id: '1', name: 'CHAN KONG SANG, JACKIE', description: 'Panama Papers' }, { id: '2', name: 'JACKIE CREUZON' }, { id: '3', name: 'Maria Silva' }] } }; } });
  const r = await rodar('offshore', 'pessoa', 'Jackie Chan', ctx);
  assert.deepEqual(r.entidades.map((e) => e.valor), ['https://offshoreleaks.icij.org/nodes/1']);
});
caso('autor, Nobel e imprensa', async () => {
  const ctx = falso({
    'https://viaf.org/': { result: [{ term: 'Linus Torvalds, 1969-', nametype: 'personal', viafid: '5', lc: 'n1', dnb: 'd1' }] },
    'https://openlibrary.org/': { docs: [{ key: 'OL1A', name: 'Linus Torvalds', work_count: 6, top_work: 'Just for fun' }] },
    'https://api.nobelprize.org/': { laureates: [{ fullName: { en: 'Marie Curie, née Sklodowska' }, nobelPrizes: [{ awardYear: '1911', category: { en: 'Chemistry' }, affiliations: [{ name: { en: 'Sorbonne University' } }] }] }] },
    'https://api.gdeltproject.org/': { texto: JSON.stringify({ articles: [{ url: 'https://g1.globo.com/x', title: 'Notícia', domain: 'g1.globo.com', seendate: '20261110T120000Z', sourcecountry: 'Brazil' }] }) },
  });
  const a = await rodar('autor', 'pessoa', 'Linus Torvalds', ctx);
  assert.equal(a.props['bibliotecas que registram'], 'LC, DNB');
  assert.equal(a.entidades.length, 2);
  const n = await rodar('nobel', 'pessoa', 'Marie Curie', ctx);
  assert.equal(n.props['Prêmio Nobel'], 'Chemistry 1911');
  const i = await rodar('imprensa', 'pessoa', 'Ana Souza', ctx);
  assert.equal(i.entidades[0].props.publicado, '2026-11-10');
});
caso('a máquina da pessoa usa as fontes novas', () => {
  const ts = MAQUINAS.find((m) => m.id === 'pessoa').passos.map((p) => p.t);
  for (const t of ['parlamentar', 'sancoes', 'tcu', 'stf', 'dou', 'offshore', 'autor', 'nobel']) assert.ok(ts.includes(t), t);
  assert.ok(!ts.includes('deputado'));
  assert.ok(!ts.includes('imprensa'), 'o GDELT bloqueia rajadas: fica só manual');
});

await Promise.all(pendentes);
console.log(`testes das fontes de nome do Bluetego: ${ok} de ${pendentes.length} passaram`);
