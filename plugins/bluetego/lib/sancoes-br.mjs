// Bluetego: sanções e condenações publicadas no Brasil, por CPF ou CNPJ, sem chave: CGU (CEIS e CNEP, os arquivos do
// Portal da Transparência), TCU (contas julgadas irregulares), IBAMA (autos de infração e áreas embargadas), MTE (lista
// suja do trabalho escravo), CNJ (condenações por improbidade, CNIA) e TCE-RS (contas irregulares).
// Só listas em que o próprio órgão publica o CPF junto da sanção: o Bluetego não descobre o dono de um CPF. O nome aparece
// quando a lista oficial o traz, e as fontes que publicam só o CPF mascarado (Banco Central, PGFN, PEP) ficam de fora por
// CPF, porque a máscara casa com cerca de mil pessoas.
import zlib from 'node:zlib';
import { normalizar } from './entidades.mjs';
import { Falha, lerCsv } from './transformacoes.mjs';

const ent = (tipo, valor, ligacao, extra = {}) => ({ tipo, valor: normalizar(tipo, valor), ligacao, ...extra });
const unicos = (lista) => { const v = new Set(); return lista.filter((e) => { const k = e.tipo + ':' + e.valor + ':' + (e.de ? e.de.valor : ''); if (!e.valor || v.has(k)) return false; v.add(k); return true; }); };
const digitos = (s) => String(s || '').replace(/\D/g, '');
const fmtCpf = (d) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
const fmtCnpj = (d) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
const titulo = (s) => String(s || '').trim().toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (x) => x.toLowerCase());
const reais = (v) => { const n = Number(String(v || '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : ''; };

// o primeiro arquivo de um ZIP (os do CGU têm um CSV só); sem dependência: o diretório central diz onde está e o zlib abre
export function primeiroDoZip(buf) {
  const fim = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fim < 0) throw new Error('não é um ZIP');
  const cd = buf.readUInt32LE(fim + 16);
  const metodo = buf.readUInt16LE(cd + 10), tam = buf.readUInt32LE(cd + 20), local = buf.readUInt32LE(cd + 42);
  const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const dados = buf.subarray(ini, ini + tam);
  return metodo === 8 ? zlib.inflateRawSync(dados) : dados;
}
// tabelas baixadas inteiras, indexadas pelo documento (só dígitos), renovadas uma vez por dia
const TABELAS = new Map();
async function tabela(ctx, chave, baixar) {
  const x = TABELAS.get(chave);
  if (x && Date.now() - x.em < 86400000) return x.v;
  const v = await baixar();
  TABELAS.set(chave, { em: Date.now(), v });
  return v;
}
const indexar = (linhas, coluna) => { const m = new Map(); for (const l of linhas) { const k = digitos(l[coluna]); if (k) (m.get(k) || m.set(k, []).get(k)).push(l); } return m; };
const objetos = (texto, sep) => { const ls = lerCsv(texto.replace(/^﻿/, ''), sep); const c = (ls[0] || []).map((x) => x.trim()); return ls.slice(1).map((l) => Object.fromEntries(c.map((k, i) => [k, (l[i] || '').trim()]))); };

// CEIS e CNEP: a data do arquivo mais recente está na página de download
async function cgu(ctx, base) {
  return tabela(ctx, 'cgu:' + base, async () => {
    const pg = await ctx.pagina(`https://portaldatransparencia.gov.br/download-de-dados/${base}`, { timeout: 30000 });
    const datas = [...String(pg.texto).matchAll(/"ano"\s*:\s*"(\d{4})",\s*"mes"\s*:\s*"(\d{2})",\s*"dia"\s*:\s*"(\d{2})"/g)].map((m) => m[1] + m[2] + m[3]).sort();
    if (!datas.length) throw new Error('sem data');
    const b = await ctx.binario(`https://portaldatransparencia.gov.br/download-de-dados/${base}/${datas[datas.length - 1]}`, { max: 30_000_000, timeout: 90000 });
    if (!b || !b.dados) throw new Error('download');
    return indexar(objetos(new TextDecoder('latin1').decode(primeiroDoZip(b.dados)), ';'), 'CPF OU CNPJ DO SANCIONADO');
  });
}

export async function sancoesBr(ctx, valor, tipo) {
  const d = digitos(valor), ehCpf = tipo === 'cpf', fmt = ehCpf ? fmtCpf(d) : fmtCnpj(d);
  const out = [], nomes = [], achou = {};
  // o nome que cada lista publica, guardado com a lista: a ordem das fontes decide qual aparece (não a da resposta)
  const nome = (n, fonte) => { if (n && /[a-z]/i.test(n)) nomes.push([fonte, ehCpf ? titulo(n) : n.trim()]); };
  const alerta = (orgao, ligacao, props, fonte) => { out.push(ent('organizacao', orgao, ligacao, { alerta: true, props: { fonte, ...props } })); achou[fonte] = (achou[fonte] || 0) + 1; };
  const fontes = {
    CEIS: async () => { for (const l of ((await cgu(ctx, 'ceis')).get(d) || []).slice(0, 6)) { alerta(titulo(l['ÓRGÃO SANCIONADOR']) || 'Órgão sancionador', `sancionado(a) no CEIS: ${String(l['CATEGORIA DA SANÇÃO']).toLowerCase()}`, { início: l['DATA INÍCIO SANÇÃO'], fim: l['DATA FINAL SANÇÃO'] || 'sem data', processo: l['NÚMERO DO PROCESSO'], origem: l['ORIGEM INFORMAÇÕES'] }, 'CEIS'); nome(l['NOME DO SANCIONADO'], 'CEIS'); } },
    CNEP: async () => { for (const l of ((await cgu(ctx, 'cnep')).get(d) || []).slice(0, 6)) { alerta(titulo(l['ÓRGÃO SANCIONADOR']) || 'Órgão sancionador', `sancionado(a) no CNEP: ${String(l['CATEGORIA DA SANÇÃO']).toLowerCase()}`, { início: l['DATA INÍCIO SANÇÃO'], fim: l['DATA FINAL SANÇÃO'] || 'sem data', multa: reais(l['VALOR DA MULTA']), processo: l['NÚMERO DO PROCESSO'] }, 'CNEP'); nome(l['NOME DO SANCIONADO'], 'CNEP'); } },
    'TCU (contas irregulares)': async () => {
      const r = await ctx.post('https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-contas-irregulares-com-paginacao?paginaAtual=1&tamanhoPagina=20', ehCpf ? { cpf: fmt } : { cnpj: fmt });
      for (const x of ((r && r.elementos) || []).filter((x) => digitos(x.numeroRegistro) === d).slice(0, 6)) { alerta('Tribunal de Contas da União', 'contas julgadas irregulares pelo TCU', { processo: x.numeroProcessoFormatado || '', acórdão: x.numeroAcordaoFormatado || '', 'trânsito em julgado': String(x.dataTransitoEmJulgado || '').slice(0, 10), local: [x.municipio, x.uf].filter(Boolean).join(' - '), link: x.linkDeliberacoesProcesso || '' }, 'TCU (contas irregulares)'); nome(x.nome, 'TCU (contas irregulares)'); }
    },
    'IBAMA (autos de infração)': async () => {
      const w = encodeURIComponent(`cpf_cnpj_infrator IN ('${fmt}','${d}')`);
      const r = await ctx.json(`https://pamgia.ibama.gov.br/server/rest/services/app_dadosabertos/adm_auto_infracao_p/FeatureServer/0/query?where=${w}&outFields=num_auto_infracao,val_auto_infracao,des_infracao,tipo_infracao,gravidade_infracao,dat_hora_auto_infracao,municipio,uf,sit_cancelado,nome_infrator&returnGeometry=false&orderByFields=dat_hora_auto_infracao%20DESC&resultRecordCount=50&f=json`, { timeout: 40000 });
      const autos = ((r && r.features) || []).map((f) => f.attributes || {}).filter((a) => !/^s/i.test(String(a.sit_cancelado || '')));
      if (!autos.length) return;
      const total = autos.reduce((s, a) => s + (Number(a.val_auto_infracao) || 0), 0);
      const mais = (r.exceededTransferLimit || autos.length >= 50) ? '+' : '';
      alerta('IBAMA', `${autos.length}${mais} ${autos.length === 1 ? 'auto de infração ambiental' : 'autos de infração ambiental'}`, { 'valor somado': total ? total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '', 'mais recente': `${autos[0].dat_hora_auto_infracao ? new Date(autos[0].dat_hora_auto_infracao).toISOString().slice(0, 10) : ''}: ${String(autos[0].des_infracao || autos[0].tipo_infracao || '').slice(0, 160)}`, locais: [...new Set(autos.map((a) => [a.municipio, a.uf].filter(Boolean).join(' - ')).filter(Boolean))].slice(0, 4).join('; ') }, 'IBAMA (autos de infração)');
      achou['IBAMA (autos de infração)'] = autos.length + mais;
      nome(autos[0].nome_infrator, 'IBAMA (autos de infração)');
    },
    'IBAMA (áreas embargadas)': async () => {
      const w = encodeURIComponent(`cpf_cnpj_embargado IN ('${d}','${fmt}')`);
      const r = await ctx.json(`https://pamgia.ibama.gov.br/server/rest/services/01_Publicacoes_Bases/adm_embargos_ibama_a/FeatureServer/0/query?where=${w}&outFields=num_tad,dat_embargo,municipio,uf,nome_imovel,qtd_area_embargada,des_infracao,nome_embargado&returnGeometry=false&resultRecordCount=50&f=json`, { timeout: 40000 });
      const es = ((r && r.features) || []).map((f) => f.attributes || {});
      if (!es.length) return;
      const area = es.reduce((s, a) => s + (Number(a.qtd_area_embargada) || 0), 0);
      alerta('IBAMA', `${es.length} ${es.length === 1 ? 'área embargada' : 'áreas embargadas'}`, { 'área somada': area ? `${Math.round(area).toLocaleString('pt-BR')} ha` : '', imóveis: [...new Set(es.map((a) => a.nome_imovel).filter(Boolean))].slice(0, 3).join('; '), locais: [...new Set(es.map((a) => [a.municipio, a.uf].filter(Boolean).join(' - ')).filter(Boolean))].slice(0, 4).join('; ') }, 'IBAMA (áreas embargadas)');
      achou['IBAMA (áreas embargadas)'] = es.length;
      nome(es[0].nome_embargado, 'IBAMA (áreas embargadas)');
    },
    'trabalho escravo (MTE)': async () => {
      const idx = await tabela(ctx, 'mte', async () => { const b = await ctx.binario('https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/areas-de-atuacao/cadastro_de_empregadores.csv', { max: 5_000_000, timeout: 60000 }); if (!b || !b.dados) throw new Error('download'); return indexar(objetos(new TextDecoder('windows-1252').decode(b.dados), ';'), 'CNPJ/CPF'); });
      for (const l of (idx.get(d) || []).slice(0, 4)) { alerta('Ministério do Trabalho e Emprego', 'no cadastro de empregadores que submeteram trabalhadores a condições análogas à escravidão', { 'ano da ação fiscal': l['Ano da ação fiscal'], trabalhadores: l['Trabalhadores envolvidos'], estabelecimento: l.Estabelecimento, 'incluído em': l['Inclusão no Cadastro de Empregadores'] }, 'trabalho escravo (MTE)'); nome(l.Empregador, 'trabalho escravo (MTE)'); }
    },
    'improbidade (CNJ)': async () => {
      const corpo = `rs=pesquisarRequeridoGetTabela&rst=&rsrnd=${Date.now()}&rsargs[]=&rsargs[]=&rsargs[]=&rsargs[]=${d}&rsargs[]=&rsargs[]=${ehCpf ? 'F' : 'J'}&rsargs[]=&rsargs[]=0&rsargs[]=POSICAO_INICIAL_PAGINACAO_PHP0&rsargs[]=QUANTIDADE_REGISTROS_PAGINACAO15`;
      const t = String(await ctx.form('https://www.cnj.jus.br/improbidade_adm/consultar_requerido.php', corpo));
      if (/Nenhum Requerido encontrado/i.test(t)) return;
      const linhas = [...t.matchAll(/visualizar_condenacao\.php\?seq_condenacao=(\d+)[^>]*>([^<]+)<\/a>[\s\S]*?visualizar_processo\.php\?seq_processo=\d+[^>]*>([^<]+)</g)];
      if (!linhas.length) throw new Error('resposta inesperada');
      const total = Number((t.match(/registros:\s*(\d+)/i) || [])[1]) || linhas.length;
      alerta('Conselho Nacional de Justiça', `${total} ${total === 1 ? 'condenação' : 'condenações'} por improbidade administrativa (CNIA)`, { processos: [...new Set(linhas.map((m) => m[3].trim()))].slice(0, 5).join(', '), condenação: `https://www.cnj.jus.br/improbidade_adm/visualizar_condenacao.php?seq_condenacao=${linhas[0][1]}` }, 'improbidade (CNJ)');
      achou['improbidade (CNJ)'] = total;
      nome(linhas[0][2], 'improbidade (CNJ)');
    },
    ...(ehCpf ? {
      'TCE-RS (contas irregulares)': async () => {
        const idx = await tabela(ctx, 'tcers', async () => { const b = await ctx.binario('https://dados.tce.rs.gov.br/dados/decisoes/contas-irregulares.csv', { max: 10_000_000, timeout: 60000 }); if (!b || !b.dados) throw new Error('download'); return indexar(objetos(new TextDecoder('utf-8').decode(b.dados), ','), 'CPF'); });
        for (const l of (idx.get(d) || []).slice(0, 4)) { alerta('Tribunal de Contas do Estado do RS', 'contas julgadas irregulares pelo TCE-RS', { processo: l.NR_PROCESSO, órgão: l.NOME_ORGAO, exercício: l.EXERCICIO, 'trânsito em julgado': l.DT_TRANSITO_JULGADO, valor: reais(l.VALOR_DA_ORDENACAO), acórdão: l.LINK_ACORDAO }, 'TCE-RS (contas irregulares)'); nome(l.NOME, 'TCE-RS (contas irregulares)'); }
      },
    } : {}),
  };
  const nomesF = Object.keys(fontes);
  const res = await Promise.allSettled(nomesF.map((k) => fontes[k]()));
  const props = {};
  nomesF.forEach((k, i) => { props[k] = res[i].status === 'rejected' ? 'não respondeu' : achou[k] ? `consta (${achou[k]})` : 'nada consta'; });
  if (res.every((r) => r.status === 'rejected')) throw new Falha('Nenhuma das listas de sanção respondeu agora; tente de novo daqui a pouco.', { status: 502 });
  // o nome que a própria lista publica junto do documento (de quem foi sancionado, nunca de quem não foi)
  const ordem = (f) => nomesF.indexOf(f);
  const escolhidos = [...new Set(nomes.sort((a, b) => ordem(a[0]) - ordem(b[0])).map(([, n]) => n))];
  for (const n of escolhidos.slice(0, 2)) out.push(ehCpf ? ent('pessoa', n, 'nome publicado na lista de sanção') : ent('organizacao', titulo(n), 'nome na lista de sanção'));
  const tem = Object.keys(achou).length > 0;
  if (tem) props['alerta de sanção'] = 'consta em lista oficial de sanção ou condenação: leia cada uma (prazo, processo, se ainda vale)';
  return { entidades: unicos(out), alerta: tem, props };
}
