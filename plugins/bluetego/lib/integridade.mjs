// Bluetego: verificação de integridade por CPF ou CNPJ em fontes oficiais, do jeito que compliance e due diligence fazem:
// listas de sanção, pessoa politicamente exposta, servidor federal e contratos com o governo.
// O Bluetego NÃO descobre o dono de um CPF: não consulta cadastro de pessoa física (nome, endereço, telefone, benefícios
// sociais), não usa bases vazadas e não joga o CPF na busca da web. O nome só aparece quando a própria fonte oficial o
// publica junto do CPF (condenado pelo TCU, sancionado, servidor federal, PEP), que é o que a lei manda tornar público.
import { normalizar } from './entidades.mjs';
import { Falha } from './transformacoes.mjs';

const ent = (tipo, valor, ligacao, extra = {}) => ({ tipo, valor: normalizar(tipo, valor), ligacao, ...extra });
const unicos = (lista) => { const v = new Set(); return lista.filter((e) => { const k = e.tipo + ':' + e.valor + ':' + (e.de ? e.de.valor : ''); if (!e.valor || v.has(k)) return false; v.add(k); return true; }); };
const data = (s) => (s ? String(s).slice(0, 10) : '');
const digitos = (s) => String(s || '').replace(/\D/g, '');
const cpfFormatado = (d) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
const titulo = (s) => String(s || '').toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (x) => x.toLowerCase());

// ---------- TCU pelo CPF: inabilitados para cargo público e proibidos de licitar (sem chave) ----------
export async function cpfTcu(ctx, valor) {
  const d = digitos(valor);
  const q = encodeURIComponent(JSON.stringify({ cpf: cpfFormatado(d) }));
  const [inab, inid] = await Promise.all(['inabilitados', 'inidoneos'].map((l) => ctx.json(`https://contas.tcu.gov.br/ords/condenacao/consulta/${l}?q=${q}`).then((r) => ((r && r.items) || []).map((x) => ({ ...x, lista: l }))).catch(() => null)));
  if (!inab && !inid) throw new Falha('O TCU não respondeu.', { status: 502 });
  const hits = [...(inab || []), ...(inid || [])].filter((x) => digitos(x.cpf) === d);
  const out = [];
  for (const x of hits.slice(0, 10)) {
    out.push(ent('organizacao', 'Tribunal de Contas da União', x.lista === 'inabilitados' ? 'inabilitado(a) para cargo público pelo TCU' : 'proibido(a) de licitar pelo TCU (inidôneo)', { alerta: true, props: { processo: x.processo || '', acórdão: x.deliberacao || '', desde: data(x.data_transito_julgado), até: data(x.data_final), local: [x.municipio, x.uf].filter(Boolean).join(' - ') } }));
    if (x.nome) out.push(ent('pessoa', titulo(x.nome), 'nome na condenação do TCU (publicado pelo tribunal)'));
    if (x.municipio) out.push(ent('local', `${x.municipio}${x.uf ? ' - ' + x.uf : ''}`, 'município na condenação do TCU'));
  }
  return { entidades: unicos(out), alerta: hits.length > 0, props: { TCU: hits.length ? hits.map((x) => `${x.lista === 'inabilitados' ? 'inabilitado' : 'inidôneo'} até ${data(x.data_final)} (${x.deliberacao})`).join('; ') : 'nada consta' } };
}

// ---------- Portal da Transparência (chave gratuita no Cofre) ----------
const PT = 'https://api.portaldatransparencia.gov.br/api-de-dados/';
const COFRE = 'bluetego.transparencia';
async function pt(ctx, caminho) {
  let r;
  try { r = await ctx.cofre(PT + caminho, { 'chave-api-dados': `{{vault:${COFRE}}}`, accept: 'application/json' }); }
  catch { throw new Falha('Falta a chave do Portal da Transparência no Cofre (bluetego.transparencia). Ela é gratuita: portaldatransparencia.gov.br/api-de-dados/cadastrar-email.', { status: 403, codigo: 'cofre', cofre: COFRE }); }
  if (r.status === 401 || r.status === 403) throw new Falha('O Portal da Transparência recusou a chave. Confira no Cofre (bluetego.transparencia).', { status: 403, codigo: 'cofre', cofre: COFRE });
  if (r.status === 429) throw new Falha('Limite de consultas do Portal da Transparência; espere um minuto.', { status: 429 });
  if (!r.ok) throw new Falha(`O Portal da Transparência respondeu ${r.status}.`, { status: 502 });
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}
export async function transparencia(ctx, valor, tipo) {
  const d = digitos(valor), ehCpf = tipo === 'cpf';
  const consultas = [
    ['CEIS', `ceis?codigoSancionado=${d}&pagina=1`], ['CNEP', `cnep?codigoSancionado=${d}&pagina=1`], ['contratos', `contratos/cpf-cnpj?cpfCnpj=${d}&pagina=1`],
    ...(ehCpf ? [['CEAF', `ceaf?cpfSancionado=${d}&pagina=1`], ['PEP', `peps?cpf=${d}&pagina=1`], ['servidor', `servidores?cpf=${d}&pagina=1`]] : []),
  ];
  const res = await Promise.allSettled(consultas.map(([, c]) => pt(ctx, c)));
  // sem chave ou chave recusada: a primeira falha já diz o que fazer
  const cofre = res.find((x) => x.status === 'rejected' && x.reason && x.reason.codigo === 'cofre');
  if (cofre) throw cofre.reason;
  const por = Object.fromEntries(consultas.map(([k], i) => [k, res[i].status === 'fulfilled' ? res[i].value : null]));
  const out = [], props = {}, nomes = new Set();
  const nome = (n) => { if (ehCpf && n && /[a-z]/i.test(n)) nomes.add(titulo(n)); };
  for (const lista of ['CEIS', 'CNEP']) for (const x of (por[lista] || []).slice(0, 8)) {
    const org = (x.orgaoSancionador && x.orgaoSancionador.nome) || 'órgão sancionador';
    out.push(ent('organizacao', titulo(org), `sancionado(a) no ${lista}: ${(x.tipoSancao && x.tipoSancao.descricaoResumida) || 'sanção'}`, { alerta: true, props: { início: x.dataInicioSancao || '', fim: x.dataFimSancao || '', processo: x.numeroProcesso || '', fundamentação: (x.fundamentacao && x.fundamentacao[0] ? x.fundamentacao[0].descricao : (x.fundamentacao && x.fundamentacao.descricao)) || '', multa: x.valorMulta || '', publicação: x.linkPublicacao || '' } }));
    nome((x.sancionado && x.sancionado.nome) || (x.pessoa && x.pessoa.nome));
  }
  for (const x of (por.CEAF || []).slice(0, 5)) {
    out.push(ent('organizacao', titulo((x.orgaoLotacao && x.orgaoLotacao.nome) || 'administração federal'), `expulso(a) da administração federal: ${(x.tipoPunicao && x.tipoPunicao.descricao) || 'punição'}`, { alerta: true, props: { publicação: x.dataPublicacao || '', portaria: (x.punicao && x.punicao.portaria) || '', processo: (x.punicao && x.punicao.processo) || '', cargo: x.cargoEfetivo || '' } }));
    nome(x.punicao && x.punicao.nomePunido);
  }
  for (const x of (por.PEP || []).slice(0, 5)) {
    out.push(ent('organizacao', titulo(x.nome_orgao || 'órgão público'), `pessoa politicamente exposta: ${String(x.descricao_funcao || x.sigla_funcao || 'função pública').toLowerCase()}`, { props: { desde: x.dt_inicio_exercicio || '', até: x.dt_fim_exercicio || 'atual', 'fim da carência': x.dt_fim_carencia || '' } }));
    nome(x.nome);
  }
  for (const x of (por.servidor || []).slice(0, 3)) {
    const s = x.servidor || {}, org = (s.orgaoServidorExercicio && s.orgaoServidorExercicio.nome) || (s.orgaoServidorLotacao && s.orgaoServidorLotacao.nome);
    if (org) out.push(ent('organizacao', titulo(org), `servidor(a) federal${s.situacao ? ` (${String(s.situacao).toLowerCase()})` : ''}`, { props: { tipo: s.tipoServidor || '', função: (s.funcao && s.funcao.descricaoFuncaoCargo) || '', UF: (s.estadoExercicio && s.estadoExercicio.sigla) || '' } }));
    nome(s.pessoa && s.pessoa.nome);
  }
  const contratos = por.contratos || [];
  for (const x of contratos.slice(0, 5)) {
    const ug = x.unidadeGestora || {}, org = (ug.orgaoMaximo && ug.orgaoMaximo.nome) || ug.nome;
    if (org) out.push(ent('organizacao', titulo(org), 'contrato com o governo federal', { props: { contrato: x.numero || '', objeto: String(x.objeto || '').slice(0, 200), valor: x.valorFinalCompra || x.valorInicialCompra || '', vigência: [x.dataInicioVigencia, x.dataFimVigencia].filter(Boolean).join(' a ') } }));
    nome(x.fornecedor && x.fornecedor.nome);
  }
  for (const n of [...nomes].slice(0, 2)) out.push(ent('pessoa', n, 'nome publicado pelo Portal da Transparência'));
  const conta = (k) => (por[k] === null ? 'não respondeu' : por[k].length ? `${por[k].length}${por[k].length >= 15 ? '+' : ''}` : 'nada consta');
  props['sanções (CEIS)'] = conta('CEIS');
  props['sanções (CNEP)'] = conta('CNEP');
  if (ehCpf) { props['expulsões (CEAF)'] = conta('CEAF'); props['pessoa politicamente exposta'] = por.PEP && por.PEP.length ? 'sim' : conta('PEP'); props['servidor federal'] = por.servidor && por.servidor.length ? 'sim' : conta('servidor'); }
  props['contratos com o governo federal'] = conta('contratos');
  const alerta = out.some((e) => e.alerta);
  if (alerta) props['alerta do Portal da Transparência'] = 'consta em lista de sanção ou expulsão do governo federal';
  return { entidades: unicos(out), alerta, props };
}
