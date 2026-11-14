// Bluetego: a IA no processo. Aqui só se monta o pedido (o grafo resumido, o objetivo, as transformações
// permitidas) e se confere a resposta: quem chama a IA é a página (Agentes de IA da IDE, API da Anthropic ou Ollama).
// A resposta nunca entra direto no grafo: cada ligação, entidade e passo sugerido passa pela pessoa (ou, no piloto
// automático, só as transformações rodam sozinhas, porque elas só consultam fontes públicas).
import { TIPOS, normalizar, chave, tipoValido } from './entidades.mjs';

const lista0 = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const curto = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// o grafo em texto compacto, com apelidos curtos (e1, e2...) no lugar dos ids. Num grafo grande, entram primeiro
// as entidades em foco, com alerta e com mais ligações.
export function resumoGrafo(grafo, opt = {}) {
  const max = opt.max || 220;
  const nos = grafo.nos || [], lig = grafo.ligacoes || [];
  const grau = new Map();
  for (const l of lig) { grau.set(l.de, (grau.get(l.de) || 0) + 1); grau.set(l.para, (grau.get(l.para) || 0) + 1); }
  const foco = new Set(opt.foco || []);
  const ordem = [...nos].sort((a, b) => (foco.has(b.id) - foco.has(a.id)) || ((b.alerta ? 1 : 0) - (a.alerta ? 1 : 0)) || (grau.get(b.id) || 0) - (grau.get(a.id) || 0));
  const usados = ordem.slice(0, max);
  const mapa = {}, ref = new Map();
  usados.forEach((n, i) => { const r = 'e' + (i + 1); mapa[r] = n.id; ref.set(n.id, r); });
  const linhas = usados.map((n) => {
    const props = Object.entries(n.props || {}).filter(([k, v]) => k !== 'completo' && v !== '' && v != null).slice(0, 8).map(([k, v]) => `${k}=${curto(v, 80)}`).join('; ');
    return `${ref.get(n.id)} [${n.tipo}] ${curto(n.valor, 120)}${n.rotulo && n.rotulo !== n.valor ? ` (${curto(n.rotulo, 40)})` : ''}${n.alerta ? ' ⚠ALERTA' : ''}${foco.has(n.id) ? ' ★FOCO' : ''}${props ? ` {${props}}` : ''}${n.notas ? ` nota: "${curto(n.notas, 160)}"` : ''}${(n.feitas || []).length ? ` já rodou: ${n.feitas.join(',')}` : ''}`;
  });
  const ligs = lig.filter((l) => ref.has(l.de) && ref.has(l.para)).slice(0, 600).map((l) => `${ref.get(l.de)} -[${curto(l.rotulo || 'ligado a', 50)}]-> ${ref.get(l.para)}`);
  const texto = `ENTIDADES (${usados.length} de ${nos.length}):\n${linhas.join('\n')}\n\nLIGAÇÕES (${ligs.length} de ${lig.length}):\n${ligs.join('\n')}`;
  return { texto, mapa };
}

const ESQUEMA = `{
  "resumo": "2 a 5 frases: o que o grafo mostra de importante",
  "resposta": "a resposta direta à pergunta, quando houver pergunta (senão, vazio)",
  "hipoteses": [{ "texto": "hipótese ou conclusão", "confianca": "alta | média | baixa", "entidades": ["e1", "e4"] }],
  "ligacoes": [{ "de": "e1", "para": "e2", "rotulo": "como se ligam (curto)", "motivo": "por que você acha isso" }],
  "entidades": [{ "tipo": "um dos tipos", "valor": "o valor", "ligarA": "e1", "rotulo": "ligação com ela", "motivo": "de onde veio" }],
  "proximos": [{ "entidade": "e1", "transformacao": "id da transformação", "motivo": "o que você espera achar" }],
  "concluido": false
}`;

export function montarPedido({ grafo, objetivo = '', pergunta = '', foco = [], transformacoes = [], modo = 'analise', nome = '' }) {
  const { texto, mapa } = resumoGrafo(grafo, { foco });
  const porTipo = {};
  for (const t of transformacoes) for (const d of t.de) (porTipo[d] = porTipo[d] || []).push(`${t.id} (${t.nome})`);
  const lista = Object.entries(porTipo).map(([t, l]) => `- ${t}: ${l.join('; ')}`).join('\n');
  const tarefa = modo === 'piloto'
    ? `Você está conduzindo a investigação em rodadas. Escolha em "proximos" de 1 a 6 transformações que mais aproximam do objetivo, sem repetir as que cada entidade "já rodou". Se o objetivo já foi atingido ou não há mais o que buscar, "concluido": true e "proximos": [].`
    : modo === 'pergunta'
      ? `Responda à pergunta em "resposta", usando só o que está no grafo; diga quando o grafo não basta. Os outros campos são opcionais.`
      : `Analise o grafo: o que ele revela, as hipóteses (com a confiança), as ligações que faltam entre entidades que já estão nele, entidades novas que valem ser buscadas e as próximas transformações.`;
  const prompt = `Você é o analista de OSINT do Bluetego, um grafo de investigação. Trabalhe só com os fatos do grafo abaixo e com conhecimento geral; não invente dados de pessoas. Separe fato de suposição (use "confianca"). Escreva em português do Brasil.

INVESTIGAÇÃO: ${curto(nome, 80) || 'sem nome'}
${objetivo ? `OBJETIVO: ${curto(objetivo, 600)}\n` : ''}${pergunta ? `PERGUNTA: ${curto(pergunta, 600)}\n` : ''}${foco.length ? 'As entidades marcadas com ★FOCO são as que a pessoa escolheu.\n' : ''}
TAREFA: ${tarefa}

TIPOS DE ENTIDADE: ${Object.keys(TIPOS).join(', ')}

TRANSFORMAÇÕES PERMITIDAS (por tipo de entidade de origem):
${lista}

${texto}

Responda SOMENTE com um objeto JSON neste formato, sem texto antes ou depois:
${ESQUEMA}
Nos campos "entidades", "de", "para", "ligarA" e "entidade", use os apelidos (e1, e2...). Nos textos (resumo, resposta, hipóteses, motivos), escreva o nome ou o valor da entidade, nunca o apelido. Listas vazias são permitidas.`;
  return { prompt, mapa };
}

// tira o JSON da resposta (às vezes vem entre crases ou com texto em volta) e confere tudo contra o grafo
export function lerResposta(texto, mapa, grafo, transformacoes = []) {
  const bruto = String(texto || '');
  let j = null;
  const tentativas = [bruto, (bruto.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1], bruto.slice(bruto.indexOf('{'), bruto.lastIndexOf('}') + 1)];
  for (const t of tentativas) { if (!t) continue; try { j = JSON.parse(t); break; } catch {} }
  if (!j || typeof j !== 'object') return { ok: false, erro: 'A IA não respondeu no formato combinado.', bruto: curto(bruto, 2000) };
  const nos = new Map((grafo.nos || []).map((n) => [n.id, n]));
  const id = (r) => { const s = String(r || '').trim(); return mapa[s] || (nos.has(s) ? s : null); };
  // no texto, a IA às vezes cita os apelidos (e81): vira o nome da entidade, e "(e81, e82)" sai
  const nomeDe = (r) => { const n = nos.get(mapa[r]); return n ? n.rotulo || n.valor : r; };
  const legivel = (s) => String(s || '').replace(/\s*\((?:e\d+(?:\s*,\s*|\s+e\s+)?)+\)/g, '').replace(/\be\d+\b/g, (r) => (mapa[r] ? nomeDe(r) : r));
  for (const k of ['resumo', 'resposta']) j[k] = legivel(j[k]);
  for (const h of lista0(j.hipoteses)) h.texto = legivel(h.texto);
  for (const k of ['ligacoes', 'entidades', 'proximos']) for (const x of lista0(j[k])) x.motivo = legivel(x.motivo);
  const ts = new Map(transformacoes.map((t) => [t.id, t]));
  const lista = (v) => (Array.isArray(v) ? v : []);
  const out = {
    ok: true,
    resumo: curto(j.resumo, 2000), resposta: String(j.resposta || '').trim().slice(0, 6000),
    hipoteses: lista(j.hipoteses).slice(0, 12).map((h) => ({ texto: curto(h.texto, 600), confianca: ['alta', 'média', 'media', 'baixa'].includes(String(h.confianca).toLowerCase()) ? String(h.confianca).toLowerCase().replace('media', 'média') : 'baixa', entidades: lista(h.entidades).map(id).filter(Boolean) })).filter((h) => h.texto),
    ligacoes: lista(j.ligacoes).slice(0, 30).map((l) => ({ de: id(l.de), para: id(l.para), rotulo: curto(l.rotulo || 'relacionado a', 60), motivo: curto(l.motivo, 300) })).filter((l) => l.de && l.para && l.de !== l.para),
    entidades: lista(j.entidades).slice(0, 25).map((e) => {
      const tipo = tipoValido(e.tipo) ? e.tipo : null, valor = tipo ? normalizar(tipo, e.valor) : '';
      return tipo && valor ? { tipo, valor, id: chave(tipo, valor), ligarA: id(e.ligarA), rotulo: curto(e.rotulo || 'sugerido pela IA', 60), motivo: curto(e.motivo, 300) } : null;
    }).filter(Boolean),
    proximos: lista(j.proximos).slice(0, 12).map((p) => {
      const n = nos.get(id(p.entidade)), t = ts.get(String(p.transformacao || '').trim());
      // só transformação que existe e serve para o tipo da entidade
      return n && t && t.de.includes(n.tipo) ? { id: n.id, t: t.id, motivo: curto(p.motivo, 300) } : null;
    }).filter(Boolean),
    concluido: j.concluido === true,
  };
  return out;
}
