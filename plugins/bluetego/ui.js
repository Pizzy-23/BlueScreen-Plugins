// Bluetego: investigação por grafo de ligações (OSINT). Painel na esquerda (investigações e tipos) + tela fixa com o
// grafo num canvas, o painel de detalhes e a barra de ações. As transformações rodam no servidor do plugin
// (server.mjs); as investigações ficam em plugin.files (investigacoes/<id>.json), salvas sozinhas.
const { $, esc, toast } = bs;
const ICON = '<svg class="i" viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="7" r="2.5"/><circle cx="12" cy="18" r="2.5"/><circle cx="19" cy="17" r="1.6"/><path d="M8.3 7.1 15.6 6.8M7.2 8.2l3.7 7.6M16.9 9.2l-3.8 6.7M14.4 18l3.1-.6"/></svg>';
const IC = {
  mais: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  colar: '<svg class="i" viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/></svg>',
  maquina: '<svg class="i" viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>',
  raio: '<svg class="i" viewBox="0 0 24 24"><path d="M13 3 5 14h6l-1 7 8-11h-6z"/></svg>',
  organizar: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><circle cx="5" cy="6" r="1.6"/><circle cx="19" cy="6" r="1.6"/><circle cx="5" cy="18" r="1.6"/><circle cx="19" cy="18" r="1.6"/><path d="M6.3 7l4.2 3.7M17.7 7l-4.2 3.7M6.3 17l4.2-3.7M17.7 17l-4.2-3.7"/></svg>',
  ajustar: '<svg class="i" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  desfazer: '<svg class="i" viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  exportar: '<svg class="i" viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14"/></svg>',
  importar: '<svg class="i" viewBox="0 0 24 24"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19h14"/></svg>',
  busca: '<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/></svg>',
  lixo: '<svg class="i" viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>',
  copiar: '<svg class="i" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  fora: '<svg class="i" viewBox="0 0 24 24"><path d="M13 5h6v6M19 5l-8.5 8.5"/><path d="M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4"/></svg>',
  pino: '<svg class="i" viewBox="0 0 24 24"><path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/></svg>',
  caminho: '<svg class="i" viewBox="0 0 24 24"><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h5a3 3 0 0 0 0-6h-1a3 3 0 0 1 0-6h6"/></svg>',
  vizinhos: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="4.5" cy="5" r="1.5"/><circle cx="19.5" cy="5" r="1.5"/><circle cx="12" cy="20.5" r="1.5"/><path d="M6 6.3l3.8 3.6M18 6.3l-3.8 3.6M12 15v4"/></svg>',
  alerta: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3l9 16H3zM12 10v4M12 17h.01"/></svg>',
  pasta: '<svg class="i" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  olho: '<svg class="i" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  x: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  ok: '<svg class="i" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  editar: '<svg class="i" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
};
const CORES = [['', 'Sem marca'], ['#e5534b', 'Vermelho'], ['#e8a33d', 'Laranja'], ['#d4b72c', 'Amarelo'], ['#3fb950', 'Verde'], ['#4f8cff', 'Azul'], ['#a371f7', 'Roxo']];
const EXEMPLOS = ['exemplo.com.br', '8.8.8.8', 'contato@empresa.com', '@usuario', 'CVE-2024-3400'];
const PASTA = 'investigacoes/';

// ---------- estado ----------
let CAT = null; // { tipos, transformacoes, maquinas } do servidor
const G = { inv: null, nos: new Map(), lig: new Map(), lista: [], salvarEm: 0, desfazer: [], refazer: [] };
const V = { cam: { x: 0, y: 0, z: 1 }, sel: new Set(), hover: null, ocultos: new Set(), busca: '', caminho: null, alpha: 0, rodando: false, mostrado: false, cores: null };
const F = { fila: [], ativos: 0, total: 0, feitos: 0, erros: [], cancelar: false, maquina: null };
const R = {}; // elementos da tela
const icones = new Map();

// ---------- chamadas ----------
async function chamar(rota, corpo) {
  const opt = corpo === undefined ? { quiet: true } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo), quiet: true };
  return bs.api('bluetego/' + rota, {}, opt);
}
async function catalogo() {
  if (CAT) return CAT;
  CAT = await chamar('catalogo');
  return CAT;
}
const tipo = (t) => (CAT && CAT.tipos[t]) || { nome: t, cor: '#8a8f98', icone: '' };
const transf = (id) => CAT.transformacoes.find((t) => t.id === id);
const paraTipo = (t) => CAT.transformacoes.filter((x) => x.de.includes(t));
const id8 = () => Math.random().toString(36).slice(2, 10);
const agora = () => new Date().toISOString();
const quando = (iso) => { try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };
const curto = (s, n = 34) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const rotuloDe = (n) => n.rotulo || n.valor;

// ---------- investigação: dados ----------
function novaInv(nome) {
  return { versao: 1, id: id8(), nome: nome || 'Investigação ' + new Date().toLocaleDateString('pt-BR'), criada: agora(), alterada: agora(), nos: [], ligacoes: [], historico: [] };
}
function carregarInv(inv) {
  G.inv = inv; G.nos = new Map(); G.lig = new Map(); G.desfazer = []; G.refazer = [];
  for (const n of inv.nos || []) G.nos.set(n.id, { props: {}, feitas: [], ...n });
  for (const l of inv.ligacoes || []) if (G.nos.has(l.de) && G.nos.has(l.para)) G.lig.set(l.id, l);
  V.sel.clear(); V.caminho = null; V.hover = null;
  plugin.data.set('ultima', inv.id).catch(() => {});
  pintarTudo();
  if (G.nos.size) { aquecer(0.3); setTimeout(ajustar, 60); }
}
function retrato() { return JSON.stringify({ nos: [...G.nos.values()], lig: [...G.lig.values()] }); }
function lembrar() {
  G.desfazer.push(retrato());
  if (G.desfazer.length > 40) G.desfazer.shift();
  G.refazer = [];
}
function voltar(de, para) {
  if (!de.length) return toast('Nada para desfazer');
  para.push(retrato());
  const s = JSON.parse(de.pop());
  G.nos = new Map(s.nos.map((n) => [n.id, n])); G.lig = new Map(s.lig.map((l) => [l.id, l]));
  for (const id of [...V.sel]) if (!G.nos.has(id)) V.sel.delete(id);
  V.caminho = null;
  mudou();
}
const desfazer = () => voltar(G.desfazer, G.refazer);
const refazer = () => voltar(G.refazer, G.desfazer);
function historico(texto) {
  G.inv.historico.unshift({ quando: agora(), texto });
  G.inv.historico.length = Math.min(G.inv.historico.length, 300);
}
// qualquer mudança: redesenha, atualiza os painéis e agenda o salvamento
function mudou(semFisica) {
  if (!semFisica) aquecer(0.5);
  pintarDetalhes(); pintarLado(); pintarVazio(); desenhar();
  agendarSalvar();
}
function agendarSalvar() {
  clearTimeout(G.salvarT);
  G.salvarT = setTimeout(salvar, 700);
}
async function salvar() {
  if (!G.inv) return;
  G.inv.alterada = agora();
  G.inv.nos = [...G.nos.values()].map(({ vx, vy, ...n }) => n);
  G.inv.ligacoes = [...G.lig.values()];
  try { await plugin.files.write(PASTA + G.inv.id + '.json', G.inv); } catch (e) { toast('Bluetego: não deu para salvar (' + e.message + ')', 'err'); }
  const i = G.lista.findIndex((x) => x.id === G.inv.id);
  const resumo = { id: G.inv.id, nome: G.inv.nome, alterada: G.inv.alterada, n: G.nos.size };
  if (i >= 0) G.lista[i] = resumo; else G.lista.unshift(resumo);
  pintarLado();
}
async function listar() {
  let arqs = [];
  try { arqs = (await plugin.files.list('investigacoes')).filter((e) => /\.json$/.test(e.name)); } catch {}
  const lidas = await Promise.all(arqs.map(async (a) => { try { const j = await plugin.files.read(PASTA + a.name, 'json'); return { id: j.id, nome: j.nome, alterada: j.alterada, n: (j.nos || []).length }; } catch { return null; } }));
  G.lista = lidas.filter(Boolean).sort((a, b) => String(b.alterada).localeCompare(String(a.alterada)));
}
async function abrirInv(id) {
  if (G.inv && G.inv.id === id) return;
  if (G.inv) await salvar();
  try { carregarInv(await plugin.files.read(PASTA + id + '.json', 'json')); } catch (e) { toast('Não deu para abrir: ' + e.message, 'err'); }
}
async function criarInv() {
  if (G.inv) await salvar();
  carregarInv(novaInv());
  await salvar();
  R.nome && R.nome.focus();
}
async function apagarInv(id) {
  const item = G.lista.find((x) => x.id === id);
  if (!(await confirmar(`Apagar a investigação "${item ? item.nome : id}"? As entidades e anotações dela vão embora.`, 'Apagar'))) return;
  await plugin.files.remove(PASTA + id + '.json').catch(() => {});
  G.lista = G.lista.filter((x) => x.id !== id);
  if (G.inv && G.inv.id === id) { G.inv = null; if (G.lista[0]) await abrirInv(G.lista[0].id); else carregarInv(novaInv()); }
  pintarLado();
}

// ---------- grafo: montar ----------
const vizinhos = (id) => { const s = new Set(); for (const l of G.lig.values()) { if (l.de === id) s.add(l.para); if (l.para === id) s.add(l.de); } return s; };
const grau = (id) => { let g = 0; for (const l of G.lig.values()) if (l.de === id || l.para === id) g++; return g; };
function novoNo(e, perto) {
  const ang = Math.random() * Math.PI * 2, dist = perto ? 90 + Math.random() * 60 : 0;
  const base = perto || centroVisivel();
  const n = { id: e.id, tipo: e.tipo, valor: e.valor, rotulo: e.rotulo || '', props: { ...(e.props || {}) }, notas: '', cor: '', fixo: false, alerta: !!e.alerta, feitas: [], criado: agora(), x: base.x + Math.cos(ang) * dist, y: base.y + Math.sin(ang) * dist, vx: 0, vy: 0 };
  G.nos.set(n.id, n);
  return n;
}
function ligar(de, para, rotulo, t) {
  if (de === para) return;
  const id = de + '>' + para;
  const l = G.lig.get(id);
  if (l) { if (rotulo && !l.rotulo.split(' · ').includes(rotulo)) l.rotulo = (l.rotulo ? l.rotulo + ' · ' : '') + rotulo; return; }
  G.lig.set(id, { id, de, para, rotulo: rotulo || '', t: t || '' });
}
// junta o resultado de uma transformação ao grafo; devolve os ids das entidades novas
function aplicar(origem, tId, r) {
  const novos = [];
  Object.assign(origem.props, r.props || {});
  if (!origem.feitas.includes(tId)) origem.feitas.push(tId);
  if (r.alerta) origem.alerta = true;
  for (const e of r.entidades || []) {
    let pai = origem;
    if (e.de) { pai = G.nos.get(e.de.id) || novoNo({ id: e.de.id, tipo: e.de.tipo, valor: e.de.valor }, origem); if (!novos.includes(pai.id) && pai !== origem) novos.push(pai.id); ligar(origem.id, pai.id, '', tId); }
    let n = G.nos.get(e.id);
    if (!n) { n = novoNo(e, pai); novos.push(n.id); } else {
      for (const [k, v] of Object.entries(e.props || {})) if (v !== '' && v != null) n.props[k] = v;
      if (!n.rotulo && e.rotulo) n.rotulo = e.rotulo;
    }
    if (e.alerta) n.alerta = true;
    ligar(pai.id, n.id, e.ligacao, tId);
  }
  return novos;
}
async function adicionarValor(valor, tipoEscolhido, perto) {
  const r = await chamar('entidade', { valor, tipo: tipoEscolhido || '' });
  const existe = G.nos.get(r.id);
  if (existe) { selecionar([existe.id]); centrar(existe); toast('Já estava no grafo'); return existe; }
  lembrar();
  const n = novoNo(r, perto);
  if (!perto) { const c = centroVisivel(); n.x = c.x + (Math.random() - 0.5) * 40; n.y = c.y + (Math.random() - 0.5) * 40; }
  historico(`Entidade adicionada: ${tipo(n.tipo).nome} ${n.valor}`);
  selecionar([n.id]);
  mudou();
  return n;
}
function adicionarVarias(lista, ligarA, rotulo) {
  if (!lista.length) return 0;
  lembrar();
  let novas = 0;
  const pai = ligarA ? G.nos.get(ligarA) : null;
  const c = pai || centroVisivel();
  lista.forEach((e, i) => {
    let n = G.nos.get(e.id);
    if (!n) {
      n = novoNo(e, pai);
      if (!pai) { const a = (i / lista.length) * Math.PI * 2, d = 60 + 12 * Math.sqrt(lista.length); n.x = c.x + Math.cos(a) * d; n.y = c.y + Math.sin(a) * d; }
      novas++;
    }
    if (pai) ligar(pai.id, n.id, rotulo || 'citado em', '');
  });
  mudou();
  return novas;
}
function remover(ids) {
  if (!ids.length) return;
  lembrar();
  for (const id of ids) { G.nos.delete(id); V.sel.delete(id); }
  for (const [k, l] of G.lig) if (!G.nos.has(l.de) || !G.nos.has(l.para)) G.lig.delete(k);
  V.caminho = null;
  historico(`${ids.length} ${ids.length === 1 ? 'entidade removida' : 'entidades removidas'}`);
  mudou();
}
// folhas: entidades que só se ligam a uma das escolhidas (para limpar o resultado de uma transformação grande)
function folhasDe(ids) {
  const alvo = new Set(ids), out = [];
  for (const n of G.nos.values()) {
    if (alvo.has(n.id)) continue;
    const v = vizinhos(n.id);
    if (v.size === 1 && alvo.has([...v][0])) out.push(n.id);
  }
  return out;
}

// ---------- transformações e máquinas ----------
function enfileirar(tId, nos, opt = {}) {
  const t = transf(tId);
  const alvos = nos.filter((n) => t.de.includes(n.tipo));
  if (!alvos.length) return Promise.resolve([]);
  if (!F.ativos && !F.fila.length) { F.total = 0; F.feitos = 0; F.erros = []; F.cancelar = false; lembrar(); }
  F.total += alvos.length;
  const promessas = alvos.map((n) => new Promise((ok) => F.fila.push({ t, n, ok, deNovo: !!opt.deNovo })));
  bombear();
  pintarFila();
  return Promise.all(promessas).then((l) => l.flat());
}
function bombear() {
  while (F.ativos < 4 && F.fila.length) {
    const job = F.fila.shift();
    if (F.cancelar) { job.ok([]); continue; }
    F.ativos++;
    rodarJob(job).finally(() => { F.ativos--; F.feitos++; pintarFila(); bombear(); if (!F.ativos && !F.fila.length) terminouFila(); });
  }
}
async function rodarJob({ t, n, ok, deNovo }) {
  try {
    const r = await chamar('transformar', { t: t.id, tipo: n.tipo, valor: n.valor, completo: n.tipo === 'texto' ? n.props.completo || n.valor : undefined, deNovo });
    if (!G.nos.has(n.id)) return ok([]);
    const novos = aplicar(n, t.id, r);
    historico(`${t.nome} em ${curto(rotuloDe(n), 40)}: ${r.entidades.length ? `${r.entidades.length} ${r.entidades.length === 1 ? 'resultado' : 'resultados'}${novos.length ? `, ${novos.length} ${novos.length === 1 ? 'novo' : 'novos'}` : ''}` : 'nada'}${r.aviso ? ` (${r.aviso})` : ''}`);
    if (r.aviso && F.total === 1) toast(r.aviso);
    mudou();
    ok(novos.concat((r.entidades || []).map((e) => e.id)));
  } catch (e) {
    const cod = e.data && e.data.codigo;
    if (cod === 'cofre') { if (!F.pediuCofre) { F.pediuCofre = true; plugin.vault.request(t.cofre || 'bluetego.virustotal'); } }
    F.erros.push(`${t.nome} em ${curto(rotuloDe(n), 30)}: ${e.message}`);
    historico(`Falhou: ${t.nome} em ${curto(rotuloDe(n), 40)} (${e.message})`);
    ok([]);
  }
}
function terminouFila() {
  F.pediuCofre = false;
  if (F.erros.length) toast(F.erros.length === 1 ? F.erros[0] : `${F.erros.length} transformações falharam. Veja no histórico.`, 'err');
  pintarFila(); mudou();
}
function rapidas(nos) {
  const ts = new Set();
  for (const n of nos) for (const t of paraTipo(n.tipo)) if (t.rapida) ts.add(t.id);
  if (!ts.size) return toast('Nenhuma transformação rápida para este tipo');
  for (const t of ts) enfileirar(t, nos);
}
async function rodarMaquina(m, semente) {
  if (F.maquina) return toast('Já tem uma máquina rodando');
  F.maquina = { nome: m.nome, passo: 0, total: m.passos.length };
  historico(`Máquina "${m.nome}" começou em ${rotuloDe(semente)}`);
  const daMaquina = new Set([semente.id]), feitas = new Set();
  let novas = 0;
  try {
    for (const [i, p] of m.passos.entries()) {
      if (F.cancelar) break;
      F.maquina.passo = i + 1; F.maquina.atual = transf(p.t).nome; pintarFila();
      const t = transf(p.t);
      let alvos = [...daMaquina].map((id) => G.nos.get(id)).filter((n) => n && t.de.includes(n.tipo) && !feitas.has(p.t + '|' + n.id));
      if (p.max) alvos = alvos.slice(0, p.max);
      alvos.forEach((n) => feitas.add(p.t + '|' + n.id));
      const ids = await enfileirar(p.t, alvos);
      for (const id of ids) if (!daMaquina.has(id)) { daMaquina.add(id); novas++; }
      if (novas > 600) { toast('A máquina parou: mais de 600 entidades novas'); break; }
    }
  } finally {
    historico(`Máquina "${m.nome}" terminou: ${novas} entidades`);
    F.maquina = null; pintarFila(); mudou();
    setTimeout(ajustar, 1500);
  }
}
function cancelarFila() {
  F.cancelar = true;
  for (const j of F.fila.splice(0)) j.ok([]);
  pintarFila();
}

// ---------- caminho entre duas entidades (busca em largura, sem direção) ----------
function caminho(a, b) {
  const viz = new Map();
  for (const l of G.lig.values()) { (viz.get(l.de) || viz.set(l.de, []).get(l.de)).push([l.para, l.id]); (viz.get(l.para) || viz.set(l.para, []).get(l.para)).push([l.de, l.id]); }
  const ant = new Map([[a, null]]), fila = [a];
  while (fila.length) {
    const x = fila.shift();
    if (x === b) break;
    for (const [y, lid] of viz.get(x) || []) if (!ant.has(y)) { ant.set(y, [x, lid]); fila.push(y); }
  }
  if (!ant.has(b)) return null;
  const nos = new Set([b]), lig = new Set();
  for (let x = b; ant.get(x); x = ant.get(x)[0]) { lig.add(ant.get(x)[1]); nos.add(ant.get(x)[0]); }
  return { nos, lig };
}

// ---------- física (forças simples com grade: até alguns milhares de entidades) ----------
function aquecer(a) { V.alpha = Math.max(V.alpha, a); animar(); }
function passo() {
  const nos = [...G.nos.values()].filter((n) => !V.ocultos.has(n.tipo));
  const CEL = 320, grade = new Map();
  for (const n of nos) { const k = Math.floor(n.x / CEL) + ',' + Math.floor(n.y / CEL); (grade.get(k) || grade.set(k, []).get(k)).push(n); n.fx = 0; n.fy = 0; }
  for (const n of nos) {
    const cx = Math.floor(n.x / CEL), cy = Math.floor(n.y / CEL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of grade.get((cx + i) + ',' + (cy + j)) || []) {
      if (o === n) continue;
      let dx = n.x - o.x, dy = n.y - o.y, d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
      if (d2 > CEL * CEL) continue;
      const f = Math.min(40, 26000 / d2), d = Math.sqrt(d2);
      n.fx += (dx / d) * f; n.fy += (dy / d) * f;
    }
  }
  for (const l of G.lig.values()) {
    const a = G.nos.get(l.de), b = G.nos.get(l.para);
    if (!a || !b || V.ocultos.has(a.tipo) || V.ocultos.has(b.tipo)) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d - 130) * 0.05;
    a.fx += (dx / d) * f; a.fy += (dy / d) * f; b.fx -= (dx / d) * f; b.fy -= (dy / d) * f;
  }
  for (const n of nos) {
    n.fx -= n.x * 0.002; n.fy -= n.y * 0.002;
    if (n.fixo || n === V.arrastando) { n.vx = n.vy = 0; continue; }
    n.vx = ((n.vx || 0) + n.fx) * 0.55; n.vy = ((n.vy || 0) + n.fy) * 0.55;
    n.x += n.vx * V.alpha; n.y += n.vy * V.alpha;
  }
  V.alpha *= 0.985;
  if (V.alpha < 0.01) V.alpha = 0;
}
function animar() {
  if (V.rodando || !V.mostrado) return;
  V.rodando = true;
  const quadro = () => {
    if (!V.mostrado) { V.rodando = false; return; }
    if (V.alpha > 0) passo();
    desenhar();
    if (V.alpha > 0 || V.arrastando) requestAnimationFrame(quadro); else { V.rodando = false; agendarSalvar(); }
  };
  requestAnimationFrame(quadro);
}
function organizar() {
  for (const n of G.nos.values()) n.fixo = false;
  // espalha de novo a partir de um círculo: tira o grafo de um mínimo ruim
  const nos = [...G.nos.values()];
  nos.forEach((n, i) => { const a = (i / nos.length) * Math.PI * 2, r = 40 * Math.sqrt(nos.length); n.x = Math.cos(a) * r; n.y = Math.sin(a) * r; n.vx = n.vy = 0; });
  V.alpha = 1; animar();
  setTimeout(ajustar, 1600);
}

// ---------- desenho ----------
function lerCores() {
  const cs = getComputedStyle(R.palco || document.documentElement);
  const v = (k, p) => (cs.getPropertyValue(k) || '').trim() || p;
  V.cores = { bg: v('--bg', '#1e1f22'), panel: v('--panel', '#2b2d30'), fg: v('--fg', '#dfe1e5'), muted: v('--muted', '#868a91'), line: v('--line-2', '#43454a'), accent: v('--accent', '#4f8cff'), fonte: v('--ui', 'system-ui, sans-serif') };
}
function icone(t) {
  if (!icones.has(t)) { try { icones.set(t, new Path2D(tipo(t).icone || 'M6 12h12')); } catch { icones.set(t, null); } }
  return icones.get(t);
}
const raio = (n) => 16 + Math.min(10, Math.sqrt(n._g || 0) * 2);
const visivel = (n) => n && !V.ocultos.has(n.tipo);
function casa(n) {
  if (!V.busca) return true;
  const q = V.busca.toLowerCase();
  return n.valor.toLowerCase().includes(q) || (n.rotulo || '').toLowerCase().includes(q) || (n.notas || '').toLowerCase().includes(q) || tipo(n.tipo).nome.toLowerCase().includes(q) || Object.values(n.props || {}).some((v) => String(v).toLowerCase().includes(q));
}
function desenhar() {
  const cv = R.canvas;
  if (!cv || !V.mostrado) return;
  if (!V.cores) lerCores();
  const C = V.cores, dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const { x: cx, y: cy, z } = V.cam;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 - cx * z), dpr * (h / 2 - cy * z));
  for (const n of G.nos.values()) n._g = 0;
  for (const l of G.lig.values()) { const a = G.nos.get(l.de), b = G.nos.get(l.para); if (a) a._g++; if (b) b._g++; }
  const focoSel = V.sel.size ? new Set([...V.sel].flatMap((id) => [id, ...vizinhos(id)])) : null;
  const apagado = (n) => (V.busca && !casa(n)) || (V.caminho && !V.caminho.nos.has(n.id));
  // ligações
  ctx.lineWidth = 1.2 / Math.max(z, 0.5);
  ctx.font = `${10.5 / Math.max(z, 0.7)}px ${C.fonte}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const l of G.lig.values()) {
    const a = G.nos.get(l.de), b = G.nos.get(l.para);
    if (!visivel(a) || !visivel(b)) continue;
    const forte = (V.sel.has(a.id) || V.sel.has(b.id)) || (V.caminho && V.caminho.lig.has(l.id));
    const fraco = apagado(a) || apagado(b) || (focoSel && !forte);
    ctx.globalAlpha = fraco ? 0.15 : forte ? 1 : 0.55;
    ctx.strokeStyle = forte ? C.accent : C.line;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, rb = raio(b) + 3;
    const ex = b.x - ux * rb, ey = b.y - uy * rb;
    ctx.beginPath(); ctx.moveTo(a.x + ux * raio(a), a.y + uy * raio(a)); ctx.lineTo(ex, ey); ctx.stroke();
    const s = 6 / Math.max(z, 0.6);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - ux * s - uy * s * 0.5, ey - uy * s + ux * s * 0.5); ctx.lineTo(ex - ux * s + uy * s * 0.5, ey - uy * s - ux * s * 0.5); ctx.fill();
    if (l.rotulo && ((z > 0.95 && G.nos.size < 60) || z > 1.3 || forte) && !fraco) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, t = curto(l.rotulo, 30), tw = ctx.measureText(t).width + 6;
      ctx.globalAlpha = 0.92; ctx.fillStyle = C.bg; ctx.fillRect(mx - tw / 2, my - 7 / Math.max(z, 0.7), tw, 14 / Math.max(z, 0.7));
      ctx.fillStyle = forte ? C.fg : C.muted; ctx.fillText(t, mx, my);
    }
  }
  // entidades
  ctx.globalAlpha = 1;
  const fonte = 11.5 / Math.max(z, 0.75);
  for (const n of G.nos.values()) {
    if (!visivel(n)) continue;
    const r = raio(n), cor = tipo(n.tipo).cor, sel = V.sel.has(n.id);
    ctx.globalAlpha = apagado(n) || (focoSel && !focoSel.has(n.id)) ? 0.22 : 1;
    if (sel || n.id === V.hover) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2); ctx.fillStyle = sel ? C.accent : C.line; ctx.globalAlpha *= sel ? 0.35 : 0.5; ctx.fill(); ctx.globalAlpha = apagado(n) ? 0.22 : 1; }
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = C.panel; ctx.fill();
    if (n.cor) { ctx.fillStyle = n.cor + '55'; ctx.fill(); }
    ctx.lineWidth = n.cor ? 3 : 2; ctx.strokeStyle = n.cor || cor; ctx.stroke();
    const p = icone(n.tipo);
    if (p) {
      const s = (r * 1.05) / 12;
      ctx.save(); ctx.translate(n.x - 12 * s, n.y - 12 * s); ctx.scale(s, s);
      ctx.strokeStyle = cor; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(p); ctx.restore();
    }
    if (n.alerta) { ctx.beginPath(); ctx.arc(n.x + r * 0.72, n.y - r * 0.72, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#e5534b'; ctx.fill(); }
    if (n.fixo) { ctx.beginPath(); ctx.arc(n.x - r * 0.72, n.y - r * 0.72, 3, 0, Math.PI * 2); ctx.fillStyle = C.muted; ctx.fill(); }
    if (n.notas) { ctx.fillStyle = '#d4b72c'; ctx.fillRect(n.x + r * 0.5, n.y + r * 0.5, 6, 6); }
    if (sel || n.id === V.hover || (z > 0.42 && (G.nos.size < 60 || z > 0.85 || n._g >= 4))) {
      ctx.font = `${sel ? '600 ' : ''}${fonte}px ${C.fonte}`; ctx.fillStyle = C.fg; ctx.textBaseline = 'top';
      ctx.fillText(curto(rotuloDe(n), sel || n.id === V.hover ? 60 : 30), n.x, n.y + r + 4);
    }
  }
  ctx.globalAlpha = 1;
  if (V.caixa) {
    const { x0, y0, x1, y1 } = V.caixa;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.accent; ctx.globalAlpha = 0.12; ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.globalAlpha = 0.8; ctx.strokeStyle = C.accent; ctx.lineWidth = 1; ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.globalAlpha = 1;
  }
}

// ---------- câmera ----------
const paraMundo = (sx, sy) => { const w = R.canvas.clientWidth, h = R.canvas.clientHeight; return { x: (sx - w / 2) / V.cam.z + V.cam.x, y: (sy - h / 2) / V.cam.z + V.cam.y }; };
const centroVisivel = () => ({ x: V.cam.x, y: V.cam.y });
function ajustar() {
  const nos = [...G.nos.values()].filter(visivel);
  if (!nos.length || !R.canvas) { V.cam = { x: 0, y: 0, z: 1 }; desenhar(); return; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nos) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
  const w = R.canvas.clientWidth || 800, h = R.canvas.clientHeight || 600;
  V.cam = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: Math.max(0.15, Math.min(1.6, Math.min((w - 120) / (x1 - x0 + 1), (h - 120) / (y1 - y0 + 1)))) };
  desenhar();
}
function centrar(n) { V.cam.x = n.x; V.cam.y = n.y; if (V.cam.z < 0.8) V.cam.z = 1; desenhar(); }
function zoom(f, sx, sy) {
  const w = R.canvas.clientWidth, h = R.canvas.clientHeight;
  if (sx == null) { sx = w / 2; sy = h / 2; }
  const antes = paraMundo(sx, sy);
  V.cam.z = Math.max(0.08, Math.min(4, V.cam.z * f));
  const depois = paraMundo(sx, sy);
  V.cam.x += antes.x - depois.x; V.cam.y += antes.y - depois.y;
  desenhar();
}
function noEm(sx, sy) {
  const p = paraMundo(sx, sy);
  const nos = [...G.nos.values()].filter(visivel).reverse();
  return nos.find((n) => Math.hypot(n.x - p.x, n.y - p.y) <= raio(n) + 4 / V.cam.z) || null;
}
function selecionar(ids, somar) {
  if (!somar) V.sel.clear();
  for (const id of ids) V.sel.add(id);
  V.caminho = null;
  pintarDetalhes(); desenhar();
}

// ---------- mouse e teclado no canvas ----------
function ligarCanvas(cv) {
  let ini = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    cv.focus(); cv.setPointerCapture(e.pointerId);
    const p = pos(e), n = noEm(p.x, p.y);
    ini = { ...p, n, moveu: false, cam: { ...V.cam }, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
    if (n) {
      if (ini.ctrl || ini.shift) { if (V.sel.has(n.id)) V.sel.delete(n.id); else V.sel.add(n.id); pintarDetalhes(); }
      else if (!V.sel.has(n.id)) selecionar([n.id]);
      ini.grupo = [...V.sel].map((id) => G.nos.get(id)).filter(Boolean).map((x) => ({ x, ox: x.x, oy: x.y }));
      ini.lembrou = false;
    } else if (ini.shift) V.caixa = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  });
  cv.addEventListener('pointermove', (e) => {
    const p = pos(e);
    if (!ini) { const n = noEm(p.x, p.y); const id = n ? n.id : null; if (id !== V.hover) { V.hover = id; cv.style.cursor = n ? 'pointer' : 'grab'; desenhar(); dica(n, e); } else if (n) dica(n, e); return; }
    if (!ini.moveu && Math.hypot(p.x - ini.x, p.y - ini.y) < 3) return;
    ini.moveu = true; dica(null);
    if (ini.n) {
      if (!ini.lembrou) { lembrar(); ini.lembrou = true; }
      const dx = (p.x - ini.x) / V.cam.z, dy = (p.y - ini.y) / V.cam.z;
      for (const g of ini.grupo) { g.x.x = g.ox + dx; g.x.y = g.oy + dy; g.x.fixo = true; }
      V.arrastando = ini.n; aquecer(0.15);
    } else if (V.caixa) { V.caixa.x1 = p.x; V.caixa.y1 = p.y; desenhar(); }
    else { cv.style.cursor = 'grabbing'; V.cam.x = ini.cam.x - (p.x - ini.x) / V.cam.z; V.cam.y = ini.cam.y - (p.y - ini.y) / V.cam.z; desenhar(); }
  });
  const soltar = () => {
    if (!ini) return;
    if (V.caixa) {
      const a = paraMundo(Math.min(V.caixa.x0, V.caixa.x1), Math.min(V.caixa.y0, V.caixa.y1)), b = paraMundo(Math.max(V.caixa.x0, V.caixa.x1), Math.max(V.caixa.y0, V.caixa.y1));
      const ids = [...G.nos.values()].filter((n) => visivel(n) && n.x >= a.x && n.x <= b.x && n.y >= a.y && n.y <= b.y).map((n) => n.id);
      V.caixa = null; selecionar(ids, true);
    } else if (!ini.moveu && !ini.n && !ini.shift) selecionar([]);
    if (ini.n && ini.moveu) agendarSalvar();
    V.arrastando = null; ini = null; cv.style.cursor = 'grab';
  };
  cv.addEventListener('pointerup', soltar);
  cv.addEventListener('pointercancel', soltar);
  cv.addEventListener('pointerleave', () => { if (!ini && V.hover) { V.hover = null; desenhar(); } dica(null); });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const p = pos(e); zoom(Math.exp(-e.deltaY * 0.0015), p.x, p.y); }, { passive: false });
  cv.addEventListener('dblclick', (e) => {
    const p = pos(e), n = noEm(p.x, p.y);
    if (n) rapidas([...V.sel].map((id) => G.nos.get(id)).filter(Boolean).length > 1 ? [...V.sel].map((id) => G.nos.get(id)) : [n]);
    else dlgAdicionar(paraMundo(p.x, p.y));
  });
  cv.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const p = pos(e), n = noEm(p.x, p.y);
    if (n) { if (!V.sel.has(n.id)) selecionar([n.id]); menuEntidades(e); } else menuFundo(e, paraMundo(p.x, p.y));
  });
  cv.addEventListener('keydown', (e) => {
    const k = (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + e.key;
    const sel = [...V.sel].map((id) => G.nos.get(id)).filter(Boolean);
    const acoes = {
      Delete: () => remover([...V.sel]), Backspace: () => remover([...V.sel]),
      'Ctrl+a': () => selecionar([...G.nos.values()].filter(visivel).map((n) => n.id)),
      'Ctrl+z': desfazer, 'Ctrl+y': refazer, 'Ctrl+Shift+Z': refazer,
      'Ctrl+c': () => sel.length && bs.copyText(sel.map((n) => n.valor).join('\n')),
      f: ajustar, F: ajustar, Escape: () => { V.busca = ''; if (R.busca) R.busca.value = ''; selecionar([]); },
      Enter: () => sel.length && rapidas(sel), '+': () => zoom(1.25), '=': () => zoom(1.25), '-': () => zoom(0.8),
    };
    const fn = acoes[k];
    if (fn) { e.preventDefault(); e.stopPropagation(); fn(); }
  });
}
function dica(n, e) {
  if (!R.dica) return;
  if (!n) { R.dica.hidden = true; return; }
  const props = Object.entries(n.props || {}).filter(([, v]) => v !== '' && String(v).length < 90).slice(0, 5);
  R.dica.innerHTML = `<b>${esc(tipo(n.tipo).nome)}</b><div class="btg-dica-v">${esc(n.valor)}</div>${props.map(([k, v]) => `<div><span>${esc(k)}</span> ${esc(String(v))}</div>`).join('')}`;
  const r = R.palco.getBoundingClientRect();
  R.dica.style.left = Math.min(e.clientX - r.left + 14, r.width - 270) + 'px';
  R.dica.style.top = Math.min(e.clientY - r.top + 14, r.height - 120) + 'px';
  R.dica.hidden = false;
}

// ---------- menus ----------
const selecionadas = () => [...V.sel].map((id) => G.nos.get(id)).filter(Boolean);
function itensTransformacoes(sel) {
  const tipos = [...new Set(sel.map((n) => n.tipo))];
  const ts = CAT.transformacoes.filter((t) => t.de.some((d) => tipos.includes(d)));
  return ts.map((t) => ({ label: `${sel.length === 1 && sel[0].feitas.includes(t.id) ? '✓ ' : ''}${t.nome} · ${t.fonte}`, icon: t.rapida ? IC.raio : IC.maquina, action: () => enfileirar(t.id, sel, { deNovo: sel.length === 1 && sel[0].feitas.includes(t.id) }) }));
}
function menuEntidades(e) {
  const sel = selecionadas();
  if (!sel.length) return;
  const um = sel.length === 1 ? sel[0] : null;
  const maqs = um ? CAT.maquinas.filter((m) => m.de === um.tipo) : [];
  const itens = [
    { label: 'Rodar as rápidas', icon: IC.raio, k: 'Enter', action: () => rapidas(sel) },
    { label: 'Transformações', icon: IC.maquina, sub: itensTransformacoes(sel) },
  ];
  if (maqs.length) itens.push({ label: 'Máquinas', icon: IC.maquina, sub: maqs.map((m) => ({ label: m.nome, action: () => rodarMaquina(m, um) })) });
  itens.push('-');
  if (um && linkDe(um)) itens.push({ label: 'Abrir no navegador', icon: IC.fora, action: () => abrirLink(linkDe(um)) });
  itens.push({ label: sel.length > 1 ? 'Copiar os valores' : 'Copiar o valor', icon: IC.copiar, k: 'Ctrl+C', action: () => bs.copyText(sel.map((n) => n.valor).join('\n')) });
  itens.push({ label: 'Marcar com cor', icon: IC.editar, sub: CORES.map(([c, nome]) => ({ label: nome, icon: `<span class="btg-bolinha" style="background:${c || 'transparent'}"></span>`, action: () => { lembrar(); sel.forEach((n) => (n.cor = c)); mudou(true); } })) });
  itens.push({ label: sel.every((n) => n.fixo) ? 'Soltar a posição' : 'Fixar a posição', icon: IC.pino, action: () => { const f = !sel.every((n) => n.fixo); sel.forEach((n) => (n.fixo = f)); mudou(!f ? false : true); } });
  itens.push({ label: 'Selecionar os vizinhos', icon: IC.vizinhos, action: () => selecionar([...new Set(sel.flatMap((n) => [n.id, ...vizinhos(n.id)]))]) });
  if (um) itens.push({ label: `Selecionar todos do tipo ${tipo(um.tipo).nome}`, icon: IC.vizinhos, action: () => selecionar([...G.nos.values()].filter((n) => n.tipo === um.tipo).map((n) => n.id)) });
  if (sel.length === 2) itens.push({ label: 'Mostrar o caminho entre as duas', icon: IC.caminho, action: mostrarCaminho });
  itens.push('-');
  const folhas = folhasDe(sel.map((n) => n.id));
  if (folhas.length) itens.push({ label: `Remover os resultados soltos (${folhas.length})`, icon: IC.lixo, action: () => remover(folhas) });
  itens.push({ label: sel.length > 1 ? `Remover ${sel.length} entidades` : 'Remover', icon: IC.lixo, k: 'Del', action: () => remover(sel.map((n) => n.id)) });
  bs.showMenu(e, itens, um ? `${tipo(um.tipo).nome} · ${curto(um.valor, 40)}` : `${sel.length} entidades`);
}
function menuFundo(e, onde) {
  bs.showMenu(e, [
    { label: 'Adicionar entidade…', icon: IC.mais, action: () => dlgAdicionar(onde) },
    { label: 'Colar texto e extrair…', icon: IC.colar, action: () => dlgColar() },
    '-',
    { label: 'Organizar', icon: IC.organizar, action: organizar },
    { label: 'Ajustar à tela', icon: IC.ajustar, k: 'F', action: ajustar },
    { label: 'Selecionar tudo', icon: IC.vizinhos, k: 'Ctrl+A', action: () => selecionar([...G.nos.values()].filter(visivel).map((n) => n.id)) },
  ]);
}
function mostrarCaminho() {
  const [a, b] = [...V.sel];
  const c = caminho(a, b);
  if (!c) return toast('Não há caminho entre as duas entidades');
  V.caminho = c;
  toast(`Caminho com ${c.lig.size} ${c.lig.size === 1 ? 'ligação' : 'ligações'}`, 'ok');
  pintarDetalhes(); desenhar();
}
function linkDe(n) {
  if (n.tipo === 'url' || n.tipo === 'conta') return /^https?:/.test(n.valor) ? n.valor : '';
  if (n.tipo === 'dominio') return 'https://' + n.valor;
  if (n.tipo === 'cve') return 'https://nvd.nist.gov/vuln/detail/' + n.valor;
  if (n.tipo === 'ip') return 'https://www.shodan.io/host/' + n.valor;
  if (n.tipo === 'asn') return 'https://bgp.he.net/' + n.valor;
  if (n.tipo === 'hash') return 'https://www.virustotal.com/gui/file/' + n.valor;
  if (n.tipo === 'local' && n.props.mapa) return n.props.mapa;
  return '';
}
const abrirLink = (url) => chamar('abrir', { url }).catch((e) => toast(e.message, 'err'));

// ---------- diálogos ----------
function dialogo(html, montar) {
  return new Promise((fim) => {
    const d = R.dlg;
    d.innerHTML = `<div class="btg-dlg-caixa" role="dialog" aria-modal="true">${html}</div>`;
    d.hidden = false;
    const fechar = (v) => { d.hidden = true; d.innerHTML = ''; document.removeEventListener('keydown', esc_, true); fim(v); R.canvas && R.canvas.focus(); };
    const esc_ = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(null); } };
    document.addEventListener('keydown', esc_, true);
    d.onpointerdown = (e) => { if (e.target === d) fechar(null); };
    d.querySelectorAll('[data-cancelar]').forEach((b) => (b.onclick = () => fechar(null)));
    montar(d.firstElementChild, fechar);
  });
}
function confirmar(texto, botao) {
  return dialogo(`<p class="btg-dlg-t">${esc(texto)}</p><div class="btg-dlg-b"><button class="chip" data-cancelar>Cancelar</button><button class="chip primary danger" data-sim>${esc(botao)}</button></div>`, (el, fechar) => {
    el.querySelector('[data-sim]').onclick = () => fechar(true);
    el.querySelector('[data-sim]').focus();
  });
}
function opcoesTipo(sel) {
  return `<option value="">Adivinhar pelo valor</option>${Object.entries(CAT.tipos).map(([k, t]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}`;
}
function dlgAdicionar(onde) {
  return dialogo(`<h3>Adicionar entidade</h3>
    <label class="btg-campo"><span>Valor</span><input data-v placeholder="exemplo.com.br, 8.8.8.8, ana@empresa.com, @usuario…" spellcheck="false"></label>
    <label class="btg-campo"><span>Tipo</span><select data-t>${opcoesTipo('')}</select></label>
    <div class="btg-dlg-dica" data-dica></div>
    <div class="btg-dlg-b"><button class="chip" data-cancelar>Cancelar</button><button class="chip primary" data-ok>Adicionar</button></div>`, (el, fechar) => {
    const v = el.querySelector('[data-v]'), t = el.querySelector('[data-t]'), d = el.querySelector('[data-dica]');
    let tm;
    v.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => { if (!v.value.trim() || t.value) { d.textContent = ''; return; } try { const r = await chamar('entidade', { valor: v.value }); d.textContent = `Vai entrar como ${tipo(r.tipo).nome}: ${r.valor}`; } catch { d.textContent = ''; } }, 200); };
    const ok = async () => { if (!v.value.trim()) return v.focus(); try { const n = await adicionarValor(v.value, t.value, null); if (onde && n) { n.x = onde.x; n.y = onde.y; desenhar(); } fechar(true); } catch (e) { d.textContent = e.message; } };
    el.querySelector('[data-ok]').onclick = ok;
    v.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
    v.focus();
  });
}
function dlgColar(textoInicial, origem) {
  const sel = selecionadas();
  return dialogo(`<h3>Extrair entidades de um texto</h3>
    <p class="btg-dlg-dica">Cole um log, um e-mail, um relatório: o Bluetego acha domínios, IPs, e-mails, URLs, hashes, CVEs, redes, ASNs e telefones.</p>
    <textarea data-tx class="btg-tx" spellcheck="false" placeholder="Cole aqui…"></textarea>
    <div class="btg-achados" data-ach></div>
    ${sel.length === 1 ? `<label class="btg-check"><input type="checkbox" data-ligar> Ligar ao selecionado (${esc(curto(rotuloDe(sel[0]), 40))})</label>` : ''}
    <div class="btg-dlg-b"><button class="chip" data-cancelar>Cancelar</button><button class="chip primary" data-ok disabled>Adicionar</button></div>`, (el, fechar) => {
    const tx = el.querySelector('[data-tx]'), ach = el.querySelector('[data-ach]'), ok = el.querySelector('[data-ok]');
    let lista = [], tm;
    const ler = async () => {
      if (!tx.value.trim()) { lista = []; ach.innerHTML = ''; ok.disabled = true; return; }
      try { lista = (await chamar('extrair', { texto: tx.value })).entidades; } catch (e) { ach.textContent = e.message; return; }
      const por = {};
      for (const e of lista) (por[e.tipo] = por[e.tipo] || []).push(e);
      ach.innerHTML = lista.length ? Object.entries(por).map(([k, l]) => `<span class="btg-tag" style="--c:${tipo(k).cor}">${esc(tipo(k).nome)} · ${l.length}</span>`).join('') : '<span class="btg-mudo">Nada reconhecido ainda.</span>';
      ok.disabled = !lista.length; ok.textContent = lista.length ? `Adicionar ${lista.length}` : 'Adicionar';
    };
    tx.oninput = () => { clearTimeout(tm); tm = setTimeout(ler, 250); };
    ok.onclick = () => {
      const ligarA = el.querySelector('[data-ligar]')?.checked ? sel[0].id : null;
      const n = adicionarVarias(lista, ligarA, origem ? 'citado em ' + origem : 'citado no texto');
      historico(`Texto colado: ${lista.length} entidades reconhecidas, ${n} novas`);
      toast(`${n} ${n === 1 ? 'entidade nova' : 'entidades novas'}`, 'ok');
      fechar(true); setTimeout(ajustar, 900);
    };
    if (textoInicial) { tx.value = textoInicial; ler(); }
    tx.focus();
  });
}

// ---------- exportar e importar ----------
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'investigacao';
const csv = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const xml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
function relatorio() {
  const nos = [...G.nos.values()], inv = G.inv;
  const por = {};
  for (const n of nos) (por[n.tipo] = por[n.tipo] || []).push(n);
  const alertas = nos.filter((n) => n.alerta);
  const pontos = nos.map((n) => [n, grau(n.id)]).filter(([, g]) => g >= 3).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const l = [`# ${inv.nome}`, '', `Relatório do Bluetego · ${new Date().toLocaleString('pt-BR')} · ${nos.length} entidades, ${G.lig.size} ligações`, ''];
  l.push('## Resumo', '', '| Tipo | Quantas |', '|---|---|', ...Object.entries(por).map(([k, x]) => `| ${tipo(k).nome} | ${x.length} |`), '');
  if (alertas.length) l.push('## Pontos de atenção', '', ...alertas.map((n) => `- **${tipo(n.tipo).nome}** \`${n.valor}\`${n.props.risco ? `: ${n.props.risco}` : n.props.VirusTotal ? `: ${n.props.VirusTotal}` : n.props.CVSS ? `: CVSS ${n.props.CVSS}` : ''}`), '');
  if (pontos.length) l.push('## Pontos de encontro', '', 'As entidades com mais ligações: costumam ser a infraestrutura ou as pessoas que unem a investigação.', '', ...pontos.map(([n, g]) => `- \`${rotuloDe(n)}\` (${tipo(n.tipo).nome}): ${g} ligações`), '');
  const anotadas = nos.filter((n) => n.notas);
  if (anotadas.length) l.push('## Anotações', '', ...anotadas.map((n) => `- **${rotuloDe(n)}**: ${n.notas.replace(/\n+/g, ' ')}`), '');
  l.push('## Entidades', '');
  for (const [k, x] of Object.entries(por)) {
    l.push(`### ${tipo(k).nome}`, '');
    for (const n of x) {
      const props = Object.entries(n.props).filter(([p, v]) => v !== '' && p !== 'completo' && String(v).length < 200);
      l.push(`- \`${n.valor}\`${n.rotulo ? ` (${n.rotulo})` : ''}${props.length ? '  \n  ' + props.map(([p, v]) => `${p}: ${v}`).join(' · ') : ''}`);
    }
    l.push('');
  }
  l.push('## Ligações', '', '| De | Ligação | Para |', '|---|---|---|');
  for (const lg of G.lig.values()) { const a = G.nos.get(lg.de), b = G.nos.get(lg.para); if (a && b) l.push(`| ${rotuloDe(a).replace(/\|/g, '\\|')} | ${lg.rotulo || ''} | ${rotuloDe(b).replace(/\|/g, '\\|')} |`); }
  l.push('', '## Histórico', '', ...inv.historico.slice(0, 80).reverse().map((h) => `- ${quando(h.quando)}: ${h.texto}`));
  return l.join('\n');
}
function graphml() {
  const nos = [...G.nos.values()];
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
    '<key id="tipo" for="node" attr.name="tipo" attr.type="string"/>', '<key id="valor" for="node" attr.name="valor" attr.type="string"/>', '<key id="rotulo" for="node" attr.name="label" attr.type="string"/>', '<key id="notas" for="node" attr.name="notas" attr.type="string"/>', '<key id="props" for="node" attr.name="propriedades" attr.type="string"/>', '<key id="lig" for="edge" attr.name="label" attr.type="string"/>',
    `<graph id="${xml(G.inv.id)}" edgedefault="directed">`,
    ...nos.map((n) => `<node id="${xml(n.id)}"><data key="tipo">${xml(n.tipo)}</data><data key="valor">${xml(n.valor)}</data><data key="rotulo">${xml(rotuloDe(n))}</data><data key="notas">${xml(n.notas)}</data><data key="props">${xml(JSON.stringify(n.props))}</data></node>`),
    ...[...G.lig.values()].map((l) => `<edge source="${xml(l.de)}" target="${xml(l.para)}"><data key="lig">${xml(l.rotulo)}</data></edge>`),
    '</graph>', '</graphml>'].join('\n');
}
async function exportar(fmt) {
  await salvar();
  const base = `exportacoes/${slug(G.inv.nome)}-${new Date().toISOString().slice(0, 10)}`;
  let arq, conteudo;
  if (fmt === 'json') { arq = base + '.bluetego.json'; conteudo = JSON.stringify({ ...G.inv, nos: [...G.nos.values()].map(({ vx, vy, fx, fy, _g, ...n }) => n) }, null, 2); }
  if (fmt === 'md') { arq = base + '.md'; conteudo = relatorio(); }
  if (fmt === 'graphml') { arq = base + '.graphml'; conteudo = graphml(); }
  if (fmt === 'csv') {
    arq = base + '-entidades.csv';
    const chaves = [...new Set([...G.nos.values()].flatMap((n) => Object.keys(n.props)))].filter((k) => k !== 'completo');
    conteudo = '﻿' + [['tipo', 'valor', 'rótulo', 'notas', 'marca', ...chaves].map(csv).join(';'), ...[...G.nos.values()].map((n) => [tipo(n.tipo).nome, n.valor, n.rotulo, n.notas, n.cor, ...chaves.map((k) => n.props[k])].map(csv).join(';'))].join('\r\n');
    const lig = '﻿' + [['de', 'ligação', 'para'].map(csv).join(';'), ...[...G.lig.values()].map((l) => [G.nos.get(l.de)?.valor, l.rotulo, G.nos.get(l.para)?.valor].map(csv).join(';'))].join('\r\n');
    await plugin.files.write(base + '-ligacoes.csv', lig);
  }
  if (fmt === 'png') {
    arq = base + '.png';
    const blob = await new Promise((ok) => R.canvas.toBlob(ok, 'image/png'));
    conteudo = await blob.arrayBuffer();
  }
  try {
    await plugin.files.write(arq, conteudo);
    const info = await plugin.info();
    toast(`Exportado: ${arq.split('/').pop()}`, 'ok');
    bs.reveal((info.filesDir + '/' + arq).replace(/\//g, '\\'));
  } catch (e) { toast('Não deu para exportar: ' + e.message, 'err'); }
}
function menuExportar(e) {
  bs.showMenu(e, [
    { label: 'Relatório em Markdown', icon: IC.exportar, action: () => exportar('md') },
    { label: 'Copiar o relatório', icon: IC.copiar, action: () => bs.copyText(relatorio()) },
    { label: 'Planilha (CSV)', icon: IC.exportar, action: () => exportar('csv') },
    { label: 'GraphML (Gephi, yEd, Maltego)', icon: IC.exportar, action: () => exportar('graphml') },
    { label: 'Imagem do grafo (PNG)', icon: IC.exportar, action: () => exportar('png') },
    { label: 'Investigação inteira (JSON)', icon: IC.exportar, action: () => exportar('json') },
    '-',
    { label: 'Importar arquivo…', icon: IC.importar, action: importar },
  ]);
}
// importa uma investigação do Bluetego (junta ao grafo atual) ou extrai as entidades de qualquer outro arquivo de texto
function importar() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,.txt,.log,.csv,.md,.html,.xml,.eml';
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    const texto = await f.text();
    let j = null;
    try { j = JSON.parse(texto); } catch {}
    if (j && Array.isArray(j.nos) && Array.isArray(j.ligacoes)) {
      lembrar();
      let n = 0;
      for (const x of j.nos) if (!G.nos.has(x.id)) { G.nos.set(x.id, { props: {}, feitas: [], ...x }); n++; }
      for (const l of j.ligacoes) if (G.nos.has(l.de) && G.nos.has(l.para) && !G.lig.has(l.id)) G.lig.set(l.id, l);
      historico(`Importado de ${f.name}: ${n} entidades novas`);
      toast(`${n} entidades novas de ${f.name}`, 'ok'); mudou(); setTimeout(ajustar, 600);
    } else dlgColar(texto.slice(0, 500000), f.name);
  };
  inp.click();
}

// ---------- tela ----------
function montar(el) {
  el.classList.add('btg-pg');
  el.innerHTML = `
    <div class="btg-barra">
      <input class="btg-nome" data-nome spellcheck="false" title="Nome da investigação">
      <span class="btg-sep"></span>
      <button class="chip primary" data-a="adicionar" title="Adicionar entidade (ou clique duas vezes no fundo)">${IC.mais}<span>Entidade</span></button>
      <button class="chip" data-a="colar" title="Colar um texto e extrair as entidades">${IC.colar}<span>Colar texto</span></button>
      <button class="chip" data-a="maquinas" title="Roteiros de transformações">${IC.maquina}<span>Máquinas</span></button>
      <span class="btg-sep"></span>
      <button class="icon-btn" data-a="organizar" title="Organizar o grafo">${IC.organizar}</button>
      <button class="icon-btn" data-a="ajustar" title="Ajustar à tela (F)">${IC.ajustar}</button>
      <button class="icon-btn" data-a="desfazer" title="Desfazer (Ctrl+Z)">${IC.desfazer}</button>
      <button class="icon-btn" data-a="exportar" title="Exportar e importar">${IC.exportar}</button>
      <label class="btg-busca">${IC.busca}<input data-busca placeholder="Procurar no grafo" spellcheck="false"></label>
    </div>
    <div class="btg-corpo">
      <div class="btg-palco" data-palco>
        <canvas tabindex="0" data-cv></canvas>
        <div class="btg-vazio" data-vazio hidden></div>
        <div class="btg-fila" data-fila hidden></div>
        <div class="btg-dica" data-dica hidden></div>
        <div class="btg-legenda" data-legenda></div>
      </div>
      <aside class="btg-det" data-det></aside>
    </div>
    <div class="btg-dlg" data-dlg hidden></div>`;
  const q = (s) => el.querySelector(s);
  Object.assign(R, { pg: el, canvas: q('[data-cv]'), palco: q('[data-palco]'), vazio: q('[data-vazio]'), fila: q('[data-fila]'), dica: q('[data-dica]'), det: q('[data-det]'), dlg: q('[data-dlg]'), nome: q('[data-nome]'), busca: q('[data-busca]'), legenda: q('[data-legenda]') });
  ligarCanvas(R.canvas);
  el.querySelector('.btg-barra').onclick = (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'adicionar') dlgAdicionar();
    if (a === 'colar') dlgColar();
    if (a === 'organizar') organizar();
    if (a === 'ajustar') ajustar();
    if (a === 'desfazer') desfazer();
    if (a === 'exportar') { const r = b.getBoundingClientRect(); menuExportar({ preventDefault() {}, stopPropagation() {}, clientX: r.left, clientY: r.bottom + 4 }); }
    if (a === 'maquinas') { const r = b.getBoundingClientRect(); menuMaquinas({ preventDefault() {}, stopPropagation() {}, clientX: r.left, clientY: r.bottom + 4 }); }
  };
  R.nome.onchange = () => { const v = R.nome.value.trim(); if (v && G.inv) { G.inv.nome = v; agendarSalvar(); } else if (G.inv) R.nome.value = G.inv.nome; };
  R.nome.onkeydown = (e) => { if (e.key === 'Enter') R.nome.blur(); };
  R.busca.oninput = () => { V.busca = R.busca.value.trim(); desenhar(); };
  R.busca.onkeydown = (e) => {
    if (e.key === 'Enter') { const ach = [...G.nos.values()].filter((n) => visivel(n) && casa(n)); if (ach.length) { selecionar(ach.map((n) => n.id)); if (ach.length === 1) centrar(ach[0]); else ajustarEm(ach); } }
    if (e.key === 'Escape') { R.busca.value = ''; V.busca = ''; desenhar(); R.canvas.focus(); }
  };
  const ro = new ResizeObserver(() => desenhar());
  ro.observe(R.palco);
  const mo = new MutationObserver(() => { V.cores = null; icones.clear(); desenhar(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  plugin.onUnload(() => { ro.disconnect(); mo.disconnect(); });
  iniciar();
}
function ajustarEm(nos) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nos) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
  const w = R.canvas.clientWidth, h = R.canvas.clientHeight;
  V.cam = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: Math.max(0.15, Math.min(1.4, Math.min((w - 160) / (x1 - x0 + 1), (h - 160) / (y1 - y0 + 1)))) };
  desenhar();
}
function menuMaquinas(e) {
  const sel = selecionadas();
  const um = sel.length === 1 ? sel[0] : null;
  bs.showMenu(e, CAT.maquinas.map((m) => ({
    label: `${m.nome} · ${tipo(m.de).nome}`, icon: IC.maquina,
    action: () => {
      if (um && um.tipo === m.de) return rodarMaquina(m, um);
      toast(`Escolha uma entidade do tipo ${tipo(m.de).nome} no grafo (ou adicione uma) e rode a máquina de novo.`);
    },
  })), um ? `Começar em ${curto(rotuloDe(um), 40)}` : 'Selecione a entidade de partida');
}
let iniciando = null;
function iniciar() {
  if (iniciando) return iniciando;
  iniciando = (async () => {
    try { await catalogo(); } catch (e) { R.vazio.hidden = false; R.vazio.innerHTML = `<div class="btg-vazio-c"><h3>O servidor do Bluetego não respondeu</h3><p>${esc(e.message)}</p><p class="btg-mudo">O Bluetego precisa do Node.js 18 ou mais novo (janela SDKs da IDE).</p></div>`; iniciando = null; return; }
    await listar();
    const ultima = await plugin.data.get('ultima', null).catch(() => null);
    const qual = G.lista.find((x) => x.id === ultima) || G.lista[0];
    if (qual) { try { carregarInv(await plugin.files.read(PASTA + qual.id + '.json', 'json')); } catch { carregarInv(novaInv()); } }
    else carregarInv(novaInv());
    if (V.pendente) { const p = V.pendente; V.pendente = null; p(); }
  })();
  return iniciando;
}
function pintarTudo() {
  if (R.nome && G.inv) R.nome.value = G.inv.nome;
  pintarDetalhes(); pintarLado(); pintarVazio(); pintarFila(); desenhar();
}
function pintarVazio() {
  if (!R.vazio || !CAT) return;
  const vazio = !G.nos.size;
  R.vazio.hidden = !vazio;
  R.legenda.hidden = vazio;
  if (!vazio) { pintarLegenda(); return; }
  if (R.vazio.dataset.pronto) return;
  R.vazio.dataset.pronto = '1';
  R.vazio.innerHTML = `<div class="btg-vazio-c">
    <div class="btg-vazio-ic">${ICON}</div>
    <h3>Comece por uma entidade</h3>
    <p>Um domínio, um IP, um e-mail, um apelido, um CVE. Depois clique com o botão direito nela para puxar o que está ligado.</p>
    <div class="btg-comeco"><input data-v placeholder="exemplo.com.br" spellcheck="false"><button class="chip primary" data-ok>Investigar</button></div>
    <div class="btg-exemplos">${EXEMPLOS.map((x) => `<button class="btg-ex" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <p class="btg-mudo">ou <button class="btg-link" data-colar>cole um texto</button> e o Bluetego acha as entidades nele.</p></div>`;
  const v = R.vazio.querySelector('[data-v]');
  const ir = async () => { if (!v.value.trim()) return v.focus(); try { const n = await adicionarValor(v.value); v.value = ''; if (n) rapidas([n]); } catch (e) { toast(e.message, 'err'); } };
  R.vazio.querySelector('[data-ok]').onclick = ir;
  v.onkeydown = (e) => { if (e.key === 'Enter') ir(); };
  R.vazio.querySelector('[data-colar]').onclick = () => dlgColar();
  R.vazio.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => { v.value = b.dataset.ex; v.focus(); }));
}
function pintarLegenda() {
  const por = {};
  for (const n of G.nos.values()) por[n.tipo] = (por[n.tipo] || 0) + 1;
  R.legenda.innerHTML = Object.entries(por).sort((a, b) => b[1] - a[1]).map(([k, q]) => `<button class="btg-leg${V.ocultos.has(k) ? ' off' : ''}" data-t="${k}" title="${V.ocultos.has(k) ? 'Mostrar' : 'Esconder'} ${esc(tipo(k).nome)}"><span style="background:${tipo(k).cor}"></span>${esc(tipo(k).nome)} <b>${q}</b></button>`).join('');
  R.legenda.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => alternarTipo(b.dataset.t)));
}
function alternarTipo(t) {
  if (V.ocultos.has(t)) V.ocultos.delete(t); else { V.ocultos.add(t); for (const id of [...V.sel]) if (G.nos.get(id)?.tipo === t) V.sel.delete(id); }
  pintarLegenda(); pintarLado(); pintarDetalhes(); desenhar();
}
function pintarFila() {
  if (!R.fila) return;
  const ativo = F.ativos || F.fila.length || F.maquina;
  R.fila.hidden = !ativo;
  if (!ativo) return;
  const pct = F.total ? Math.round((F.feitos / F.total) * 100) : 0;
  R.fila.innerHTML = `<span class="btg-giro"></span><div class="btg-fila-t"><b>${F.maquina ? `${esc(F.maquina.nome)} · passo ${F.maquina.passo} de ${F.maquina.total}` : 'Transformando'}</b><span>${F.maquina && F.maquina.atual ? esc(F.maquina.atual) + ' · ' : ''}${F.feitos} de ${F.total}${F.erros.length ? ` · ${F.erros.length} com erro` : ''}</span><i style="width:${pct}%"></i></div><button class="icon-btn" data-parar title="Parar">${IC.x}</button>`;
  R.fila.querySelector('[data-parar]').onclick = cancelarFila;
}

// ---------- painel de detalhes (direita) ----------
function pintarDetalhes() {
  const d = R.det;
  if (!d || !CAT || !G.inv) return;
  const sel = selecionadas();
  if (sel.length === 1) return detalheUm(d, sel[0]);
  if (sel.length > 1) return detalheVarios(d, sel);
  detalheResumo(d);
}
function detalheUm(d, n) {
  const t = tipo(n.tipo);
  const ts = paraTipo(n.tipo);
  const maqs = CAT.maquinas.filter((m) => m.de === n.tipo);
  const props = Object.entries(n.props || {}).filter(([k, v]) => v !== '' && v != null && k !== 'completo');
  const lig = [...G.lig.values()].filter((l) => l.de === n.id || l.para === n.id);
  const link = linkDe(n);
  const valorProp = (v) => { const s = String(v); return /^https?:\/\/\S+$/.test(s) ? `<button class="btg-link" data-url="${esc(s)}">${esc(curto(s, 48))}</button>` : esc(s); };
  d.innerHTML = `
    <div class="btg-cab"><span class="btg-ic" style="--c:${t.cor}"><svg viewBox="0 0 24 24"><path d="${esc(t.icone)}"/></svg></span><div class="btg-cab-t"><span>${esc(t.nome)}</span><b title="${esc(n.valor)}">${esc(n.valor)}</b></div></div>
    <div class="btg-acoes">
      <button class="icon-btn" data-copiar title="Copiar o valor">${IC.copiar}</button>
      ${link ? `<button class="icon-btn" data-url="${esc(link)}" title="Abrir no navegador">${IC.fora}</button>` : ''}
      <button class="icon-btn${n.fixo ? ' on' : ''}" data-fixo title="${n.fixo ? 'Soltar a posição' : 'Fixar a posição'}">${IC.pino}</button>
      <button class="icon-btn" data-centrar title="Mostrar no grafo">${IC.olho}</button>
      <span class="btg-cores">${CORES.map(([c, nome]) => `<button class="btg-cor${n.cor === c ? ' on' : ''}" data-cor="${c}" title="${nome}" style="--c:${c || 'transparent'}"></button>`).join('')}</span>
      <button class="icon-btn" data-remover title="Remover (Del)">${IC.lixo}</button>
    </div>
    ${n.alerta ? `<div class="btg-alerta">${IC.alerta}<span>${esc(n.props.risco || (n.props.VirusTotal ? 'VirusTotal: ' + n.props.VirusTotal : n.tipo === 'cve' ? 'Vulnerabilidade conhecida' : n.tipo === 'url' ? 'Endereço que costuma esconder algo (backup, painel, configuração)' : 'Ponto de atenção'))}</span></div>` : ''}
    <label class="btg-campo"><span>Rótulo</span><input data-rotulo value="${esc(n.rotulo || '')}" placeholder="${esc(curto(n.valor, 40))}" spellcheck="false"></label>
    <div class="btg-sec"><h4>Transformações <span>${ts.length}</span></h4>
      <button class="btg-rapidas" data-rapidas>${IC.raio}Rodar as rápidas <span>duplo clique · Enter</span></button>
      ${ts.map((x) => `<button class="btg-tr${n.feitas.includes(x.id) ? ' feita' : ''}" data-t="${x.id}" title="${n.feitas.includes(x.id) ? 'Já rodou: clique para rodar de novo' : 'Rodar'}"><span class="btg-tr-n">${n.feitas.includes(x.id) ? IC.ok : x.rapida ? IC.raio : IC.maquina}${esc(x.nome)}</span><span class="btg-tr-f">${esc(x.fonte)}</span></button>`).join('')}
      ${maqs.length ? `<h5>Máquinas</h5>${maqs.map((m) => `<button class="btg-tr" data-m="${m.id}" title="${esc(m.descricao)}"><span class="btg-tr-n">${IC.maquina}${esc(m.nome)}</span><span class="btg-tr-f">${m.passos.length} passos</span></button>`).join('')}` : ''}
    </div>
    ${props.length ? `<div class="btg-sec"><h4>Propriedades</h4><table class="btg-props">${props.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${valorProp(v)}</td></tr>`).join('')}</table></div>` : ''}
    ${n.tipo === 'texto' && n.props.completo ? `<div class="btg-sec"><h4>Texto completo</h4><pre class="btg-pre">${esc(n.props.completo)}</pre></div>` : ''}
    <div class="btg-sec"><h4>Anotações</h4><textarea data-notas class="btg-notas" placeholder="O que você já sabe sobre esta entidade, de onde veio, o que falta confirmar…">${esc(n.notas || '')}</textarea></div>
    <div class="btg-sec"><h4>Ligações <span>${lig.length}</span></h4>${lig.length ? lig.slice(0, 200).map((l) => { const o = G.nos.get(l.de === n.id ? l.para : l.de); if (!o) return ''; return `<button class="btg-li" data-ir="${esc(o.id)}"><span class="btg-pt" style="background:${tipo(o.tipo).cor}"></span><span class="btg-li-r">${l.de === n.id ? '→' : '←'} ${esc(l.rotulo || 'ligado a')}</span><span class="btg-li-v">${esc(rotuloDe(o))}</span></button>`; }).join('') : '<p class="btg-mudo">Nenhuma ainda.</p>'}</div>
    <p class="btg-mudo btg-rodape">Criada ${esc(quando(n.criado))}</p>`;
  d.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.t) enfileirar(b.dataset.t, [n], { deNovo: n.feitas.includes(b.dataset.t) });
    else if (b.dataset.m) rodarMaquina(CAT.maquinas.find((m) => m.id === b.dataset.m), n);
    else if (b.dataset.url) abrirLink(b.dataset.url);
    else if (b.dataset.ir) { const o = G.nos.get(b.dataset.ir); if (o) { selecionar([o.id]); centrar(o); } }
    else if (b.hasAttribute('data-rapidas')) rapidas([n]);
    else if (b.hasAttribute('data-copiar')) bs.copyText(n.valor);
    else if (b.hasAttribute('data-fixo')) { n.fixo = !n.fixo; mudou(n.fixo); }
    else if (b.hasAttribute('data-centrar')) centrar(n);
    else if (b.hasAttribute('data-remover')) remover([n.id]);
    else if (b.dataset.cor !== undefined) { lembrar(); n.cor = b.dataset.cor; mudou(true); }
  };
  const rot = d.querySelector('[data-rotulo]');
  rot.onchange = () => { lembrar(); n.rotulo = rot.value.trim(); mudou(true); };
  const notas = d.querySelector('[data-notas]');
  notas.oninput = () => { n.notas = notas.value; agendarSalvar(); desenhar(); };
}
function detalheVarios(d, sel) {
  const por = {};
  for (const n of sel) por[n.tipo] = (por[n.tipo] || 0) + 1;
  d.innerHTML = `
    <div class="btg-cab"><div class="btg-cab-t"><span>Seleção</span><b>${sel.length} entidades</b></div></div>
    <div class="btg-tags">${Object.entries(por).map(([k, q]) => `<span class="btg-tag" style="--c:${tipo(k).cor}">${esc(tipo(k).nome)} · ${q}</span>`).join('')}</div>
    <div class="btg-sec"><h4>Transformações</h4>
      <button class="btg-rapidas" data-rapidas>${IC.raio}Rodar as rápidas em todas</button>
      ${itensTransformacoes(sel).map((x, i) => `<button class="btg-tr" data-i="${i}"><span class="btg-tr-n">${x.icon}${esc(x.label.split(' · ')[0])}</span><span class="btg-tr-f">${esc(x.label.split(' · ')[1] || '')}</span></button>`).join('')}
    </div>
    <div class="btg-sec"><h4>Organizar</h4>
      ${sel.length === 2 ? `<button class="btg-tr" data-caminho><span class="btg-tr-n">${IC.caminho}Mostrar o caminho entre as duas</span></button>` : ''}
      <button class="btg-tr" data-viz><span class="btg-tr-n">${IC.vizinhos}Selecionar os vizinhos</span></button>
      <button class="btg-tr" data-copiar><span class="btg-tr-n">${IC.copiar}Copiar os valores</span></button>
      <button class="btg-tr" data-remover><span class="btg-tr-n">${IC.lixo}Remover as ${sel.length}</span></button>
    </div>
    ${V.caminho ? `<div class="btg-sec"><h4>Caminho</h4>${[...V.caminho.nos].map((id) => G.nos.get(id)).filter(Boolean).map((o) => `<button class="btg-li" data-ir="${esc(o.id)}"><span class="btg-pt" style="background:${tipo(o.tipo).cor}"></span><span class="btg-li-v">${esc(rotuloDe(o))}</span></button>`).join('')}</div>` : ''}`;
  const itens = itensTransformacoes(sel);
  d.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.i) itens[b.dataset.i].action();
    else if (b.dataset.ir) { const o = G.nos.get(b.dataset.ir); if (o) centrar(o); }
    else if (b.hasAttribute('data-rapidas')) rapidas(sel);
    else if (b.hasAttribute('data-caminho')) mostrarCaminho();
    else if (b.hasAttribute('data-viz')) selecionar([...new Set(sel.flatMap((n) => [n.id, ...vizinhos(n.id)]))]);
    else if (b.hasAttribute('data-copiar')) bs.copyText(sel.map((n) => n.valor).join('\n'));
    else if (b.hasAttribute('data-remover')) remover(sel.map((n) => n.id));
  };
}
function detalheResumo(d) {
  const nos = [...G.nos.values()];
  const alertas = nos.filter((n) => n.alerta);
  const pontos = nos.map((n) => [n, grau(n.id)]).filter(([, g]) => g >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const item = (n, extra) => `<button class="btg-li" data-ir="${esc(n.id)}"><span class="btg-pt" style="background:${tipo(n.tipo).cor}"></span><span class="btg-li-v">${esc(rotuloDe(n))}</span>${extra ? `<span class="btg-li-r">${esc(extra)}</span>` : ''}</button>`;
  d.innerHTML = `
    <div class="btg-cab"><div class="btg-cab-t"><span>Investigação</span><b>${esc(G.inv.nome)}</b></div></div>
    <div class="btg-num"><div><b>${nos.length}</b><span>entidades</span></div><div><b>${G.lig.size}</b><span>ligações</span></div><div><b>${alertas.length}</b><span>alertas</span></div></div>
    ${alertas.length ? `<div class="btg-sec"><h4>Pontos de atenção <span>${alertas.length}</span></h4>${alertas.slice(0, 30).map((n) => item(n, tipo(n.tipo).nome)).join('')}</div>` : ''}
    ${pontos.length ? `<div class="btg-sec"><h4>Pontos de encontro</h4><p class="btg-mudo">As entidades com mais ligações: a infraestrutura ou as pessoas que unem a investigação.</p>${pontos.map(([n, g]) => item(n, g + ' ligações')).join('')}</div>` : ''}
    <div class="btg-sec"><h4>Atalhos</h4><table class="btg-props btg-atalhos">
      <tr><th>Duplo clique</th><td>na entidade: rodar as rápidas · no fundo: adicionar</td></tr>
      <tr><th>Botão direito</th><td>transformações, máquinas, marcar, remover</td></tr>
      <tr><th>Shift + arrastar</th><td>selecionar várias</td></tr>
      <tr><th>Ctrl + clique</th><td>somar à seleção</td></tr>
      <tr><th>F · Ctrl+Z · Del</th><td>ajustar · desfazer · remover</td></tr>
    </table></div>
    <div class="btg-sec"><h4>Histórico</h4>${G.inv.historico.length ? `<ul class="btg-hist">${G.inv.historico.slice(0, 40).map((h) => `<li><span>${esc(quando(h.quando))}</span>${esc(h.texto)}</li>`).join('')}</ul>` : '<p class="btg-mudo">Nada ainda.</p>'}</div>`;
  d.onclick = (e) => { const b = e.target.closest('[data-ir]'); if (b) { const o = G.nos.get(b.dataset.ir); if (o) { selecionar([o.id]); centrar(o); } } };
}

// ---------- painel da esquerda ----------
const lado = document.createElement('div');
lado.className = 'btg-lado';
function pintarLado() {
  if (!G.inv && !G.lista.length) { lado.innerHTML = '<div class="empty">Abrindo…</div>'; return; }
  const por = {};
  for (const n of G.nos.values()) por[n.tipo] = (por[n.tipo] || 0) + 1;
  lado.innerHTML = `
    <div class="btg-lado-h"><span>Investigações</span><button class="icon-btn" data-nova title="Nova investigação">${IC.mais}</button></div>
    ${G.lista.map((x) => `<div class="btg-inv${G.inv && x.id === G.inv.id ? ' on' : ''}" data-id="${esc(x.id)}" title="Alterada ${esc(quando(x.alterada))}"><span class="nm">${esc(x.nome)}</span><span class="sub">${x.n}</span><button class="icon-btn btg-mais" data-apagar="${esc(x.id)}" title="Apagar">${IC.lixo}</button></div>`).join('') || '<div class="btg-mudo btg-pad">Nenhuma ainda.</div>'}
    ${Object.keys(por).length ? `<div class="btg-lado-h"><span>Tipos no grafo</span></div>${Object.entries(por).sort((a, b) => b[1] - a[1]).map(([k, q]) => `<div class="btg-tipo${V.ocultos.has(k) ? ' off' : ''}" data-tipo="${k}" title="Clique para ${V.ocultos.has(k) ? 'mostrar' : 'esconder'}"><span class="btg-pt" style="background:${tipo(k).cor}"></span><span class="nm">${esc(tipo(k).nome)}</span><span class="sub">${q}</span></div>`).join('')}` : ''}
    <div class="btg-lado-h"><span>Fontes</span></div>
    <div class="btg-mudo btg-pad">DNS do Google e da Cloudflare, crt.sh, RDAP, RIPEstat, Shodan InternetDB, ipwho.is, Wayback Machine, GitHub, Gravatar, MITRE e FIRST. VirusTotal com a sua chave no Cofre.</div>`;
}
lado.onclick = async (e) => {
  const ap = e.target.closest('[data-apagar]');
  if (ap) { e.stopPropagation(); return apagarInv(ap.dataset.apagar); }
  if (e.target.closest('[data-nova]')) { abrirPagina(); return criarInv(); }
  const inv = e.target.closest('.btg-inv');
  if (inv) { abrirPagina(); return abrirInv(inv.dataset.id); }
  const t = e.target.closest('[data-tipo]');
  if (t) alternarTipo(t.dataset.tipo);
};
function abrirPagina() { if (!bs.pages.isActive('bluetego')) bs.pages.open('bluetego'); }

// ---------- a partir do editor e do Buscar em tudo ----------
async function investigarTexto(texto, origem) {
  abrirPagina();
  const ir = () => dlgColar(texto, origem);
  if (CAT && G.inv) ir(); else { V.pendente = ir; iniciar(); }
}
function selecaoDoEditor() {
  const ed = bs.editor;
  if (!ed || !ed.getModel()) return '';
  const s = ed.getSelection();
  return s && !s.isEmpty() ? ed.getModel().getValueInRange(s) : ed.getModel().getValue();
}

bs.tools.register({ id: 'bluetego', title: 'Bluetego', icon: ICON, order: 72, page: 'bluetego', render() { pintarLado(); bs.$('#toolBody').replaceChildren(lado); iniciar(); } });
bs.pages.register({
  id: 'bluetego', title: 'Bluetego', icon: ICON, pinned: true, render: montar,
  show() { V.mostrado = true; V.cores = null; iniciar(); setTimeout(() => { desenhar(); if (V.alpha) animar(); }, 30); },
  hide() { V.mostrado = false; dica(null); salvar(); },
});
bs.actions.add([
  { label: 'Bluetego: abrir', icon: ICON, run: abrirPagina },
  { label: 'Bluetego: nova investigação', icon: ICON, run: () => { abrirPagina(); iniciar().then(criarInv); } },
  { label: 'Bluetego: extrair entidades da seleção do editor', icon: ICON, run: () => { const t = selecaoDoEditor(); if (!t.trim()) return toast('Abra um arquivo (ou selecione um trecho) primeiro'); investigarTexto(t, 'editor'); } },
]);
bs.hooks.filter('menu:file', (items, ctx) => (ctx && ctx.rel && !ctx.dir ? [...items, '-', {
  label: 'Extrair entidades no Bluetego', icon: ICON,
  action: async () => {
    try { const f = await bs.api('file', { project: bs.S.project.path, file: ctx.rel }); investigarTexto(String(f.content || '').slice(0, 500000), ctx.rel.split('/').pop()); } catch (e) { toast(e.message, 'err'); }
  },
}] : items));
plugin.onUnload(() => { V.mostrado = false; clearTimeout(G.salvarT); if (G.inv) salvar(); });
