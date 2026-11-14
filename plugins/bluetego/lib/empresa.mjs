// Bluetego: a pegada pública de uma empresa pelo CNPJ. Contratos com o poder público (PNCP, todas as esferas, e o
// cadastro de fornecedor do Compras.gov), financiamentos do BNDES, o que a empresa tem no registro.br (domínios, blocos
// IP, ASN) e os registros em órgãos reguladores (CVM, Banco Central, ANEEL, ANTT, ANS).
import { normalizar } from './entidades.mjs';
import { Falha, lerCsv } from './transformacoes.mjs';

const ent = (tipo, valor, ligacao, extra = {}) => ({ tipo, valor: normalizar(tipo, valor), ligacao, ...extra });
const unicos = (lista) => { const v = new Set(); return lista.filter((e) => { const k = e.tipo + ':' + e.valor + ':' + (e.de ? e.de.valor : ''); if (!e.valor || v.has(k)) return false; v.add(k); return true; }); };
const digitos = (s) => String(s || '').replace(/\D/g, '');
const formatado = (d) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
const reais = (v) => (Number.isFinite(Number(v)) && Number(v) ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '');
const titulo = (s) => String(s || '').toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (x) => x.toLowerCase()).replace(/\b(Sa|S\/A|Ltda|Me|Epp)\b/g, (x) => x.toUpperCase());
// o PNCP derruba a conexão de vez em quando: uma nova tentativa resolve
const comNovaTentativa = async (fn) => { try { return await fn(); } catch { return fn(); } };

// arquivos inteiros (cadastro da CVM, operadoras da ANS): baixados uma vez por dia
const ARQUIVOS = new Map();
async function arquivo(ctx, url, codificacao, ler) {
  const x = ARQUIVOS.get(url);
  if (x && Date.now() - x.em < 86400000) return x.v;
  const b = await ctx.binario(url, { max: 30_000_000, timeout: 90000 });
  if (!b || !b.dados) throw new Falha(`Não deu para baixar ${new URL(url).host}.`, { status: 502 });
  const v = ler(new TextDecoder(codificacao).decode(b.dados));
  ARQUIVOS.set(url, { em: Date.now(), v });
  return v;
}

// ---------- contratos com o poder público: PNCP (federal, estadual, municipal) e o cadastro do Compras.gov ----------
export async function pncp(ctx, valor) {
  const d = digitos(valor);
  const busca = (tipo) => comNovaTentativa(() => ctx.json(`https://pncp.gov.br/api/search/?q=${d}&tipos_documento=${tipo}&ordenacao=-data&pagina=1&tam_pagina=20`, { timeout: 40000 }));
  const [contratos, atas, forn] = await Promise.all([busca('contrato').catch(() => null), busca('ata').catch(() => null), ctx.json(`https://dadosabertos.compras.gov.br/modulo-fornecedor/1_consultarFornecedor?pagina=1&cnpj=${d}&ativo=true`, { timeout: 30000 }).catch(() => null)]);
  if (!contratos && !atas) throw new Falha('O PNCP não respondeu; tente de novo daqui a pouco.', { status: 502 });
  const itens = [...((contratos && contratos.items) || []), ...((atas && atas.items) || [])];
  // a busca acha o CNPJ dos dois lados: como fornecedor (quem contratou a empresa) e como órgão (a empresa contratando)
  const por = new Map();
  for (const x of itens) {
    const fornecedor = digitos(x.fornecedor_ni) === d, orgao = digitos(x.orgao_cnpj) === d;
    if (!fornecedor && !orgao) continue;
    const outro = fornecedor ? { cnpj: digitos(x.orgao_cnpj), nome: x.orgao_nome } : { cnpj: digitos(x.fornecedor_ni), nome: x.fornecedor_nome };
    if (!outro.nome) continue;
    const k = outro.cnpj || outro.nome;
    if (!por.has(k)) por.set(k, { ...outro, papel: fornecedor ? 'contratou a empresa' : 'contratado pela empresa', n: 0, total: 0, ultimo: x, lugar: [x.municipio_nome, x.uf].filter(Boolean).join(' - '), esfera: x.esfera_nome || '' });
    const p = por.get(k);
    p.n++; p.total += Number(x.valor_global || 0) || 0;
  }
  const out = [];
  for (const p of [...por.values()].sort((a, b) => b.total - a.total).slice(0, 15)) {
    const props = { contratos: p.n, 'valor somado': reais(p.total), 'último objeto': String(p.ultimo.description || '').slice(0, 160), 'última assinatura': String(p.ultimo.data_assinatura || '').slice(0, 10), local: p.lugar, esfera: p.esfera, link: p.ultimo.item_url ? 'https://pncp.gov.br/app' + p.ultimo.item_url : '' };
    out.push(p.cnpj && p.cnpj.length === 14 ? ent('cnpj', formatado(p.cnpj), `${p.papel} (PNCP)`, { rotulo: titulo(p.nome), props: { nome: p.nome, ...props } }) : ent('organizacao', titulo(p.nome), `${p.papel} (PNCP)`, { props }));
  }
  const f = forn && forn.resultado && forn.resultado[0];
  const total = (contratos ? contratos.total || 0 : 0) + (atas ? atas.total || 0 : 0);
  return {
    entidades: unicos(out),
    props: {
      'contratos e atas no PNCP': total ? `${total}${itens.length < total ? ` (mostrando os ${out.length} órgãos dos ${itens.length} mais recentes)` : ''}` : 'nenhum',
      'fornecedor do governo federal': f ? `${f.ativo ? 'cadastro ativo' : 'cadastro inativo'}${f.habilitadoLicitar ? ', habilitado a licitar' : ', não habilitado a licitar'}${f.porteEmpresaNome ? `, porte ${String(f.porteEmpresaNome).toLowerCase()}` : ''}` : '',
    },
    aviso: total ? '' : 'Nenhum contrato ou ata com este CNPJ no PNCP (filial tem CNPJ próprio).',
  };
}

// ---------- financiamentos do BNDES (operações não automáticas: o CNPJ vem inteiro) ----------
export async function bndes(ctx, valor) {
  const f = formatado(digitos(valor));
  const campos = 'cliente,cnpj,descricao_do_projeto,data_da_contratacao,valor_contratado_reais,valor_desembolsado_reais,produto,situacao_do_contrato';
  const r = await ctx.json(`https://dadosabertos.bndes.gov.br/api/3/action/datastore_search?resource_id=6f56b78c-510f-44b6-8274-78a5b7e931f4&q=${encodeURIComponent(f)}&fields=${campos}&limit=100`, { timeout: 40000 });
  const ops = (((r || {}).result || {}).records || []).filter((x) => x.cnpj === f).sort((a, b) => String(b.data_da_contratacao).localeCompare(String(a.data_da_contratacao)));
  if (!ops.length) return { entidades: [], props: { BNDES: 'nenhum financiamento' } };
  const total = ops.reduce((a, x) => a + (Number(x.valor_contratado_reais) || 0), 0);
  return {
    entidades: [ent('organizacao', 'BNDES', 'financiada pelo BNDES', { props: { operações: ops.length, 'valor contratado somado': reais(total), 'última': `${String(ops[0].data_da_contratacao).slice(0, 10)}: ${String(ops[0].descricao_do_projeto || '').slice(0, 160)}`, produtos: [...new Set(ops.map((x) => x.produto).filter(Boolean))].slice(0, 4).join(', ') } })],
    props: { BNDES: `${ops.length} ${ops.length === 1 ? 'financiamento' : 'financiamentos'}, ${reais(total)} contratados (o mais recente em ${String(ops[0].data_da_contratacao).slice(0, 4)})` },
  };
}

// ---------- registro.br: quantos domínios .br, blocos IP e ASN a empresa tem (a lista não é pública) ----------
export async function registroBr(ctx, valor) {
  const r = await ctx.json(`https://rdap.registro.br/entity/${digitos(valor)}`, { nulo404: true });
  if (!r) return { entidades: [], props: { 'registro.br': 'nenhum domínio, bloco IP ou ASN' } };
  const reg = (r.events || []).find((e) => e.eventAction === 'registration');
  const n = (k) => Number(r[k] || 0);
  return {
    entidades: [],
    props: {
      'domínios .br': n('nicbr_domainCount'), 'blocos IP': n('nicbr_inetCount') || '', 'sistemas autônomos (ASN)': n('nicbr_autnumCount') || '',
      'no registro.br desde': reg ? String(reg.eventDate).slice(0, 10) : '',
      'aviso do registro.br': 'os dados do registro.br não podem ser redistribuídos nem usados comercialmente',
    },
  };
}

// ---------- órgãos reguladores: CVM, Banco Central, ANEEL, ANTT, ANS ----------
const fimDoMes = (atras) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - atras + 1); d.setUTCDate(0); return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}-${d.getUTCFullYear()}`; };
export async function reguladores(ctx, valor) {
  const d = digitos(valor), f = formatado(d);
  const out = [], achou = [];
  const cvm = async () => {
    const linhas = await arquivo(ctx, 'https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv', 'latin1', (t) => { const ls = lerCsv(t, ';'); const c = ls[0] || []; return ls.slice(1).map((l) => Object.fromEntries(c.map((k, i) => [k, l[i]]))); });
    const ls = linhas.filter((l) => l.CNPJ_CIA === f);
    if (!ls.length) return;
    const l = ls.find((x) => x.SIT === 'ATIVO') || ls[0];
    achou.push('CVM');
    out.push(ent('organizacao', 'Comissão de Valores Mobiliários', `companhia aberta (${[...new Set(ls.map((x) => x.TP_MERC).filter(Boolean))].join(', ').toLowerCase() || 'registro'}; ${String(l.SIT || '').toLowerCase()})`, { props: { 'código CVM': l.CD_CVM || '', setor: l.SETOR_ATIV || '', controle: l.CONTROLE_ACIONARIO || '', categoria: l.CATEG_REG || '' } }));
    if (l.CNPJ_AUDITOR && digitos(l.CNPJ_AUDITOR).length === 14) out.push(ent('cnpj', l.CNPJ_AUDITOR, 'auditor (CVM)', { rotulo: titulo(l.AUDITOR), props: { nome: l.AUDITOR || '' } }));
  };
  const bcb = async () => {
    let v = null;
    for (const atras of [1, 2]) {
      const r = await ctx.json(`https://olinda.bcb.gov.br/olinda/servico/BcBase/versao/v2/odata/EntidadesSupervisionadas(dataBase=@dataBase)?@dataBase='${fimDoMes(atras)}'&$filter=codigoCNPJ8%20eq%20'${d.slice(0, 8)}'&$format=json`, { timeout: 30000 }).catch(() => null);
      if (r && Array.isArray(r.value)) { v = r.value; break; }
    }
    const x = v && v[0];
    if (!x) return;
    achou.push('Banco Central');
    out.push(ent('organizacao', 'Banco Central do Brasil', `instituição supervisionada: ${String(x.descricaoTipoEntidadeSupervisionada || 'entidade').toLowerCase()}`, { props: { situação: x.descricaoTipoSituacaoPessoaJuridica || '', 'nome no BC': x.nomeEntidadeInteresse || '' } }));
  };
  const aneel = async () => {
    const r = await ctx.json(`https://dadosabertos.aneel.gov.br/api/3/action/datastore_search?resource_id=20ef769f-a072-489d-9df4-c834529f8a78&filters=${encodeURIComponent(JSON.stringify({ NumCPFCNPJ: d }))}&limit=50`, { timeout: 30000 });
    const us = (((r || {}).result || {}).records || []);
    if (!us.length) return;
    achou.push('ANEEL');
    out.push(ent('organizacao', 'ANEEL', 'agente de geração de energia', { props: { usinas: (r.result.total || us.length), exemplos: us.slice(0, 5).map((u) => `${u.NomEmpreendimento}${u.DscFaseUsina ? ` (${String(u.DscFaseUsina).toLowerCase()})` : ''}`).join('; ') } }));
  };
  const antt = async () => {
    const pk = await ctx.json('https://dados.antt.gov.br/api/3/action/package_show?id=rntrc', { timeout: 30000 });
    const res = (((pk || {}).result || {}).resources || []).filter((x) => x.datastore_active).sort((a, b) => String(b.created).localeCompare(String(a.created)))[0];
    if (!res) return;
    const r = await ctx.json(`https://dados.antt.gov.br/api/3/action/datastore_search?resource_id=${res.id}&filters=${encodeURIComponent(JSON.stringify({ cpfcnpjtransportador: f }))}&limit=5`, { timeout: 30000 });
    const x = (((r || {}).result || {}).records || [])[0];
    if (!x) return;
    achou.push('ANTT');
    out.push(ent('organizacao', 'ANTT', `transportador registrado (RNTRC ${String(x.situacao_rntrc || '').toLowerCase()})`, { props: { RNTRC: x.numero_rntrc || '', categoria: x.categoria_transportador || '', desde: x.data_primeiro_cadastro || '', local: [x.municipio, x.uf].filter(Boolean).join(' - ') } }));
  };
  const ans = async () => {
    const linhas = await arquivo(ctx, 'https://dadosabertos.ans.gov.br/FTP/PDA/operadoras_de_plano_de_saude_ativas/Relatorio_cadop.csv', 'utf-8', (t) => { const ls = lerCsv(t, ';'); const c = ls[0] || []; return ls.slice(1).map((l) => Object.fromEntries(c.map((k, i) => [k, l[i]]))); });
    const x = linhas.find((l) => l.CNPJ === d);
    if (!x) return;
    achou.push('ANS');
    out.push(ent('organizacao', 'ANS', `operadora de plano de saúde (${String(x.MODALIDADE || '').toLowerCase()})`, { props: { 'registro ANS': x.REGISTRO_OPERADORA || '', desde: x.DATA_REGISTRO_ANS || '', comercialização: x.REGIAO_DE_COMERCIALIZACAO || '' } }));
  };
  const nomes = ['CVM', 'Banco Central', 'ANEEL', 'ANTT', 'ANS'];
  const res = await Promise.allSettled([cvm(), bcb(), aneel(), antt(), ans()]);
  const falhas = nomes.filter((_, i) => res[i].status === 'rejected');
  return {
    entidades: unicos(out),
    // na ordem fixa (as respostas chegam em qualquer ordem)
    props: { 'órgãos reguladores': achou.length ? nomes.filter((x) => achou.includes(x)).join(', ') : 'nenhum registro', ...(falhas.length ? { 'não responderam': falhas.join(', ') } : {}) },
  };
}
