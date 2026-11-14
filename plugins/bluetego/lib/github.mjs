// Bluetego: investigação dos commits no GitHub. De um usuário, de um repositório ou de um e-mail, junta o que os commits
// contam sem a pessoa perceber: o fuso horário real (cada commit guarda o do computador), o horário e os dias em que trabalha,
// os nomes e e-mails usados, o nome do computador que vaza em e-mail mal configurado, os coautores, os repositórios de
// terceiros em que contribui, se assina os commits e o idioma das mensagens.
// Autor de commit é só um nome e um e-mail declarados: qualquer um pode fazer um commit "como" outra pessoa. Por isso as
// datas impossíveis são descartadas e o resultado traz quantos commits estão em repositórios do próprio usuário.
import { normalizar } from './entidades.mjs';

const ent = (tipo, valor, ligacao, extra = {}) => ({ tipo, valor: normalizar(tipo, valor), ligacao, ...extra });
const unicos = (lista) => { const v = new Set(); return lista.filter((e) => { const k = e.tipo + ':' + e.valor + ':' + (e.de ? e.de.valor : ''); if (!e.valor || v.has(k)) return false; v.add(k); return true; }); };
const gh = (ctx, caminho) => (ctx.gh ? ctx.gh(caminho) : ctx.json('https://api.github.com/' + caminho, { nulo404: true }));
const GITHUB_DO_SITE = /noreply\.github\.com$|^noreply@github\.com$|^web-flow$/i;
// robôs e assistentes de IA que assinam commits (dependabot, github-actions, Claude, Copilot…): não são pessoas
const AUTOMATICO = /\[bot\]|^(no-?reply|bot|actions|dependabot|renovate|copilot)[@+]|@(anthropic\.com|openai\.com|cursor\.com)$|noreply@(?!github)/i;
// e-mail que é o nome do computador (git sem user.email configurado): ana@DESKTOP-7QK2L.localdomain, joao@notebook.local
const MAQUINA = /^[^@\s]+@([a-z0-9][a-z0-9_-]*(?:\.(?:local|localdomain|lan|home|internal|domain))?)$/i;
// fusos e onde costumam ser usados (o fuso diz a região, não a cidade)
const FUSOS = {
  '-10:00': 'Havaí', '-08:00': 'costa oeste dos EUA e Canadá', '-07:00': 'montanhas dos EUA, costa oeste no horário de verão', '-06:00': 'centro dos EUA, México, América Central', '-05:00': 'leste dos EUA, Colômbia, Peru, Acre', '-04:00': 'Amazonas, Venezuela, Bolívia, leste dos EUA no verão',
  '-03:00': 'Brasil (Brasília), Argentina, Uruguai', '-02:00': 'Fernando de Noronha, Brasil no antigo horário de verão', '+00:00': 'Reino Unido, Portugal, Islândia, ou UTC', '+01:00': 'Europa Central, Reino Unido e Portugal no verão, Nigéria', '+02:00': 'Europa Central no verão, Europa Oriental, África do Sul, Egito',
  '+03:00': 'Rússia (Moscou), Turquia, Arábia Saudita, Europa Oriental no verão', '+04:00': 'Emirados, Geórgia', '+05:00': 'Paquistão, Uzbequistão', '+05:30': 'Índia', '+07:00': 'Tailândia, Vietnã, Indonésia (oeste)', '+08:00': 'China, Singapura, Taiwan, Filipinas, Austrália (oeste)', '+09:00': 'Japão, Coreia do Sul', '+10:00': 'Austrália (leste)', '+12:00': 'Nova Zelândia',
};
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const PT = /\b(corrige|corrigido|adiciona|adicionado|ajusta|ajuste|remove|atualiza|melhora|cria|criado|implementa|versão|não|para|com|de|do|da)\b/i;
const EN = /\b(fix|fixed|add|added|update|updated|remove|removed|refactor|improve|create|implement|bump|the|and|for|with)\b/i;

// a data do commit como foi escrita ("2024-05-01T22:10:00.000-03:00"): hora local, dia local e o fuso
export function lerDataCommit(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):\d{2}:\d{2}(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
  if (!m) return null;
  const quando = Date.parse(s);
  // antes do Git existir ou no futuro: data forjada ou relógio errado
  if (!Number.isFinite(quando) || quando < Date.UTC(2005, 3, 1) || quando > Date.now() + 86400000) return null;
  const fuso = m[5] === 'Z' ? '+00:00' : m[5];
  const dia = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return { quando, hora: +m[4], dia, fuso, data: `${m[1]}-${m[2]}-${m[3]}` };
}
// as linhas de assinatura das mensagens: Co-authored-by, Signed-off-by, Reviewed-by…
export function trailers(mensagem) {
  const out = [];
  for (const m of String(mensagem || '').matchAll(/^(Co-authored-by|Signed-off-by|Reviewed-by|Acked-by|Tested-by|Reported-by|Suggested-by|Helped-by):\s*(.+?)\s*<([^>\s]+@[^>\s]+)>\s*$/gim)) out.push({ papel: m[1].toLowerCase(), nome: m[2].trim(), email: m[3].toLowerCase() });
  return out;
}
const pct = (n, t) => (t ? Math.round((100 * n) / t) : 0);

// junta os commits (itens da busca de commits do GitHub) num retrato
export function analisarCommits(itens, dono = '') {
  const cs = [];
  for (const it of itens || []) {
    const c = it.commit || {};
    const d = lerDataCommit(c.author && c.author.date);
    if (!d) continue;
    cs.push({ d, autor: c.author || {}, committer: c.committer || {}, msg: c.message || '', repo: (it.repository && it.repository.full_name) || '', dono: ((it.repository && it.repository.owner && it.repository.owner.login) || '').toLowerCase(), url: it.html_url || '' });
  }
  const conta = (f) => { const m = new Map(); for (const c of cs) for (const k of [].concat(f(c)).filter(Boolean)) m.set(k, (m.get(k) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const fusos = conta((c) => c.d.fuso);
  const horas = new Array(24).fill(0), dias = new Array(7).fill(0);
  for (const c of cs) { horas[c.d.hora]++; dias[c.d.dia]++; }
  // a janela de 6 horas com mais commits (no horário local de quem fez)
  let ini = 0, melhor = -1;
  for (let h = 0; h < 24; h++) { let s = 0; for (let k = 0; k < 6; k++) s += horas[(h + k) % 24]; if (s > melhor) { melhor = s; ini = h; } }
  const identidades = conta((c) => (c.autor.email ? `${c.autor.name || ''} <${c.autor.email.toLowerCase()}>` : ''));
  // o fuso de cada e-mail (num repositório com várias pessoas, o fuso geral mistura todo mundo)
  const fusoPor = new Map();
  for (const c of cs) { const e = String(c.autor.email || '').toLowerCase(); if (!e) continue; if (!fusoPor.has(e)) fusoPor.set(e, new Map()); const m = fusoPor.get(e); m.set(c.d.fuso, (m.get(c.d.fuso) || 0) + 1); }
  const trs = cs.flatMap((c) => trailers(c.msg).map((t) => ({ ...t, repo: c.repo })));
  const idioma = (() => { let pt = 0, en = 0; for (const c of cs) { const l = c.msg.split('\n')[0]; if (PT.test(l)) pt++; else if (EN.test(l)) en++; } return pt + en < 3 ? '' : pt > en * 2 ? 'português' : en > pt * 2 ? 'inglês' : 'português e inglês'; })();
  const datas = cs.map((c) => c.d.data).sort();
  return {
    total: cs.length, fusos, horas, dias, janela: melhor > 0 ? [ini, (ini + 6) % 24, pct(melhor, cs.length)] : null,
    fimDeSemana: pct(dias[0] + dias[6], cs.length), madrugada: pct(horas.slice(0, 6).reduce((a, b) => a + b, 0), cs.length),
    identidades, fusoPor, trailers: trs, idioma, primeiro: datas[0] || '', ultimo: datas[datas.length - 1] || '',
    repos: conta((c) => c.repo), proprios: dono ? cs.filter((c) => c.dono === dono.toLowerCase()).length : null,
    committers: conta((c) => (c.committer.email && c.committer.email !== c.autor.email && !GITHUB_DO_SITE.test(c.committer.email) ? `${c.committer.name || ''} <${c.committer.email.toLowerCase()}>` : '')),
  };
}

// o retrato vira entidades e propriedades
function noGrafo(a, origem, dono) {
  const out = [], props = {};
  if (!a.total) return { entidades: [], props: { commits: 0 }, aviso: 'Nenhum commit com data válida.' };
  props['commits analisados'] = `${a.total}${a.primeiro ? ` (de ${a.primeiro} a ${a.ultimo})` : ''}`;
  props['fusos dos commits'] = a.fusos.slice(0, 3).map(([f, n]) => `UTC${f} ${pct(n, a.total)}%`).join(', ');
  const [fuso, n] = a.fusos[0];
  // o fuso só vira local quando domina e há commits suficientes; UTC puro costuma ser servidor, CI ou máquina configurada em UTC
  if (a.total >= 5 && pct(n, a.total) >= 60 && fuso !== '+00:00' && FUSOS[fuso]) out.push(ent('local', `UTC${fuso}: ${FUSOS[fuso]}`, 'fuso horário dos commits', { props: { commits: `${n} de ${a.total}`, atenção: 'o fuso indica a região, não a cidade; viagens e servidores alteram' } }));
  if (fuso === '+00:00' && pct(n, a.total) >= 60) props['fuso'] = 'quase tudo em UTC: máquina configurada em UTC, servidor ou commits feitos pelo site';
  if (a.janela) props['horário em que mais trabalha'] = `${String(a.janela[0]).padStart(2, '0')}h–${String(a.janela[1]).padStart(2, '0')}h (${a.janela[2]}% dos commits, hora local)`;
  const diaTop = a.dias.indexOf(Math.max(...a.dias));
  props['dia com mais commits'] = DIAS[diaTop];
  props['fim de semana'] = `${a.fimDeSemana}% dos commits`;
  if (a.madrugada >= 15) props.madrugada = `${a.madrugada}% dos commits entre 0h e 6h`;
  props.perfil = a.fimDeSemana >= 40 || (a.janela && (a.janela[0] >= 18 || a.janela[0] <= 2)) ? 'parece projeto pessoal (noite e fim de semana)' : a.fimDeSemana <= 10 && a.janela && a.janela[0] >= 7 && a.janela[0] <= 11 ? 'parece trabalho (horário comercial, dias úteis)' : '';
  if (a.idioma) props['idioma das mensagens'] = a.idioma;
  const autos = new Set();
  // identidades: cada e-mail com os nomes usados; e-mail que é nome de computador vira alerta
  for (const [id, q] of a.identidades.slice(0, 12)) {
    const m = id.match(/^(.*) <(.+)>$/), nome = m[1].trim(), email = m[2];
    if (GITHUB_DO_SITE.test(email)) continue;
    if (AUTOMATICO.test(email) || AUTOMATICO.test(nome)) { autos.add(nome || email); continue; }
    const maq = email.match(MAQUINA);
    if (maq && !/\.[a-z]{2,}$/i.test(maq[1]) || (maq && /\.(local|localdomain|lan|home|internal|domain)$/i.test(maq[1]))) {
      out.push(ent('texto', maq[1], 'nome do computador vazado no e-mail do commit', { alerta: true, props: { 'e-mail do commit': email, commits: q, usuário: email.split('@')[0] } }));
      if (email.split('@')[0].length > 2) out.push(ent('apelido', email.split('@')[0], 'usuário do computador (e-mail do commit)'));
      continue;
    }
    const fz = [...(a.fusoPor.get(email) || new Map()).entries()].sort((x, y) => y[1] - x[1])[0];
    out.push(ent('email', email, 'e-mail nos commits', { de: origem, props: { commits: q, nome: nome || '', fuso: fz ? `UTC${fz[0]}${FUSOS[fz[0]] ? ` (${FUSOS[fz[0]]})` : ''}` : '' } }));
    const doEmail = { tipo: 'email', valor: email };
    if (nome && nome.includes(' ')) out.push(ent('pessoa', nome, 'nome nos commits', { de: doEmail }));
    else if (nome && /^[a-z0-9_.-]{3,}$/i.test(nome) && nome.toLowerCase() !== String(dono || '').toLowerCase()) out.push(ent('apelido', nome, 'nome nos commits', { de: doEmail }));
  }
  for (const [id, q] of a.committers.slice(0, 5)) { const m = id.match(/^(.*) <(.+)>$/); out.push(ent('email', m[2], 'fez o commit por outra pessoa (committer)', { de: origem, props: { commits: q, nome: m[1] } })); }
  // coautores e quem assina junto: as pessoas com quem trabalha
  const pessoasTr = new Map();
  for (const t of a.trailers) { const k = t.email; if (!pessoasTr.has(k)) pessoasTr.set(k, { ...t, n: 0 }); pessoasTr.get(k).n++; }
  for (const t of [...pessoasTr.values()].sort((x, y) => y.n - x.n).slice(0, 10)) {
    if (AUTOMATICO.test(t.email) || AUTOMATICO.test(t.nome)) { autos.add(t.nome || t.email); continue; }
    if (GITHUB_DO_SITE.test(t.email)) { if (t.nome) out.push(ent('apelido', t.nome, t.papel === 'co-authored-by' ? 'coautor nos commits' : `${t.papel} nos commits`)); continue; }
    out.push(ent('email', t.email, t.papel === 'co-authored-by' ? 'coautor nos commits' : `${t.papel} nos commits`, { props: { nome: t.nome, vezes: t.n } }));
  }
  if (autos.size) props['robôs e IA nos commits'] = [...autos].slice(0, 6).join(', ');
  // repositórios de terceiros em que contribui
  if (dono) {
    for (const [r, q] of a.repos.filter(([r]) => !r.toLowerCase().startsWith(dono.toLowerCase() + '/')).slice(0, 10)) out.push(ent('url', `https://github.com/${r}`, 'contribui no repositório', { props: { commits: q } }));
    props['commits nos próprios repositórios'] = `${pct(a.proprios, a.total)}%`;
    if (a.proprios === 0) props.atenção = 'nenhum commit em repositório do próprio usuário: podem ser commits de terceiros usando o e-mail dele';
  } else props['repositórios'] = a.repos.slice(0, 5).map(([r, q]) => `${r} (${q})`).join(', ');
  props.horas = a.horas.join(' ');
  return { entidades: unicos(out), props };
}

// a busca de commits do GitHub guarda a data com o fuso original; a API de commits do repositório converte para UTC
async function buscar(ctx, q) {
  const r = await gh(ctx, `search/commits?q=${encodeURIComponent(q)}&per_page=100&sort=committer-date&order=desc`);
  return (r && r.items) || [];
}
// se assina os commits (só nos repositórios do próprio usuário: 1 consulta)
async function assinaturas(ctx, repo, autor) {
  const r = await gh(ctx, `repos/${repo}/commits?per_page=50${autor ? `&author=${encodeURIComponent(autor)}` : ''}`).catch(() => null);
  const cs = Array.isArray(r) ? r : [];
  if (!cs.length) return '';
  const v = cs.filter((c) => c.commit && c.commit.verification && c.commit.verification.verified).length;
  return `${pct(v, cs.length)}% assinados e verificados (${cs.length} commits de ${repo})`;
}

export async function githubCommits(ctx, valor, tipo) {
  if (tipo === 'url' || tipo === 'conta') {
    const m = String(valor).match(/^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)(?:\/([A-Za-z0-9_.-]+))?/i);
    if (!m) return { entidades: [], aviso: 'Só serve para endereços do GitHub (github.com/usuário ou github.com/usuário/repositório).' };
    if (!m[2] || tipo === 'conta') return githubCommits(ctx, m[1], 'apelido');
    const repo = `${m[1]}/${m[2].replace(/\.git$/, '')}`;
    let itens;
    // 422: a busca não enxerga o repositório (privado, inexistente ou sem índice)
    // a busca de commits não aceita só "repo:": a data qualquer faz a vez do texto obrigatório
    try { itens = await buscar(ctx, `repo:${repo} committer-date:>2005-01-01`); } catch (e) { if (/422/.test(e.message)) return { entidades: [], aviso: 'O GitHub não deixa buscar commits deste repositório: ele é privado, não existe ou ainda não foi indexado.' }; throw e; }
    const a = analisarCommits(itens);
    const r = noGrafo(a, { tipo: 'url', valor: `https://github.com/${repo}` }, '');
    const ass = await assinaturas(ctx, repo, '');
    if (ass) r.props.assinatura = ass;
    if (!a.total) r.aviso = 'A busca do GitHub não achou commits deste repositório (ele pode ser novo, um fork ou estar vazio).';
    return r;
  }
  if (tipo === 'email') {
    const a = analisarCommits(await buscar(ctx, `author-email:${valor}`));
    const r = noGrafo(a, { tipo: 'email', valor }, '');
    if (!a.total) r.aviso = 'Nenhum commit público com este e-mail.';
    return r;
  }
  const u = String(valor).replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9-]{1,39}$/.test(u)) return { entidades: [], aviso: 'Não parece um usuário do GitHub.' };
  const itens = await buscar(ctx, `author:${u}`);
  if (!itens.length) return { entidades: [], props: { commits: 0 }, aviso: 'Nenhum commit público deste usuário (ou ele não existe no GitHub).' };
  const a = analisarCommits(itens, u);
  const r = noGrafo(a, { tipo: 'conta', valor: `https://github.com/${u}` }, u);
  // o repositório próprio com mais commits: diz se assina
  const meu = a.repos.find(([x]) => x.toLowerCase().startsWith(u.toLowerCase() + '/'));
  if (meu) { const ass = await assinaturas(ctx, meu[0], u); if (ass) r.props.assinatura = ass; }
  return r;
}
