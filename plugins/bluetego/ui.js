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
  engrenagem: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/></svg>',
  foco: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/></svg>',
  recolher: '<svg class="i" viewBox="0 0 24 24"><path d="M8 4l4 4 4-4M8 20l4-4 4 4M4 12h16"/></svg>',
  expandir: '<svg class="i" viewBox="0 0 24 24"><path d="M8 8l4-4 4 4M8 16l4 4 4-4M4 12h16"/></svg>',
  ligar: '<svg class="i" viewBox="0 0 24 24"><circle cx="5.5" cy="12" r="2.5"/><circle cx="18.5" cy="12" r="2.5"/><path d="M8 12h8"/><path d="M13.5 9.5 16 12l-2.5 2.5"/></svg>',
  tempo: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></svg>',
  painel: '<svg class="i" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M14.5 5v14"/></svg>',
  mapa: '<svg class="i" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2"/><rect x="11" y="11" width="6" height="5" rx="1"/></svg>',
  pensar: '<svg class="i" viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>',
  teclado: '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/></svg>',
  menos: '<svg class="i" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  seta: '<svg class="i btg-seta" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg>',
  seta2: '<svg class="i" viewBox="0 0 24 24"><path d="M5 12h14M14 7l5 5-5 5"/></svg>',
  play: '<svg class="i" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pausa: '<svg class="i" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
};
const CORES = [['', 'Sem marca'], ['#e5534b', 'Vermelho'], ['#e8a33d', 'Laranja'], ['#d4b72c', 'Amarelo'], ['#3fb950', 'Verde'], ['#4f8cff', 'Azul'], ['#a371f7', 'Roxo']];
const EXEMPLOS = ['exemplo.com.br', '8.8.8.8', 'contato@empresa.com', '@usuario', '33.000.167/0001-01', 'CVE-2024-3400'];
const PASTA = 'investigacoes/';

// ---------- estado ----------
let CAT = null; // { tipos, transformacoes, maquinas } do servidor
const G = { inv: null, nos: new Map(), lig: new Map(), lista: [], salvarEm: 0, desfazer: [], refazer: [] };
const V = {
  cam: { x: 0, y: 0, z: 1 }, sel: new Set(), hover: null, hoverLig: null, ocultos: new Set(), busca: '', caminho: null, alpha: 0, rodando: false, mostrado: false, cores: null,
  sujo: true, vis: null, escondidos: new Map(), ocupados: new Map(), layout: 'forcas', mini: true, foco: null, ate: null, tempoAberto: false, grupos: null, popAte: 0, badges: [],
  ligando: null, mouse: null, aba: 'detalhes', pistas: [], ia: null,
};
const F = { fila: [], ativos: 0, total: 0, feitos: 0, erros: [], pulados: {}, cancelar: false, maquina: null };
// aprendizado: quanto cada transformação rendeu em cada tipo, neste PC ("dominio|dns-ip": { n: vezes, a: resultados }).
// As pistas sugerem primeiro o que costuma render, e os botões mostram a média.
const AP = { dados: {}, salvarT: 0 };
function aprender(tipo_, tId, resultados) {
  const k = tipo_ + '|' + tId, x = AP.dados[k] || { n: 0, a: 0 };
  AP.dados[k] = { n: x.n + 1, a: x.a + resultados };
  clearTimeout(AP.salvarT);
  AP.salvarT = setTimeout(() => plugin.data.set('aprendizado', AP.dados).catch(() => {}), 1500);
}
const rendeu = (tipo_, tId) => { const x = AP.dados[tipo_ + '|' + tId]; return x && x.n ? x.a / x.n : null; };
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
  Object.assign(V, { caminho: null, hover: null, hoverLig: null, foco: null, ate: null, tempoAberto: false, ligando: null, pistas: [], ia: null, layout: inv.layout || 'forcas', grupos: null });
  V.sel.clear(); sujar();
  plugin.data.set('ultima', inv.id).catch(() => {});
  pintarTudo();
  if (G.nos.size) { if (V.layout === 'tipos') aplicarLayout('tipos', { instantaneo: true }); setTimeout(() => ajustar(true), 60); }
  agendarPistas();
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
  V.caminho = null; sujar();
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
  sujar();
  if (!semFisica) aquecer(0.5);
  pintarDetalhes(); pintarLado(); pintarVazio(); pintarFoco(); desenhar();
  if (V.tempoAberto) pintarTempo();
  agendarSalvar(); agendarPistas();
}
function agendarSalvar() {
  clearTimeout(G.salvarT);
  G.salvarT = setTimeout(salvar, 700);
}
async function salvar() {
  if (!G.inv) return;
  G.inv.alterada = agora();
  // o que é só da tela (velocidade, animação) não vai para o arquivo
  G.inv.nos = [...G.nos.values()].map((n) => Object.fromEntries(Object.entries(n).filter(([k]) => !k.startsWith('_') && !['vx', 'vy', 'fx', 'fy'].includes(k))));
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
function novoNo(e, perto) {
  const ang = Math.random() * Math.PI * 2, dist = perto ? 90 + Math.random() * 60 : 0;
  const base = perto || centroVisivel();
  const n = { id: e.id, tipo: e.tipo, valor: e.valor, rotulo: e.rotulo || '', props: { ...(e.props || {}) }, notas: '', cor: '', fixo: false, alerta: !!e.alerta, feitas: [], criado: agora(), x: base.x + Math.cos(ang) * dist, y: base.y + Math.sin(ang) * dist, vx: 0, vy: 0, _nasceu: performance.now() };
  G.nos.set(n.id, n);
  V.popAte = n._nasceu + 450;
  sujar(); animar();
  return n;
}
function ligar(de, para, rotulo, t) {
  if (de === para) return;
  const id = de + '>' + para;
  const l = G.lig.get(id);
  if (l) { if (rotulo && !l.rotulo.split(' · ').includes(rotulo)) l.rotulo = (l.rotulo ? l.rotulo + ' · ' : '') + rotulo; return; }
  G.lig.set(id, { id, de, para, rotulo: rotulo || '', t: t || '' });
  sujar();
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
  V.ocupados.set(n.id, (V.ocupados.get(n.id) || 0) + 1);
  animar();
  try {
    // as entidades ligadas vão junto: algumas transformações usam (os e-mails prováveis saem dos domínios ligados à pessoa)
    const viz = [...vizinhos(n.id)].map((id) => G.nos.get(id)).filter(Boolean).slice(0, 40).map((x) => ({ tipo: x.tipo, valor: x.valor }));
    const r = await chamar('transformar', { t: t.id, tipo: n.tipo, valor: n.valor, completo: n.tipo === 'texto' ? n.props.completo || n.valor : undefined, deNovo, vizinhos: viz });
    if (!r.guardada) aprender(n.tipo, t.id, (r.entidades || []).length);
    if (!G.nos.has(n.id)) return ok([]);
    const novos = aplicar(n, t.id, r);
    // muitos resultados soltos de uma vez: entram recolhidos no "+N" da entidade, sem soterrar o grafo
    const soltos = novos.filter((id) => vizinhos(id).size === 1).length;
    if (soltos >= 25 && !n.recolher) { n.recolher = true; sujar(); toast(`${soltos} resultados de ${curto(rotuloDe(n), 30)} ficaram recolhidos: clique no +${soltos} para abrir`); }
    historico(`${t.nome} em ${curto(rotuloDe(n), 40)}: ${r.entidades.length ? `${r.entidades.length} ${r.entidades.length === 1 ? 'resultado' : 'resultados'}${novos.length ? `, ${novos.length} ${novos.length === 1 ? 'novo' : 'novos'}` : ''}` : 'nada'}${r.aviso ? ` (${r.aviso})` : ''}`);
    if (r.aviso && F.total === 1) toast(r.aviso);
    mudou();
    ok(novos.concat((r.entidades || []).map((e) => e.id)));
  } catch (e) {
    const cod = e.data && e.data.codigo;
    if (cod === 'cofre') { if (!F.pediuCofre) { F.pediuCofre = true; plugin.vault.request((e.data && e.data.cofre) || t.cofre || 'bluetego.virustotal'); } }
    // consulta pulada porque o site caiu há pouco (o disjuntor do servidor): vira uma linha só no fim, por site
    const pulou = /\(pulado: tento de novo às (\d\d:\d\d)\)/.exec(e.message || '');
    if (pulou) { const k = (e.message.split(' (pulado')[0] || '').replace(/^Sem conexão com |\.$| demorou demais para responder/g, ''); F.pulados[k] = { n: ((F.pulados[k] || {}).n || 0) + 1, volta: pulou[1] }; return ok([]); }
    F.erros.push(`${t.nome} em ${curto(rotuloDe(n), 30)}: ${e.message}`);
    historico(`Falhou: ${t.nome} em ${curto(rotuloDe(n), 40)} (${e.message})`);
    ok([]);
  } finally {
    const c = (V.ocupados.get(n.id) || 1) - 1;
    if (c) V.ocupados.set(n.id, c); else V.ocupados.delete(n.id);
  }
}
function terminouFila() {
  F.pediuCofre = false;
  for (const [site, x] of Object.entries(F.pulados)) historico(`${x.n} ${x.n === 1 ? 'consulta pulada' : 'consultas puladas'}: ${site} está fora do ar (o Bluetego tenta de novo às ${x.volta})`);
  const pulos = Object.values(F.pulados).reduce((a, x) => a + x.n, 0);
  F.pulados = {};
  if (F.erros.length || pulos) toast([F.erros.length === 1 ? F.erros[0] : F.erros.length ? `${F.erros.length} transformações falharam.` : '', pulos ? `${pulos} consultas puladas (site fora do ar).` : '', 'Veja no histórico.'].filter(Boolean).join(' '), 'err');
  pintarFila(); mudou();
}
function rapidas(nos) {
  const ts = new Set();
  for (const n of nos) for (const t of paraTipo(n.tipo)) if (t.rapida) ts.add(t.id);
  if (!ts.size) return toast('Nenhuma transformação rápida para este tipo');
  for (const t of ts) enfileirar(t, nos);
}
// a parte registrável: www.loja.exemplo.com.br -> exemplo.com.br (o escopo de uma investigação de domínio)
const SUFIXO_DUPLO = /^(com|net|org|gov|edu|co|ac|art|blog|eco|ind|inf|adv|eng|med|nom|tv)\.[a-z]{2}$/;
const baseDominio = (d) => { const l = String(d).toLowerCase().split('.'); return l.slice(l.length >= 3 && SUFIXO_DUPLO.test(l.slice(-2).join('.')) ? -3 : -2).join('.'); };
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
      // "tipos" limita o passo: a busca na web do rastro do apelido não sai procurando cada primeiro nome achado
      let alvos = [...daMaquina].map((id) => G.nos.get(id)).filter((n) => n && t.de.includes(n.tipo) && (!p.tipos || p.tipos.includes(n.tipo)) && !feitas.has(p.t + '|' + n.id));
      // escopo: domínio de outra empresa que apareceu no caminho (vizinho de hospedagem, CDN) não é sondado
      if (m.escopo && semente.tipo === 'dominio') { const b = baseDominio(semente.valor), antes = alvos.length; alvos = alvos.filter((n) => n.tipo !== 'dominio' || baseDominio(n.valor) === b); if (antes > alvos.length) F.foraDoEscopo = (F.foraDoEscopo || 0) + antes - alvos.length; }
      if (p.max) alvos = alvos.slice(0, p.max);
      alvos.forEach((n) => feitas.add(p.t + '|' + n.id));
      const ids = await enfileirar(p.t, alvos);
      for (const id of ids) if (!daMaquina.has(id)) { daMaquina.add(id); novas++; }
      if (novas > 600) { toast('A máquina parou: mais de 600 entidades novas'); break; }
    }
  } finally {
    historico(`Máquina "${m.nome}" terminou: ${novas} entidades${F.foraDoEscopo ? ` (${F.foraDoEscopo} passos em domínios de terceiros pulados: fora do escopo)` : ''}`);
    F.foraDoEscopo = 0;
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

// ---------- o que aparece: tipos escondidos, resultados recolhidos, foco e linha do tempo ----------
// recalculado só quando algo muda (V.sujo): a lista de vizinhos e o conjunto de entidades visíveis
function vista() {
  if (!V.sujo && V.vis) return V.vis;
  const adj = new Map();
  for (const n of G.nos.values()) adj.set(n.id, new Set());
  for (const l of G.lig.values()) if (adj.has(l.de) && adj.has(l.para)) { adj.get(l.de).add(l.para); adj.get(l.para).add(l.de); }
  G.adj = adj;
  let dentro = null;
  if (V.foco && G.nos.has(V.foco.id)) {
    dentro = new Set([V.foco.id]);
    let borda = [V.foco.id];
    for (let i = 0; i < V.foco.saltos; i++) { const prox = []; for (const id of borda) for (const v of adj.get(id)) if (!dentro.has(v)) { dentro.add(v); prox.push(v); } borda = prox; }
  } else V.foco = null;
  const vis = new Set(), escondidos = new Map();
  for (const n of G.nos.values()) {
    if (V.ocultos.has(n.tipo) || (dentro && !dentro.has(n.id)) || (V.ate && n.criado > V.ate)) continue;
    // resultado recolhido: entidade que só se liga a uma entidade marcada para recolher vira o "+N" dela
    const viz = adj.get(n.id);
    if (viz.size === 1) { const p = G.nos.get([...viz][0]); if (p && p.recolher) { escondidos.set(p.id, (escondidos.get(p.id) || 0) + 1); continue; } }
    vis.add(n.id);
  }
  Object.assign(V, { vis, escondidos, sujo: false });
  return vis;
}
const sujar = () => { V.sujo = true; };
const visivel = (n) => !!n && vista().has(n.id);
const vizinhos = (id) => { vista(); return G.adj.get(id) || new Set(); };
const grau = (id) => vizinhos(id).size;
const folhasRecolhiveis = (n) => [...vizinhos(n.id)].filter((v) => vizinhos(v).size === 1).length;
function recolher(n, sim) {
  n.recolher = sim;
  sujar();
  historico(`${sim ? 'Recolhidos' : 'Abertos'} os resultados de ${curto(rotuloDe(n), 40)}`);
  mudou();
}
function focar(n, saltos) {
  V.foco = n ? { id: n.id, saltos: Math.max(1, Math.min(6, saltos || 2)) } : null;
  sujar(); pintarFoco(); mudou(true);
  setTimeout(() => ajustar(), 50);
}

// ---------- organização: forças, hierárquico, radial, por tipo e círculo ----------
const LAYOUTS = [['forcas', 'Forças', 'as ligações puxam, as entidades se afastam'], ['hierarquico', 'Hierárquico', 'da entidade de partida para baixo, em níveis'], ['radial', 'Radial', 'em anéis em volta da entidade de partida'], ['tipos', 'Agrupado por tipo', 'um grupo para cada tipo de entidade'], ['circulo', 'Círculo', 'todas num círculo, ordenadas por tipo']];
function componentes(ids) {
  const resta = new Set(ids), out = [];
  for (const id of ids) {
    if (!resta.has(id)) continue;
    const comp = [id]; resta.delete(id);
    for (let i = 0; i < comp.length; i++) for (const v of G.adj.get(comp[i]) || []) if (resta.has(v)) { resta.delete(v); comp.push(v); }
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length);
}
// a raiz: a selecionada, senão a primeira entidade posta na investigação (de onde ela começou)
function raizDe(comp) {
  const sel = comp.find((id) => V.sel.has(id));
  if (sel) return sel;
  return comp.map((id) => G.nos.get(id)).sort((a, b) => String(a.criado).localeCompare(String(b.criado)) || grau(b.id) - grau(a.id))[0].id;
}
function arvore(comp, raiz) {
  const dentro = new Set(comp), filhos = new Map(), prof = new Map([[raiz, 0]]), fila = [raiz];
  while (fila.length) {
    const x = fila.shift(), f = [];
    for (const v of G.adj.get(x) || []) if (dentro.has(v) && !prof.has(v)) { prof.set(v, prof.get(x) + 1); f.push(v); fila.push(v); }
    // mesmo tipo junto e em ordem: a mesma investigação fica sempre com a mesma cara
    f.sort((a, b) => { const na = G.nos.get(a), nb = G.nos.get(b); return na.tipo.localeCompare(nb.tipo) || rotuloDe(na).localeCompare(rotuloDe(nb)); });
    filhos.set(x, f);
  }
  return { filhos, prof };
}
function posHierarquico(comp) {
  const raiz = raizDe(comp), { filhos } = arvore(comp, raiz);
  // medidas em colunas e níveis; um pai com muitos ramos quebra os ramos em fileiras (o grafo não vira uma linha)
  const COL = 125, LIN = 165, GRADE = 8, MAXW = Math.max(10, Math.round(Math.sqrt(comp.length) * 2.2));
  const med = new Map(), pos = new Map();
  const folha = (id) => !(filhos.get(id) || []).length;
  const medir = (id) => {
    const f = filhos.get(id) || [], fs = f.filter(folha), rs = f.filter((x) => !folha(x));
    rs.forEach(medir);
    const linhas = [];
    let atual = [], w = 0;
    for (const r of rs) { const rw = med.get(r).w; if (atual.length && w + rw > MAXW) { linhas.push(atual); atual = []; w = 0; } atual.push(r); w += rw; }
    if (atual.length) linhas.push(atual);
    // as folhas de um mesmo pai viram uma grade embaixo dele (até 8 por linha)
    const hf = fs.length ? Math.ceil(fs.length / GRADE) * 0.5 + 0.5 : 0;
    const larguras = linhas.map((l) => l.reduce((a, r) => a + med.get(r).w, 0)), alturas = linhas.map((l) => Math.max(...l.map((r) => med.get(r).h)));
    med.set(id, { w: Math.max(1, Math.min(GRADE, fs.length), ...larguras), h: 1 + hf + alturas.reduce((a, b) => a + b, 0), fs, linhas, larguras, alturas, hf });
  };
  medir(raiz);
  const colocar = (id, x0, y0) => {
    const m = med.get(id);
    pos.set(id, { x: (x0 + m.w / 2) * COL, y: y0 * LIN });
    const cols = Math.min(GRADE, m.fs.length), xf = x0 + (m.w - cols) / 2;
    m.fs.forEach((v, i) => pos.set(v, { x: (xf + (i % cols) + 0.5) * COL, y: (y0 + 1 + Math.floor(i / cols) * 0.5) * LIN }));
    let y = y0 + 1 + m.hf;
    m.linhas.forEach((l, k) => {
      let x = x0 + (m.w - m.larguras[k]) / 2;
      for (const r of l) { colocar(r, x, y); x += med.get(r).w; }
      y += m.alturas[k];
    });
  };
  colocar(raiz, 0, 0);
  return pos;
}
function posRadial(comp) {
  const raiz = raizDe(comp), { filhos, prof } = arvore(comp, raiz);
  const peso = new Map();
  const pesar = (id) => { const f = filhos.get(id) || []; const p = f.length ? f.reduce((a, x) => a + pesar(x), 0) : 1; peso.set(id, p); return p; };
  pesar(raiz);
  // cada anel com raio para caber as entidades dele
  const porNivel = [];
  for (const d of prof.values()) porNivel[d] = (porNivel[d] || 0) + 1;
  const R = [0];
  for (let d = 1; d < porNivel.length; d++) R[d] = Math.max(R[d - 1] + 190, (porNivel[d] * 84) / (2 * Math.PI)); // 84 px por entidade: cabe o rótulo ao lado
  const pos = new Map([[raiz, { x: 0, y: 0 }]]);
  const colocar = (id, a0, a1, d) => {
    let a = a0;
    for (const x of filhos.get(id) || []) {
      const fatia = ((a1 - a0) * peso.get(x)) / peso.get(id), meio = a + fatia / 2;
      pos.set(x, { x: Math.cos(meio) * R[d + 1], y: Math.sin(meio) * R[d + 1] });
      colocar(x, a, a + fatia, d + 1);
      a += fatia;
    }
  };
  colocar(raiz, -Math.PI / 2, Math.PI * 1.5, 0);
  return pos;
}
// junta os pedaços (cada componente com o seu layout) em fileiras, os maiores primeiro
function empacotar(partes, folga = 170) {
  const caixas = partes.map((p) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of p.values()) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    return { p, x0, y0, w: x1 - x0 + folga, h: y1 - y0 + folga };
  });
  const area = caixas.reduce((a, c) => a + c.w * c.h, 0), limite = Math.max(caixas[0] ? caixas[0].w : 0, Math.sqrt(area) * 1.6);
  const out = new Map();
  let x = 0, y = 0, alt = 0;
  for (const c of caixas) {
    if (x > 0 && x + c.w > limite) { x = 0; y += alt; alt = 0; }
    for (const [id, q] of c.p) out.set(id, { x: q.x - c.x0 + x, y: q.y - c.y0 + y });
    x += c.w; alt = Math.max(alt, c.h);
  }
  return out;
}
function posTipos(ids) {
  const por = new Map();
  for (const id of ids) { const n = G.nos.get(id); (por.get(n.tipo) || por.set(n.tipo, []).get(n.tipo)).push(n); }
  const grupos = [];
  const partes = [...por.entries()].sort((a, b) => b[1].length - a[1].length).map(([t, nos]) => {
    nos.sort((a, b) => grau(b.id) - grau(a.id) || rotuloDe(a).localeCompare(rotuloDe(b)));
    // girassol: as mais ligadas no meio, o resto em espiral sem se encostar
    const p = new Map(nos.map((n, i) => [n.id, { x: 34 * Math.sqrt(i + 0.5) * Math.cos(i * 2.39996), y: 34 * Math.sqrt(i + 0.5) * Math.sin(i * 2.39996) }]));
    grupos.push({ tipo: t, ids: nos.map((n) => n.id) });
    return p;
  });
  const pos = empacotar(partes, 230);
  V.grupos = grupos.map((g) => {
    let sx = 0, sy = 0, r = 0;
    for (const id of g.ids) { sx += pos.get(id).x; sy += pos.get(id).y; }
    const c = { x: sx / g.ids.length, y: sy / g.ids.length };
    for (const id of g.ids) r = Math.max(r, Math.hypot(pos.get(id).x - c.x, pos.get(id).y - c.y));
    return { ...c, r: r + 48, tipo: g.tipo, n: g.ids.length };
  });
  return pos;
}
function posCirculo(ids) {
  const nos = ids.map((id) => G.nos.get(id)).sort((a, b) => a.tipo.localeCompare(b.tipo) || grau(b.id) - grau(a.id));
  const r = Math.max(240, (nos.length * 50) / (2 * Math.PI));
  return new Map(nos.map((n, i) => [n.id, { x: Math.cos((i / nos.length) * 2 * Math.PI - Math.PI / 2) * r, y: Math.sin((i / nos.length) * 2 * Math.PI - Math.PI / 2) * r }]));
}
function aplicarLayout(nome, opt = {}) {
  V.layout = nome;
  if (G.inv) G.inv.layout = nome;
  V.grupos = null;
  pintarBarraLayout();
  const ids = [...vista()];
  if (!ids.length) return;
  let alvo;
  if (nome === 'tipos') alvo = posTipos(ids);
  else if (nome === 'circulo') alvo = posCirculo(ids);
  else alvo = empacotar(componentes(ids).map((c) => (nome === 'hierarquico' ? posHierarquico(c) : posRadial(c))));
  // forças: parte do radial (um bom começo) e deixa a física acertar
  const depois = nome === 'forcas' ? () => { for (const n of G.nos.values()) n.fixo = false; V.alpha = 1; animar(); setTimeout(() => ajustar(), 1400); } : null;
  irPara(alvo, opt.instantaneo ? 0 : 750, depois);
  if (!opt.semCamera) ajustarEm([...alvo.values()]);
  agendarSalvar();
}
// numa organização fixa, entidade nova pede a organização de novo (com animação)
function agendarLayout() {
  clearTimeout(V.layoutT);
  // sem mexer na câmera: a tela não fica pulando a cada resultado que chega
  V.layoutT = setTimeout(() => aplicarLayout(V.layout, { semCamera: true }), 350);
}

// ---------- física (forças com grade: até alguns milhares de entidades) ----------
function aquecer(a) {
  if (V.layout !== 'forcas') return agendarLayout();
  V.alpha = Math.max(V.alpha, a); animar();
}
function passo() {
  const vis = vista();
  const nos = [...vis].map((id) => G.nos.get(id));
  const CEL = 320, grade = new Map();
  for (const n of nos) { const k = Math.floor(n.x / CEL) + ',' + Math.floor(n.y / CEL); (grade.get(k) || grade.set(k, []).get(k)).push(n); n.fx = 0; n.fy = 0; }
  for (const n of nos) {
    const cx = Math.floor(n.x / CEL), cy = Math.floor(n.y / CEL), rn = raio(n);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of grade.get((cx + i) + ',' + (cy + j)) || []) {
      if (o === n) continue;
      let dx = n.x - o.x, dy = n.y - o.y, d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
      if (d2 > CEL * CEL) continue;
      const d = Math.sqrt(d2);
      let f = Math.min(40, 26000 / d2);
      // colisão: duas entidades encostadas se empurram com força, o rótulo de baixo precisa de espaço
      const min = rn + raio(o) + 34;
      if (d < min) f += (min - d) * 0.6;
      n.fx += (dx / d) * f; n.fy += (dy / d) * f;
    }
  }
  for (const l of G.lig.values()) {
    if (!vis.has(l.de) || !vis.has(l.para)) continue;
    const a = G.nos.get(l.de), b = G.nos.get(l.para);
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    // folhas mais perto do pai, ligações entre entidades importantes mais longas
    const ideal = Math.min(grau(a.id), grau(b.id)) <= 1 ? 105 : 175;
    const f = (d - ideal) * 0.05;
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
const suave = (t) => (t >= 1 ? 1 : t <= 0 ? 0 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function irPara(alvo, dur, depois) {
  V.alpha = 0;
  const de = new Map();
  for (const id of alvo.keys()) { const n = G.nos.get(id); if (n) de.set(id, { x: n.x, y: n.y }); }
  V.trans = { t0: performance.now(), dur: Math.max(1, dur), de, para: alvo, depois };
  animar();
}
function moverCamera(para, dur = 420) {
  if (!dur) { V.cam = { ...para }; V.camAnim = null; desenhar(); return; }
  V.camAnim = { de: { ...V.cam }, para, t0: performance.now(), dur };
  animar();
}
function animar() {
  if (V.rodando || !V.mostrado) return;
  V.rodando = true;
  requestAnimationFrame(quadro);
}
function quadro() {
  if (!V.mostrado) { V.rodando = false; return; }
  const t = performance.now();
  if (V.trans) {
    const k = suave((t - V.trans.t0) / V.trans.dur);
    for (const [id, p] of V.trans.para) { const n = G.nos.get(id), d = V.trans.de.get(id); if (n && d) { n.x = d.x + (p.x - d.x) * k; n.y = d.y + (p.y - d.y) * k; n.vx = n.vy = 0; } }
    if (k >= 1) { const f = V.trans.depois; V.trans = null; agendarSalvar(); if (f) f(); }
  } else if (V.alpha > 0 && V.layout === 'forcas') passo();
  if (V.camAnim) {
    const k = suave((t - V.camAnim.t0) / V.camAnim.dur), a = V.camAnim.de, b = V.camAnim.para;
    // zoom em escala logarítmica: não dá o "pulo" no fim
    V.cam = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * k) };
    if (k >= 1) V.camAnim = null;
  }
  desenhar();
  if (V.trans || V.camAnim || V.alpha > 0 || V.arrastando || F.ativos > 0 || t < (V.popAte || 0)) requestAnimationFrame(quadro);
  else { V.rodando = false; agendarSalvar(); }
}
function organizar() { aplicarLayout(V.layout || 'forcas'); }

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
const raio = (n) => ((n._g || 0) <= 1 ? 13 : 16 + Math.min(12, Math.sqrt(n._g || 0) * 2.2));
// o rótulo que cabe no grafo (o valor inteiro fica na dica do mouse e no painel): uma conta vira "GitHub · nome",
// uma URL vira "site/…/página", texto longo encurta
const SITES_CURTOS = { 'github.com': 'GitHub', 'gitlab.com': 'GitLab', 'x.com': 'X', 'twitter.com': 'X', 'instagram.com': 'Instagram', 'facebook.com': 'Facebook', 'linkedin.com': 'LinkedIn', 'youtube.com': 'YouTube', 'tiktok.com': 'TikTok', 'reddit.com': 'Reddit', 'keybase.io': 'Keybase', 'gravatar.com': 'Gravatar', 't.me': 'Telegram', 'wa.me': 'WhatsApp', 'bsky.app': 'Bluesky', 'mastodon.social': 'Mastodon', 'steamcommunity.com': 'Steam', 'orcid.org': 'ORCID' };
function rotuloCurto(n) {
  if (n.rotulo) return n.rotulo;
  if (n.tipo !== 'conta' && n.tipo !== 'url') return n.valor;
  try {
    const u = new URL(n.valor), host = u.hostname.replace(/^www\./, '');
    const partes = u.pathname.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
    if (n.tipo === 'conta') {
      const site = (n.props && n.props.site) || SITES_CURTOS[host] || host.split('.').slice(-2)[0].replace(/^./, (c) => c.toUpperCase());
      const nome = (partes.filter((p) => !/^(in|u|user|users|profile|member|id|channel|c|company|school|people)$/i.test(p))[0] || u.searchParams.get('id') || '').replace(/^[@~+]/, '');
      return nome ? `${site} · ${nome}` : site;
    }
    if (/google\.com$/.test(host) && u.searchParams.get('q')) return 'Busca: ' + u.searchParams.get('q');
    return partes.length ? `${host}/${partes.length > 1 ? '…/' : ''}${partes[partes.length - 1]}` : host;
  } catch { return n.valor; }
}
function casa(n) {
  if (!V.busca) return true;
  const q = V.busca.toLowerCase();
  return n.valor.toLowerCase().includes(q) || (n.rotulo || '').toLowerCase().includes(q) || (n.notas || '').toLowerCase().includes(q) || tipo(n.tipo).nome.toLowerCase().includes(q) || Object.values(n.props || {}).some((v) => String(v).toLowerCase().includes(q));
}
const paraTela = (x, y) => ({ x: (x - V.cam.x) * V.cam.z + R.canvas.clientWidth / 2, y: (y - V.cam.y) * V.cam.z + R.canvas.clientHeight / 2 });
// a curva das ligações de ida e volta (a -> b e b -> a ficam lado a lado, sem se cobrir)
function pontoControle(a, b, l) {
  if (!G.lig.has(l.para + '>' + l.de)) return null;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  return { x: mx - (dy / d) * 26, y: my + (dx / d) * 26 };
}
// rótulos sem sobreposição: os mais importantes primeiro; um que encostaria em outro já posto fica de fora
function colocador() {
  const grade = new Map(), CEL = 90;
  const celulas = (x, y, w, h, fn) => { for (let i = Math.floor(x / CEL); i <= Math.floor((x + w) / CEL); i++) for (let j = Math.floor(y / CEL); j <= Math.floor((y + h) / CEL); j++) fn(i + ',' + j); };
  const livre = (x, y, w, h, dono) => { let ok = true; celulas(x, y, w, h, (k) => { for (const r of grade.get(k) || []) if (r.dono !== dono && x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y) ok = false; }); return ok; };
  const ocupar = (x, y, w, h, dono) => { const r = { x, y, w, h, dono }; celulas(x, y, w, h, (k) => (grade.get(k) || grade.set(k, []).get(k)).push(r)); };
  return { livre, ocupar };
}
function pilula(ctx, x, y, w, h, fundo) {
  ctx.fillStyle = fundo;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2); else ctx.rect(x, y, w, h);
  ctx.fill();
}
function desenhar() {
  const cv = R.canvas;
  if (!cv || !V.mostrado) return;
  if (!V.cores) lerCores();
  const vis = vista(), C = V.cores, dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight, agoraMs = performance.now();
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const { x: cx, y: cy, z } = V.cam;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 - cx * z), dpr * (h / 2 - cy * z));
  for (const id of vis) { const n = G.nos.get(id); n._g = (G.adj.get(id) || new Set()).size; }
  // destaque: a seleção e os vizinhos dela; sem seleção, o que está sob o mouse
  const centroFoco = V.sel.size ? [...V.sel] : V.hover ? [V.hover] : V.hoverLig && G.lig.get(V.hoverLig) ? [G.lig.get(V.hoverLig).de, G.lig.get(V.hoverLig).para] : null;
  const foco = centroFoco ? new Set(centroFoco.flatMap((id) => [id, ...(V.sel.size || V.hover ? vizinhos(id) : [])])) : null;
  const apagado = (n) => (V.busca && !casa(n)) || (V.caminho && !V.caminho.nos.has(n.id)) || (foco && !foco.has(n.id));
  // grupos do layout por tipo
  if (V.grupos && V.layout === 'tipos') for (const g of V.grupos) {
    ctx.globalAlpha = 0.06; ctx.fillStyle = tipo(g.tipo).cor;
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.35; ctx.strokeStyle = tipo(g.tipo).cor; ctx.lineWidth = 1.5 / z; ctx.setLineDash([6 / z, 6 / z]); ctx.stroke(); ctx.setLineDash([]);
  }
  // ligações
  ctx.lineWidth = 1.3 / Math.max(z, 0.5);
  const rotulosLig = [];
  for (const l of G.lig.values()) {
    if (!vis.has(l.de) || !vis.has(l.para)) continue;
    const a = G.nos.get(l.de), b = G.nos.get(l.para);
    const forte = V.sel.has(a.id) || V.sel.has(b.id) || (V.caminho && V.caminho.lig.has(l.id)) || V.hoverLig === l.id || (!V.sel.size && V.hover && (V.hover === a.id || V.hover === b.id));
    const fraco = (apagado(a) || apagado(b)) && !forte;
    ctx.globalAlpha = fraco ? 0.08 : forte ? 0.95 : 0.32;
    ctx.strokeStyle = forte ? C.accent : C.line;
    ctx.lineWidth = (forte ? 2 : 1.1) / Math.max(z, 0.5);
    const pc = pontoControle(a, b, l);
    const alvoX = pc ? pc.x : a.x, alvoY = pc ? pc.y : a.y;
    const dx = b.x - alvoX, dy = b.y - alvoY, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, rb = raio(b) + 3;
    const ex = b.x - ux * rb, ey = b.y - uy * rb;
    const sdx = (pc ? pc.x : b.x) - a.x, sdy = (pc ? pc.y : b.y) - a.y, sd = Math.hypot(sdx, sdy) || 1;
    if (l.t === 'manual' || l.t === 'ia') ctx.setLineDash([7 / z, 4 / z]);
    ctx.beginPath(); ctx.moveTo(a.x + (sdx / sd) * raio(a), a.y + (sdy / sd) * raio(a));
    if (pc) ctx.quadraticCurveTo(pc.x, pc.y, ex, ey); else ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    // seta só de perto (ou na ligação em destaque): de longe ela é só ruído
    if (forte || z > 0.75) {
      const s = 6 / Math.max(z, 0.6);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - ux * s - uy * s * 0.45, ey - uy * s + ux * s * 0.45); ctx.lineTo(ex - ux * s + uy * s * 0.45, ey - uy * s - ux * s * 0.45); ctx.fill();
    }
    if (l.rotulo && !fraco && (forte || (z > 1.1 && vis.size < 120))) rotulosLig.push({ l, x: pc ? pc.x : (a.x + b.x) / 2, y: pc ? pc.y : (a.y + b.y) / 2, forte });
  }
  if (V.ligando && V.mouse) {
    const a = G.nos.get(V.ligando.de), alvo = V.hover && V.hover !== V.ligando.de ? G.nos.get(V.hover) : null;
    if (a) {
      ctx.globalAlpha = 0.9; ctx.strokeStyle = C.accent; ctx.lineWidth = 2.5 / Math.max(z, 0.5); ctx.setLineDash([8 / z, 6 / z]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(alvo ? alvo.x : V.mouse.x, alvo ? alvo.y : V.mouse.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }
  // entidades
  V.badges = [];
  const rotulos = [];
  for (const id of vis) {
    const n = G.nos.get(id);
    const sel = V.sel.has(n.id), cor = tipo(n.tipo).cor;
    // entrada: a entidade nova cresce do nada com um pequeno "salto"
    const idade = n._nasceu ? (agoraMs - n._nasceu) / 380 : 1;
    const esc = idade >= 1 ? 1 : 1 + 2.7 * Math.pow(idade - 1, 3) + 1.7 * Math.pow(idade - 1, 2);
    const r = raio(n) * Math.max(0.05, esc);
    const alfa = apagado(n) ? 0.2 : 1;
    ctx.globalAlpha = alfa;
    if (n.alerta) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 7, 0, Math.PI * 2); ctx.fillStyle = '#e5534b'; ctx.globalAlpha = alfa * 0.18; ctx.fill(); ctx.globalAlpha = alfa; }
    if (sel || n.id === V.hover) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2); ctx.fillStyle = sel ? C.accent : C.line; ctx.globalAlpha = alfa * (sel ? 0.4 : 0.55); ctx.fill(); ctx.globalAlpha = alfa; }
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = C.panel; ctx.fill();
    ctx.fillStyle = cor + (n.cor ? '00' : '1f'); ctx.fill();
    if (n.cor) { ctx.fillStyle = n.cor + '55'; ctx.fill(); }
    ctx.lineWidth = n.cor ? 3 : 2; ctx.strokeStyle = n.cor || cor; ctx.stroke();
    const p = icone(n.tipo);
    if (p && r > 4) {
      const s = (r * 1.05) / 12;
      ctx.save(); ctx.translate(n.x - 12 * s, n.y - 12 * s); ctx.scale(s, s);
      ctx.strokeStyle = cor; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(p); ctx.restore();
    }
    // transformação rodando nesta entidade: um arco girando em volta
    if (V.ocupados.has(n.id)) {
      const ang = (agoraMs / 160) % (Math.PI * 2);
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 6, ang, ang + Math.PI * 1.2); ctx.strokeStyle = C.accent; ctx.lineWidth = 2.5 / Math.max(z, 0.6); ctx.stroke();
    }
    if (n.alerta) { ctx.beginPath(); ctx.arc(n.x + r * 0.72, n.y - r * 0.72, 5, 0, Math.PI * 2); ctx.fillStyle = '#e5534b'; ctx.fill(); }
    if (n.fixo && V.layout === 'forcas' && (sel || n.id === V.hover)) { ctx.beginPath(); ctx.arc(n.x - r * 0.72, n.y - r * 0.72, 3, 0, Math.PI * 2); ctx.fillStyle = C.muted; ctx.fill(); }
    if (n.notas) { ctx.fillStyle = '#d4b72c'; ctx.fillRect(n.x + r * 0.45, n.y + r * 0.45, 6, 6); }
    // "+N": resultados recolhidos dentro desta entidade (clique abre)
    const esc_ = V.escondidos.get(n.id);
    if (esc_) {
      const bx = n.x + r * 0.85, by = n.y + r * 0.85, br = 11 / Math.max(z, 0.6);
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fillStyle = C.accent; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `600 ${9.5 / Math.max(z, 0.6)}px ${C.fonte}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+' + (esc_ > 99 ? '99' : esc_), bx, by + 0.5 / z);
      V.badges.push({ id: n.id, x: bx, y: by, r: br });
    }
    const prio = sel || n.id === V.hover ? 1e9 : (n.alerta ? 500 : 0) + n._g * 10 + (foco && foco.has(n.id) ? 1e6 : 0);
    const muitas = vis.size > 25, folha = n._g <= 1;
    const mostra = prio >= 1e6 || n.alerta || (z > 0.3 && !(muitas && folha && z < 1.15) && !(vis.size > 80 && n._g < 3 && z < 0.9));
    if (mostra) rotulos.push({ n, r, prio, alfa, sel });
  }
  ctx.globalAlpha = 1;
  // rótulos na tela (tamanho fixo, legíveis em qualquer zoom): cada entidade ocupa o seu lugar, e o rótulo procura
  // um lado livre (embaixo, em cima, à direita, à esquerda); sem lugar, ele não aparece (a dica do mouse mostra)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const espaco = colocador();
  for (const id of vis) { const n = G.nos.get(id), p = paraTela(n.x, n.y), rz = raio(n) * z + 2; espaco.ocupar(p.x - rz, p.y - rz, rz * 2, rz * 2, id); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  rotulos.sort((a, b) => b.prio - a.prio);
  let postos = 0;
  for (const { n, r, alfa, sel, prio } of rotulos) {
    if (postos > 300 && prio < 1e6) break;
    const destaque = sel || n.id === V.hover, forteR = destaque || n._g >= 3 || n.alerta;
    const t = curto(rotuloCurto(n), destaque ? 60 : 26);
    ctx.font = `${forteR ? 600 : 500} ${destaque ? 12 : 11}px ${C.fonte}`;
    const tw = ctx.measureText(t).width + 12, th = destaque ? 19 : 17;
    const p = paraTela(n.x, n.y), rz = r * z;
    const lados = [[p.x - tw / 2, p.y + rz + 3], [p.x - tw / 2, p.y - rz - 3 - th], [p.x + rz + 4, p.y - th / 2], [p.x - rz - 4 - tw, p.y - th / 2]];
    const pos = lados.find(([x, y]) => espaco.livre(x, y, tw, th, n.id)) || (prio >= 1e9 ? lados[0] : null);
    if (!pos) continue;
    const [x, y] = pos;
    if (x > w || y > h || x + tw < 0 || y + th < 0) continue;
    espaco.ocupar(x, y, tw, th, 'r:' + n.id);
    postos++;
    // fundo do rótulo com transparência pelo globalAlpha (a cor do tema pode não ser hexadecimal)
    ctx.globalAlpha = alfa * (sel ? 1 : 0.78);
    pilula(ctx, x, y, tw, th, sel ? C.accent : C.bg);
    ctx.globalAlpha = alfa * (forteR ? 1 : 0.82);
    ctx.fillStyle = sel ? '#fff' : C.fg;
    ctx.fillText(t, x + tw / 2, y + th / 2 + 0.5);
  }
  ctx.font = `500 10.5px ${C.fonte}`;
  for (const { l, x: lx, y: ly, forte } of rotulosLig) {
    const t = curto(l.rotulo, 32), tw = ctx.measureText(t).width + 10, th = 16, p = paraTela(lx, ly);
    if (!espaco.livre(p.x - tw / 2, p.y - th / 2, tw, th) && !forte) continue;
    espaco.ocupar(p.x - tw / 2, p.y - th / 2, tw, th, 'l:' + l.id);
    ctx.globalAlpha = forte ? 1 : 0.85;
    pilula(ctx, p.x - tw / 2, p.y - th / 2, tw, th, C.panel);
    ctx.fillStyle = forte ? C.fg : C.muted;
    ctx.fillText(t, p.x, p.y + 0.5);
  }
  // nomes dos grupos (layout por tipo)
  if (V.grupos && V.layout === 'tipos') {
    ctx.font = `600 12px ${C.fonte}`;
    for (const g of V.grupos) { const p = paraTela(g.x, g.y - g.r); ctx.globalAlpha = 0.9; ctx.fillStyle = tipo(g.tipo).cor; ctx.fillText(`${tipo(g.tipo).nome} · ${g.n}`, p.x, p.y - 10); }
  }
  ctx.globalAlpha = 1;
  if (V.caixa) {
    const { x0, y0, x1, y1 } = V.caixa;
    ctx.fillStyle = C.accent; ctx.globalAlpha = 0.12; ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.globalAlpha = 0.8; ctx.strokeStyle = C.accent; ctx.lineWidth = 1; ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.globalAlpha = 1;
  }
  desenharMini();
  posicionarAcoes();
}

// ---------- minimapa ----------
function desenharMini() {
  const cv = R.mini;
  if (!cv) return;
  const vis = vista();
  cv.parentElement.hidden = !V.mini || vis.size < 30;
  if (cv.parentElement.hidden) return;
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of vis) { const n = G.nos.get(id); x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
  const pad = 80; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const s = Math.min(w / (x1 - x0), h / (y1 - y0)), ox = (w - (x1 - x0) * s) / 2, oy = (h - (y1 - y0) * s) / 2;
  V.miniMapa = { x0, y0, s, ox, oy };
  ctx.globalAlpha = 0.35; ctx.strokeStyle = V.cores.line; ctx.lineWidth = 0.6; ctx.beginPath();
  for (const l of G.lig.values()) { if (!vis.has(l.de) || !vis.has(l.para)) continue; const a = G.nos.get(l.de), b = G.nos.get(l.para); ctx.moveTo(ox + (a.x - x0) * s, oy + (a.y - y0) * s); ctx.lineTo(ox + (b.x - x0) * s, oy + (b.y - y0) * s); }
  ctx.stroke(); ctx.globalAlpha = 1;
  for (const id of vis) { const n = G.nos.get(id); ctx.fillStyle = V.sel.has(id) ? V.cores.accent : tipo(n.tipo).cor; ctx.fillRect(ox + (n.x - x0) * s - 1.5, oy + (n.y - y0) * s - 1.5, 3, 3); }
  const cw = R.canvas.clientWidth, ch = R.canvas.clientHeight;
  const vx = ox + (V.cam.x - cw / 2 / V.cam.z - x0) * s, vy = oy + (V.cam.y - ch / 2 / V.cam.z - y0) * s;
  ctx.strokeStyle = V.cores.accent; ctx.lineWidth = 1.5; ctx.strokeRect(vx, vy, (cw / V.cam.z) * s, (ch / V.cam.z) * s);
  ctx.fillStyle = V.cores.accent; ctx.globalAlpha = 0.08; ctx.fillRect(vx, vy, (cw / V.cam.z) * s, (ch / V.cam.z) * s); ctx.globalAlpha = 1;
}
function ligarMini(cv) {
  let arrastando = false;
  const ir = (e) => { const m = V.miniMapa; if (!m) return; const r = cv.getBoundingClientRect(); V.cam.x = (e.clientX - r.left - m.ox) / m.s + m.x0; V.cam.y = (e.clientY - r.top - m.oy) / m.s + m.y0; V.camAnim = null; desenhar(); };
  cv.addEventListener('pointerdown', (e) => { arrastando = true; cv.setPointerCapture(e.pointerId); ir(e); });
  cv.addEventListener('pointermove', (e) => { if (arrastando) ir(e); });
  cv.addEventListener('pointerup', () => { arrastando = false; });
}

// ---------- barra de ações sobre a entidade escolhida ----------
function posicionarAcoes() {
  const el = R.acoes;
  if (!el) return;
  const n = V.sel.size === 1 ? G.nos.get([...V.sel][0]) : null;
  if (!n || !visivel(n) || V.arrastando || V.caixa || V.trans) { el.hidden = true; return; }
  if (el.dataset.de !== n.id + '|' + n.feitas.length + '|' + !!n.recolher + '|' + (V.escondidos.get(n.id) || 0)) montarAcoes(n);
  const p = paraTela(n.x, n.y - raio(n));
  el.hidden = false;
  const w = el.offsetWidth, H = R.palco.clientHeight, W = R.palco.clientWidth;
  el.style.left = Math.max(6, Math.min(W - w - 6, p.x - w / 2)) + 'px';
  el.style.top = Math.max(6, Math.min(H - 44, p.y - 46)) + 'px';
}
function montarAcoes(n) {
  const el = R.acoes;
  el.dataset.de = n.id + '|' + n.feitas.length + '|' + !!n.recolher + '|' + (V.escondidos.get(n.id) || 0);
  const maqs = CAT.maquinas.filter((m) => m.de === n.tipo);
  const folhas = folhasRecolhiveis(n);
  el.innerHTML = `<button data-ac="rapidas" title="Rodar as rápidas (Enter)">${IC.raio}<span>Rápidas</span></button>
    <button data-ac="transformar" title="Escolher uma transformação">${IC.maquina}<span>Transformar</span></button>
    ${maqs.length ? `<button data-ac="maquina" title="Rodar uma máquina">${IC.engrenagem}</button>` : ''}
    <i></i>
    <button data-ac="foco" title="Mostrar só a vizinhança (.)">${IC.foco}</button>
    ${n.recolher || folhas >= 2 ? `<button data-ac="recolher" title="${n.recolher ? 'Abrir os resultados recolhidos' : `Recolher os ${folhas} resultados soltos (C)`}">${n.recolher ? IC.expandir : IC.recolher}</button>` : ''}
    ${linkDe(n) ? `<button data-ac="abrir" title="Abrir no navegador">${IC.fora}</button>` : ''}
    <button data-ac="remover" title="Remover (Del)">${IC.lixo}</button>`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-ac]');
    if (!b) return;
    const r = b.getBoundingClientRect(), ev = { preventDefault() {}, stopPropagation() {}, clientX: r.left, clientY: r.bottom + 4 };
    const ac = b.dataset.ac;
    if (ac === 'rapidas') rapidas([n]);
    if (ac === 'transformar') bs.showMenu(ev, itensTransformacoes([n]), `Transformar ${curto(rotuloDe(n), 36)}`);
    if (ac === 'maquina') bs.showMenu(ev, maqs.map((m) => ({ label: m.nome, icon: IC.engrenagem, action: () => rodarMaquina(m, n) })), 'Máquinas');
    if (ac === 'foco') focar(n, 2);
    if (ac === 'recolher') recolher(n, !n.recolher);
    if (ac === 'abrir') abrirLink(linkDe(n));
    if (ac === 'remover') remover([n.id]);
  };
}

// ---------- câmera ----------
const paraMundo = (sx, sy) => { const w = R.canvas.clientWidth, h = R.canvas.clientHeight; return { x: (sx - w / 2) / V.cam.z + V.cam.x, y: (sy - h / 2) / V.cam.z + V.cam.y }; };
const centroVisivel = () => ({ x: V.cam.x, y: V.cam.y });
function ajustarEm(pontos, instantaneo) {
  if (!pontos.length || !R.canvas) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pontos) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const w = R.canvas.clientWidth || 800, h = R.canvas.clientHeight || 600;
  moverCamera({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: Math.max(0.12, Math.min(1.5, Math.min((w - 140) / (x1 - x0 + 1), (h - 140) / (y1 - y0 + 1)))) }, instantaneo ? 0 : 450);
}
function ajustar(instantaneo) {
  const nos = [...vista()].map((id) => G.nos.get(id));
  if (!nos.length) { moverCamera({ x: 0, y: 0, z: 1 }, 0); return; }
  ajustarEm(nos, instantaneo);
}
function centrar(n) { moverCamera({ x: n.x, y: n.y, z: Math.max(V.cam.z, 1) }); }
function zoom(f, sx, sy) {
  const w = R.canvas.clientWidth, h = R.canvas.clientHeight;
  if (sx == null) { sx = w / 2; sy = h / 2; }
  V.camAnim = null;
  const antes = paraMundo(sx, sy);
  V.cam.z = Math.max(0.06, Math.min(4, V.cam.z * f));
  const depois = paraMundo(sx, sy);
  V.cam.x += antes.x - depois.x; V.cam.y += antes.y - depois.y;
  desenhar();
}
function noEm(sx, sy) {
  const p = paraMundo(sx, sy);
  let melhor = null, dm = Infinity;
  for (const id of vista()) { const n = G.nos.get(id), d = Math.hypot(n.x - p.x, n.y - p.y); if (d <= raio(n) + 5 / V.cam.z && d < dm) { melhor = n; dm = d; } }
  return melhor;
}
function badgeEm(sx, sy) {
  const p = paraMundo(sx, sy);
  return (V.badges || []).find((b) => Math.hypot(b.x - p.x, b.y - p.y) <= b.r + 2 / V.cam.z) || null;
}
function ligacaoEm(sx, sy) {
  if (G.lig.size > 4000) return null;
  const p = paraMundo(sx, sy), tol = 6 / V.cam.z, vis = vista();
  let melhor = null, dm = tol;
  for (const l of G.lig.values()) {
    if (!vis.has(l.de) || !vis.has(l.para)) continue;
    const a = G.nos.get(l.de), b = G.nos.get(l.para), pc = pontoControle(a, b, l);
    // a curva vira dois segmentos passando pelo ponto de controle (perto o bastante para acertar com o mouse)
    const segs = pc ? [[a, { x: (a.x + 2 * pc.x + b.x) / 4, y: (a.y + 2 * pc.y + b.y) / 4 }], [{ x: (a.x + 2 * pc.x + b.x) / 4, y: (a.y + 2 * pc.y + b.y) / 4 }, b]] : [[a, b]];
    for (const [s, e] of segs) {
      const dx = e.x - s.x, dy = e.y - s.y, t = Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(p.x - (s.x + t * dx), p.y - (s.y + t * dy));
      if (d < dm) { dm = d; melhor = l; }
    }
  }
  return melhor;
}
function selecionar(ids, somar, manterAba) {
  if (!somar) V.sel.clear();
  if (ids.length && !manterAba && V.aba !== 'detalhes') V.aba = 'detalhes';
  for (const id of ids) V.sel.add(id);
  V.caminho = null;
  pintarDetalhes(); desenhar();
}

// ---------- mouse, teclado, colar e soltar no grafo ----------
function ligarCanvas(cv) {
  let ini = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    cv.focus(); cv.setPointerCapture(e.pointerId);
    const p = pos(e);
    if (V.ligando) { const alvo = noEm(p.x, p.y); if (alvo) terminarLigacao(alvo); else pararLigacao(); return; }
    const b = badgeEm(p.x, p.y);
    if (b) { const n = G.nos.get(b.id); if (n) recolher(n, false); return; }
    const n = noEm(p.x, p.y);
    if (n && e.altKey) { selecionar([n.id]); comecarLigacao(n, true); V.mouse = paraMundo(p.x, p.y); return; }
    ini = { ...p, n, moveu: false, cam: { ...V.cam }, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
    V.camAnim = null;
    if (n) {
      if (ini.ctrl || ini.shift) { if (V.sel.has(n.id)) V.sel.delete(n.id); else V.sel.add(n.id); pintarDetalhes(); desenhar(); }
      else if (!V.sel.has(n.id)) selecionar([n.id]);
      ini.grupo = [...V.sel].map((id) => G.nos.get(id)).filter(Boolean).map((x) => ({ x, ox: x.x, oy: x.y }));
    } else if (ini.shift) V.caixa = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  });
  cv.addEventListener('pointermove', (e) => {
    const p = pos(e);
    if (V.ligando) { V.mouse = paraMundo(p.x, p.y); const n = noEm(p.x, p.y); V.hover = n ? n.id : null; desenhar(); return; }
    if (!ini) {
      const n = noEm(p.x, p.y), l = n ? null : ligacaoEm(p.x, p.y), bdg = !n && badgeEm(p.x, p.y);
      const id = n ? n.id : null, lid = l ? l.id : null;
      cv.style.cursor = n || bdg ? 'pointer' : l ? 'help' : 'grab';
      if (id !== V.hover || lid !== V.hoverLig) { V.hover = id; V.hoverLig = lid; desenhar(); }
      dica(n || l, e);
      return;
    }
    if (!ini.moveu && Math.hypot(p.x - ini.x, p.y - ini.y) < 3) return;
    ini.moveu = true; dica(null);
    if (ini.n) {
      if (!ini.lembrou) { lembrar(); ini.lembrou = true; }
      const dx = (p.x - ini.x) / V.cam.z, dy = (p.y - ini.y) / V.cam.z;
      for (const g of ini.grupo) { g.x.x = g.ox + dx; g.x.y = g.oy + dy; if (V.layout === 'forcas') g.x.fixo = true; }
      V.arrastando = ini.n;
      if (V.layout === 'forcas') { V.alpha = Math.max(V.alpha, 0.15); }
      animar();
    } else if (V.caixa) { V.caixa.x1 = p.x; V.caixa.y1 = p.y; desenhar(); }
    else { cv.style.cursor = 'grabbing'; V.cam.x = ini.cam.x - (p.x - ini.x) / V.cam.z; V.cam.y = ini.cam.y - (p.y - ini.y) / V.cam.z; desenhar(); }
  });
  const soltar = (e) => {
    // Alt + arrastar: soltar em cima de outra entidade liga as duas
    if (V.ligando && V.ligando.arrasto && e && e.type === 'pointerup') { const p = pos(e), alvo = noEm(p.x, p.y); if (alvo && alvo.id !== V.ligando.de) terminarLigacao(alvo); else if (!alvo) pararLigacao(); else V.ligando.arrasto = false; return; }
    if (!ini) return;
    if (V.caixa) {
      const a = paraMundo(Math.min(V.caixa.x0, V.caixa.x1), Math.min(V.caixa.y0, V.caixa.y1)), b = paraMundo(Math.max(V.caixa.x0, V.caixa.x1), Math.max(V.caixa.y0, V.caixa.y1));
      const ids = [...vista()].filter((id) => { const n = G.nos.get(id); return n.x >= a.x && n.x <= b.x && n.y >= a.y && n.y <= b.y; });
      V.caixa = null; selecionar(ids, true);
    } else if (!ini.moveu && !ini.n && !ini.shift) {
      // clique numa ligação seleciona as duas pontas
      const l = ligacaoEm(ini.x, ini.y);
      selecionar(l ? [l.de, l.para] : []);
    }
    if (ini.n && ini.moveu) agendarSalvar();
    V.arrastando = null; ini = null; cv.style.cursor = 'grab';
    desenhar();
  };
  cv.addEventListener('pointerup', soltar);
  cv.addEventListener('pointercancel', soltar);
  cv.addEventListener('pointerleave', () => { if (!ini && (V.hover || V.hoverLig)) { V.hover = null; V.hoverLig = null; desenhar(); } dica(null); });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const p = pos(e); zoom(Math.exp(-e.deltaY * 0.0015), p.x, p.y); }, { passive: false });
  cv.addEventListener('dblclick', (e) => {
    const p = pos(e), n = noEm(p.x, p.y);
    if (n) rapidas(V.sel.size > 1 && V.sel.has(n.id) ? selecionadas() : [n]);
    else dlgAdicionar(paraMundo(p.x, p.y));
  });
  cv.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const p = pos(e), n = noEm(p.x, p.y);
    if (V.ligando) return pararLigacao();
    if (n) { if (!V.sel.has(n.id)) selecionar([n.id]); menuEntidades(e); return; }
    const l = ligacaoEm(p.x, p.y);
    if (l) menuLigacao(e, l); else menuFundo(e, paraMundo(p.x, p.y));
  });
  cv.addEventListener('keydown', (e) => {
    const k = (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.shiftKey && e.key.length > 1 ? 'Shift+' : '') + e.key;
    const sel = selecionadas(), um = sel.length === 1 ? sel[0] : null;
    const acoes = {
      Delete: () => remover([...V.sel]), Backspace: () => remover([...V.sel]),
      'Ctrl+a': () => selecionar([...vista()]),
      'Ctrl+z': desfazer, 'Ctrl+y': refazer, 'Ctrl+Z': refazer,
      'Ctrl+c': () => sel.length && bs.copyText(sel.map((n) => n.valor).join('\n')),
      f: () => ajustar(), F: () => ajustar(),
      Escape: () => { if (V.ligando) return pararLigacao(); if (V.foco) return focar(null); V.busca = ''; if (R.busca) R.busca.value = ''; selecionar([]); },
      Enter: () => sel.length && rapidas(sel), '+': () => zoom(1.25), '=': () => zoom(1.25), '-': () => zoom(0.8),
      1: () => aplicarLayout('forcas'), 2: () => aplicarLayout('hierarquico'), 3: () => aplicarLayout('radial'), 4: () => aplicarLayout('tipos'), 5: () => aplicarLayout('circulo'),
      '.': () => um && focar(um, (V.foco && V.foco.id === um.id ? V.foco.saltos : 1) + (V.foco && V.foco.id === um.id ? 1 : 1)),
      c: () => um && (um.recolher || folhasRecolhiveis(um) >= 2) && recolher(um, !um.recolher),
      m: () => { V.mini = !V.mini; plugin.data.set('mini', V.mini).catch(() => {}); desenhar(); },
      t: () => alternarTempo(), p: () => alternarPainel(), '?': () => dlgAtalhos(),
      l: () => (um ? comecarLigacao(um) : sel.length === 2 ? ligarDuas(sel) : toast('Escolha a entidade de onde sai a ligação')),
      n: () => dlgAdicionar(null, um ? um.id : null),
      ArrowLeft: () => andar(-1, 0), ArrowRight: () => andar(1, 0), ArrowUp: () => andar(0, -1), ArrowDown: () => andar(0, 1),
    };
    const fn = acoes[k];
    if (fn) { e.preventDefault(); e.stopPropagation(); fn(); }
  });
}
// setas: anda para a entidade vizinha mais próxima naquela direção
function andar(dx, dy) {
  const atual = selecionadas()[0];
  if (!atual) { const p = [...vista()][0]; if (p) { selecionar([p]); centrar(G.nos.get(p)); } return; }
  let melhor = null, nota = Infinity;
  for (const id of vista()) {
    const n = G.nos.get(id); if (n === atual) continue;
    const vx = n.x - atual.x, vy = n.y - atual.y, d = Math.hypot(vx, vy) || 1, cos = (vx * dx + vy * dy) / d;
    if (cos < 0.5) continue;
    const s = d * (2 - cos) * (vizinhos(atual.id).has(id) ? 0.6 : 1);
    if (s < nota) { nota = s; melhor = n; }
  }
  if (melhor) { selecionar([melhor.id]); if (Math.abs(paraTela(melhor.x, melhor.y).x - R.canvas.clientWidth / 2) > R.canvas.clientWidth * 0.35 || Math.abs(paraTela(melhor.x, melhor.y).y - R.canvas.clientHeight / 2) > R.canvas.clientHeight * 0.35) centrar(melhor); }
}
function dica(alvo, e) {
  if (!R.dica) return;
  if (!alvo) { R.dica.hidden = true; return; }
  if (alvo.de) {
    const a = G.nos.get(alvo.de), b = G.nos.get(alvo.para);
    R.dica.innerHTML = `<b>Ligação</b><div class="btg-dica-v">${esc(curto(rotuloDe(a), 40))}</div><div class="btg-dica-l">→ ${esc(alvo.rotulo || 'ligado a')}</div><div class="btg-dica-v">${esc(curto(rotuloDe(b), 40))}</div>${alvo.t && transf(alvo.t) ? `<div><span>por</span> ${esc(transf(alvo.t).nome)}</div>` : ''}`;
  } else {
    const n = alvo;
    const props = Object.entries(n.props || {}).filter(([k, v]) => v !== '' && k !== 'completo' && String(v).length < 90).slice(0, 5);
    const escondidos = V.escondidos.get(n.id);
    R.dica.innerHTML = `<b>${esc(tipo(n.tipo).nome)}</b><div class="btg-dica-v">${esc(n.valor)}</div>${props.map(([k, v]) => `<div><span>${esc(k)}</span> ${esc(String(v))}</div>`).join('')}${escondidos ? `<div class="btg-dica-l">+${escondidos} resultados recolhidos: clique no número</div>` : ''}<div class="btg-dica-k">${grau(n.id)} ligações · duplo clique roda as rápidas</div>`;
  }
  const r = R.palco.getBoundingClientRect();
  R.dica.hidden = false;
  R.dica.style.left = Math.min(e.clientX - r.left + 16, r.width - R.dica.offsetWidth - 8) + 'px';
  R.dica.style.top = Math.min(e.clientY - r.top + 16, r.height - R.dica.offsetHeight - 8) + 'px';
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
  if (um) itens.push({ label: 'Ligar a outra entidade…', icon: IC.ligar, k: 'L', action: () => comecarLigacao(um) });
  if (sel.length === 2) itens.push({ label: 'Ligar as duas…', icon: IC.ligar, k: 'L', action: () => ligarDuas(sel) });
  if (um) itens.push({ label: 'Nova entidade ligada a esta…', icon: IC.mais, k: 'N', action: () => dlgAdicionar(null, um.id) });
  if (um) itens.push({ label: 'Mostrar só a vizinhança', icon: IC.foco, k: '.', action: () => focar(um, 2) });
  if (um && (um.recolher || folhasRecolhiveis(um) >= 2)) itens.push({ label: um.recolher ? 'Abrir os resultados recolhidos' : `Recolher os resultados soltos (${folhasRecolhiveis(um)})`, icon: um.recolher ? IC.expandir : IC.recolher, k: 'C', action: () => recolher(um, !um.recolher) });
  if (sel.length > 1) itens.push({ label: 'Perguntar à IA sobre a seleção', icon: IC.pensar, action: () => { V.ia = { ...(V.ia || {}), soSel: true }; trocarAba('analise'); } });
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
    { label: 'Organizar', icon: IC.organizar, sub: LAYOUTS.map(([id, nome], i) => ({ label: nome, k: String(i + 1), icon: V.layout === id ? IC.ok : IC.organizar, action: () => aplicarLayout(id) })) },
    { label: 'Ajustar à tela', icon: IC.ajustar, k: 'F', action: () => ajustar() },
    { label: 'Analisar o grafo', icon: IC.pensar, action: () => trocarAba('analise') },
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
function ligarDuas([a, b]) {
  V.ligando = { de: a.id };
  terminarLigacao(b);
}
function dlgAdicionar(onde, ligarA) {
  const pai = ligarA ? G.nos.get(ligarA) : null;
  return dialogo(`<h3>${pai ? 'Nova entidade ligada' : 'Adicionar entidade'}</h3>
    ${pai ? `<p class="btg-dlg-dica">Vai se ligar a <b>${esc(curto(rotuloDe(pai), 50))}</b>.</p>` : ''}
    <label class="btg-campo"><span>Valor</span><input data-v placeholder="exemplo.com.br, 8.8.8.8, ana@empresa.com, @usuario…" spellcheck="false"></label>
    <label class="btg-campo"><span>Tipo</span><select data-t>${opcoesTipo('')}</select></label>
    ${pai ? '<label class="btg-campo"><span>Como se liga</span><input data-r placeholder="relacionado a" spellcheck="false"></label>' : ''}
    <div class="btg-dlg-dica" data-dica></div>
    <div class="btg-dlg-b"><button class="chip" data-cancelar>Cancelar</button><button class="chip primary" data-ok>Adicionar</button></div>`, (el, fechar) => {
    const v = el.querySelector('[data-v]'), t = el.querySelector('[data-t]'), d = el.querySelector('[data-dica]');
    let tm;
    v.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => { if (!v.value.trim() || t.value) { d.textContent = ''; return; } try { const r = await chamar('entidade', { valor: v.value }); d.textContent = `Vai entrar como ${tipo(r.tipo).nome}: ${r.valor}`; } catch { d.textContent = ''; } }, 200); };
    const ok = async () => {
      if (!v.value.trim()) return v.focus();
      try {
        const n = await adicionarValor(v.value, t.value, pai || null);
        if (onde && n) { n.x = onde.x; n.y = onde.y; desenhar(); }
        if (pai && n && n !== pai) { ligar(pai.id, n.id, (el.querySelector('[data-r]').value || '').trim() || 'relacionado a', 'manual'); mudou(); }
        fechar(true);
      } catch (e) { d.textContent = e.message; }
    };
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
// o grafo visível em SVG: abre em qualquer navegador, editor de imagens ou documento, e não perde nitidez
function svg() {
  const vis = [...vista()].map((id) => G.nos.get(id));
  if (!vis.length) return '<svg xmlns="http://www.w3.org/2000/svg"/>';
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of vis) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
  const m = 90, C = V.cores || {}, dentro = new Set(vis.map((n) => n.id));
  const linhas = [...G.lig.values()].filter((l) => dentro.has(l.de) && dentro.has(l.para)).map((l) => { const a = G.nos.get(l.de), b = G.nos.get(l.para); return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${C.line || '#888'}" stroke-width="1.3"${l.t === 'manual' ? ' stroke-dasharray="6 4"' : ''}><title>${xml(l.rotulo)}</title></line>`; });
  const nos = vis.map((n) => { const r = raio(n), cor = tipo(n.tipo).cor; return `<g transform="translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})"><title>${xml(tipo(n.tipo).nome + ': ' + n.valor)}</title><circle r="${r.toFixed(1)}" fill="${C.panel || '#fff'}" stroke="${n.cor || cor}" stroke-width="2"/><path d="${xml(tipo(n.tipo).icone)}" transform="translate(${(-12 * r / 12).toFixed(1)} ${(-12 * r / 12).toFixed(1)}) scale(${(r / 12).toFixed(3)})" fill="none" stroke="${cor}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>${n.alerta ? `<circle cx="${(r * 0.72).toFixed(1)}" cy="${(-r * 0.72).toFixed(1)}" r="5" fill="#e5534b"/>` : ''}<text y="${(r + 16).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="${C.fg || '#222'}">${xml(curto(rotuloCurto(n), 34))}</text></g>`; });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(x0 - m).toFixed(0)} ${(y0 - m).toFixed(0)} ${(x1 - x0 + 2 * m).toFixed(0)} ${(y1 - y0 + 2 * m).toFixed(0)}"><rect x="${(x0 - m).toFixed(0)}" y="${(y0 - m).toFixed(0)}" width="100%" height="100%" fill="${C.bg || '#fff'}"/>${linhas.join('')}${nos.join('')}</svg>`;
}
async function exportar(fmt) {
  await salvar();
  const base = `exportacoes/${slug(G.inv.nome)}-${new Date().toISOString().slice(0, 10)}`;
  let arq, conteudo;
  if (fmt === 'json') { arq = base + '.bluetego.json'; conteudo = JSON.stringify({ ...G.inv, nos: [...G.nos.values()].map(({ vx, vy, fx, fy, _g, ...n }) => n) }, null, 2); }
  if (fmt === 'md') { arq = base + '.md'; conteudo = relatorio(); }
  if (fmt === 'graphml') { arq = base + '.graphml'; conteudo = graphml(); }
  if (fmt === 'svg') { arq = base + '.svg'; conteudo = svg(); }
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
    { label: 'Desenho do grafo (SVG, sem perder nitidez)', icon: IC.exportar, action: () => exportar('svg') },
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
    if (f) importarTexto(await f.text(), f.name);
  };
  inp.click();
}
function importarTexto(texto, nome) {
  let j = null;
  try { j = JSON.parse(texto); } catch {}
  if (j && Array.isArray(j.nos) && Array.isArray(j.ligacoes)) {
    lembrar();
    let n = 0;
    for (const x of j.nos) if (!G.nos.has(x.id)) { G.nos.set(x.id, { props: {}, feitas: [], ...x, _nasceu: performance.now() }); n++; }
    for (const l of j.ligacoes) if (G.nos.has(l.de) && G.nos.has(l.para) && !G.lig.has(l.id)) G.lig.set(l.id, l);
    V.popAte = performance.now() + 450; sujar();
    historico(`Importado de ${nome}: ${n} entidades novas`);
    toast(`${n} entidades novas de ${nome}`, 'ok'); mudou(); setTimeout(() => ajustar(), 600);
  } else dlgColar(String(texto).slice(0, 500000), nome);
}

// ---------- tela ----------
function montar(el) {
  el.classList.add('btg-pg');
  el.innerHTML = `
    <div class="btg-barra">
      <input class="btg-nome" data-nome spellcheck="false" title="Nome da investigação">
      <label class="btg-investigar" title="Escreva um domínio, IP, e-mail, @apelido, CNPJ, CVE... e Enter: entra no grafo e as transformações rápidas já rodam. Vários de uma vez também (separe por espaço ou vírgula).">${IC.raio}<input data-rapido placeholder="Investigar: domínio, IP, e-mail, @apelido, CNPJ…" spellcheck="false"><kbd>Enter</kbd></label>
      <button class="icon-btn" data-a="adicionar" title="Adicionar escolhendo o tipo (N: nova ligada à escolhida)">${IC.mais}</button>
      <button class="chip" data-a="colar" title="Colar um texto e extrair as entidades (ou Ctrl+V direto no grafo)">${IC.colar}<span>Colar</span></button>
      <button class="chip" data-a="maquinas" title="Roteiros de transformações">${IC.engrenagem}<span>Máquinas</span></button>
      <span class="btg-sep"></span>
      <button class="chip" data-a="layout" title="Como organizar o grafo (teclas 1 a 5)">${IC.organizar}<span data-layout-nome>Forças</span>${IC.seta}</button>
      <button class="icon-btn" data-a="desfazer" title="Desfazer (Ctrl+Z)">${IC.desfazer}</button>
      <button class="icon-btn" data-a="tempo" title="Linha do tempo (T)">${IC.tempo}</button>
      <button class="icon-btn" data-a="exportar" title="Exportar e importar">${IC.exportar}</button>
      <button class="icon-btn" data-a="atalhos" title="Atalhos do teclado (?)">${IC.teclado}</button>
      <label class="btg-busca">${IC.busca}<input data-busca placeholder="Procurar no grafo" spellcheck="false"></label>
      <button class="icon-btn" data-a="painel" title="Mostrar ou esconder o painel (P)">${IC.painel}</button>
    </div>
    <div class="btg-corpo">
      <div class="btg-palco" data-palco>
        <canvas tabindex="0" data-cv></canvas>
        <div class="btg-vazio" data-vazio hidden></div>
        <div class="btg-foco" data-foco hidden></div>
        <div class="btg-fila" data-fila hidden></div>
        <div class="btg-ligando" data-ligando hidden></div>
        <div class="btg-flutua" data-acoes hidden></div>
        <div class="btg-dica" data-dica hidden></div>
        <div class="btg-zoom"><button data-z="mais" title="Aproximar (+)">${IC.mais}</button><button data-z="menos" title="Afastar (−)">${IC.menos}</button><button data-z="ajustar" title="Ajustar à tela (F)">${IC.ajustar}</button><button data-z="mini" title="Minimapa (M)">${IC.mapa}</button></div>
        <div class="btg-mini" hidden><canvas data-mini></canvas></div>
        <div class="btg-tempo" data-tempo hidden></div>
        <div class="btg-legenda" data-legenda></div>
        <div class="btg-soltar" data-soltar hidden><div>${IC.importar}<b>Solte para extrair as entidades</b><span>log, e-mail, relatório, lista, JSON do Bluetego</span></div></div>
      </div>
      <aside class="btg-det" data-det>
        <div class="btg-abas"><button data-aba="detalhes">Detalhes</button><button data-aba="analise">${IC.pensar}Análise<span class="btg-npistas" data-npistas hidden></span></button></div>
        <div class="btg-det-c" data-detc></div>
      </aside>
    </div>
    <div class="btg-dlg" data-dlg hidden></div>`;
  const q = (s) => el.querySelector(s);
  Object.assign(R, {
    pg: el, canvas: q('[data-cv]'), palco: q('[data-palco]'), vazio: q('[data-vazio]'), fila: q('[data-fila]'), dica: q('[data-dica]'), det: q('[data-det]'), detc: q('[data-detc]'),
    dlg: q('[data-dlg]'), nome: q('[data-nome]'), busca: q('[data-busca]'), legenda: q('[data-legenda]'), acoes: q('[data-acoes]'), mini: q('[data-mini]'), foco: q('[data-foco]'),
    tempo: q('[data-tempo]'), ligando: q('[data-ligando]'), soltar: q('[data-soltar]'), rapido: q('[data-rapido]'), npistas: q('[data-npistas]'), layoutNome: q('[data-layout-nome]'),
  });
  ligarCanvas(R.canvas);
  ligarMini(R.mini);
  const ev = (b) => { const r = b.getBoundingClientRect(); return { preventDefault() {}, stopPropagation() {}, clientX: r.left, clientY: r.bottom + 4 }; };
  el.querySelector('.btg-barra').onclick = (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'adicionar') dlgAdicionar();
    if (a === 'colar') dlgColar();
    if (a === 'desfazer') desfazer();
    if (a === 'tempo') alternarTempo();
    if (a === 'atalhos') dlgAtalhos();
    if (a === 'painel') alternarPainel();
    if (a === 'layout') menuLayout(ev(b));
    if (a === 'exportar') menuExportar(ev(b));
    if (a === 'maquinas') menuMaquinas(ev(b));
  };
  el.querySelector('.btg-zoom').onclick = (e) => {
    const b = e.target.closest('[data-z]');
    if (!b) return;
    if (b.dataset.z === 'mais') zoom(1.3);
    if (b.dataset.z === 'menos') zoom(1 / 1.3);
    if (b.dataset.z === 'ajustar') ajustar();
    if (b.dataset.z === 'mini') { V.mini = !V.mini; plugin.data.set('mini', V.mini).catch(() => {}); desenhar(); }
  };
  el.querySelector('.btg-abas').onclick = (e) => { const b = e.target.closest('[data-aba]'); if (b) trocarAba(b.dataset.aba); };
  R.nome.onchange = () => { const v = R.nome.value.trim(); if (v && G.inv) { G.inv.nome = v; agendarSalvar(); } else if (G.inv) R.nome.value = G.inv.nome; };
  R.nome.onkeydown = (e) => { if (e.key === 'Enter') R.nome.blur(); };
  R.rapido.onkeydown = (e) => { if (e.key === 'Enter') { const v = R.rapido.value; R.rapido.value = ''; investigarRapido(v); } if (e.key === 'Escape') { R.rapido.value = ''; R.canvas.focus(); } };
  R.busca.oninput = () => { V.busca = R.busca.value.trim(); desenhar(); };
  R.busca.onkeydown = (e) => {
    if (e.key === 'Enter') { const ach = [...vista()].map((id) => G.nos.get(id)).filter(casa); if (ach.length) { selecionar(ach.map((n) => n.id)); if (ach.length === 1) centrar(ach[0]); else ajustarEm(ach); } }
    if (e.key === 'Escape') { R.busca.value = ''; V.busca = ''; desenhar(); R.canvas.focus(); }
  };
  // colar no grafo: um valor entra e já é investigado; um texto maior abre a extração
  el.addEventListener('paste', (e) => {
    if (e.target.closest('input, textarea, [contenteditable]')) return;
    const t = (e.clipboardData && e.clipboardData.getData('text')) || '';
    if (!t.trim()) return;
    e.preventDefault();
    investigarRapido(t, 'área de transferência');
  });
  // soltar arquivo ou texto no grafo
  let dentro = 0;
  R.palco.addEventListener('dragenter', (e) => { e.preventDefault(); dentro++; R.soltar.hidden = false; });
  R.palco.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  R.palco.addEventListener('dragleave', () => { if (--dentro <= 0) { dentro = 0; R.soltar.hidden = true; } });
  R.palco.addEventListener('drop', async (e) => {
    e.preventDefault(); dentro = 0; R.soltar.hidden = true;
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) return importarTexto(await f.text(), f.name);
    const t = e.dataTransfer.getData('text');
    if (t) investigarRapido(t, 'texto solto');
  });
  const ro = new ResizeObserver(() => desenhar());
  ro.observe(R.palco);
  const mo = new MutationObserver(() => { V.cores = null; icones.clear(); desenhar(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  plugin.onUnload(() => { ro.disconnect(); mo.disconnect(); clearInterval(V.tocando); });
  iniciar();
}
// o campo Investigar: um valor entra e roda as rápidas; vários viram entidades de uma vez
async function investigarRapido(texto, origem) {
  const t = String(texto || '').trim();
  if (!t) return;
  try {
    if (!/[\s,;]/.test(t) && t.length < 300) { const n = await adicionarValor(t); if (n && !n.feitas.length) rapidas([n]); return; }
    const lista = (await chamar('extrair', { texto: t })).entidades;
    if (!lista.length) { if (t.length < 300) { const n = await adicionarValor(t); if (n) rapidas([n]); } else toast('Nenhuma entidade reconhecida no texto'); return; }
    if (lista.length > 12 || origem) return dlgColar(t, origem);
    adicionarVarias(lista);
    historico(`Investigar: ${lista.length} entidades`);
    rapidas(lista.map((e) => G.nos.get(e.id)).filter(Boolean));
    setTimeout(() => ajustar(), 700);
  } catch (e) { toast(e.message, 'err'); }
}

// ---------- ligar à mão ----------
function comecarLigacao(n, arrasto) {
  V.ligando = { de: n.id, arrasto: !!arrasto };
  R.ligando.hidden = false;
  R.ligando.innerHTML = `${IC.ligar}<span>Clique na entidade que se liga a <b>${esc(curto(rotuloDe(n), 40))}</b></span><kbd>Esc</kbd>`;
  R.canvas.style.cursor = 'crosshair';
  R.canvas.focus();
  desenhar();
}
function pararLigacao() { V.ligando = null; if (R.ligando) R.ligando.hidden = true; if (R.canvas) R.canvas.style.cursor = 'grab'; desenhar(); }
async function terminarLigacao(alvo) {
  const de = V.ligando && G.nos.get(V.ligando.de);
  pararLigacao();
  if (!de || !alvo || de === alvo) return;
  const r = await dlgRotulo(de, alvo);
  if (!r) return;
  const [a, b] = r.inverter ? [alvo, de] : [de, alvo];
  lembrar();
  ligar(a.id, b.id, r.rotulo, 'manual');
  historico(`Ligação feita à mão: ${curto(rotuloDe(a), 30)} → ${r.rotulo} → ${curto(rotuloDe(b), 30)}`);
  selecionar([a.id, b.id]);
  mudou();
}
// rótulos que costumam servir, conforme os tipos das duas pontas
function sugestoesRotulo(a, b) {
  const t = a.tipo + '>' + b.tipo, s = [];
  if (/pessoa>(organizacao|cnpj)/.test(t)) s.push('trabalha em', 'sócia de', 'dona de');
  if (/pessoa>(email|telefone|conta|apelido)/.test(t)) s.push('usa', 'é dona de');
  if (/pessoa>pessoa/.test(t)) s.push('conhece', 'parente de', 'mesma pessoa que');
  if (/(dominio|url)>(ip|organizacao|asn)/.test(t)) s.push('hospedado em');
  if (/(organizacao|cnpj)>(dominio|email|telefone|ip)/.test(t)) s.push('é dona de', 'usa');
  if (a.tipo === b.tipo) s.push('é o mesmo que', 'parecido com');
  return [...new Set([...s, 'relacionado a', 'pertence a', 'usa', 'contato de', 'citado em', 'suspeito de ligação'])].slice(0, 9);
}
function dlgRotulo(a, b, atual) {
  return dialogo(`<h3>${atual ? 'Mudar a ligação' : 'Ligar as entidades'}</h3>
    <div class="btg-ligar-vis"><span class="btg-tag" style="--c:${tipo(a.tipo).cor}">${esc(curto(rotuloDe(a), 34))}</span>${IC.seta2}<span class="btg-tag" style="--c:${tipo(b.tipo).cor}">${esc(curto(rotuloDe(b), 34))}</span></div>
    <label class="btg-campo"><span>Como se ligam</span><input data-r value="${esc(atual || '')}" placeholder="relacionado a" spellcheck="false"></label>
    <div class="btg-sugs">${sugestoesRotulo(a, b).map((s) => `<button class="btg-ex" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <label class="btg-check"><input type="checkbox" data-inv> Inverter a direção</label>
    <div class="btg-dlg-b"><button class="chip" data-cancelar>Cancelar</button><button class="chip primary" data-ok>${atual ? 'Salvar' : 'Ligar'}</button></div>`, (el, fechar) => {
    const r = el.querySelector('[data-r]');
    const ok = () => fechar({ rotulo: r.value.trim() || 'relacionado a', inverter: el.querySelector('[data-inv]').checked });
    el.querySelectorAll('[data-s]').forEach((x) => (x.onclick = () => { r.value = x.dataset.s; r.focus(); }));
    el.querySelector('[data-ok]').onclick = ok;
    r.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
    r.focus(); r.select();
  });
}
function menuLigacao(e, l) {
  const a = G.nos.get(l.de), b = G.nos.get(l.para);
  bs.showMenu(e, [
    { label: 'Mudar o rótulo…', icon: IC.editar, action: async () => { const r = await dlgRotulo(a, b, l.rotulo); if (!r) return; lembrar(); l.rotulo = r.rotulo; if (r.inverter) inverterLigacao(l); mudou(true); } },
    { label: 'Inverter a direção', icon: IC.seta2, action: () => { lembrar(); inverterLigacao(l); mudou(true); } },
    { label: 'Selecionar as duas pontas', icon: IC.vizinhos, action: () => selecionar([l.de, l.para]) },
    '-',
    { label: 'Remover a ligação', icon: IC.lixo, action: () => { lembrar(); G.lig.delete(l.id); historico(`Ligação removida: ${curto(rotuloDe(a), 30)} → ${curto(rotuloDe(b), 30)}`); mudou(); } },
  ], `${curto(rotuloDe(a), 24)} → ${curto(rotuloDe(b), 24)}`);
}
function inverterLigacao(l) {
  G.lig.delete(l.id);
  ligar(l.para, l.de, l.rotulo, l.t || 'manual');
}

// ---------- organização, foco, linha do tempo e painel ----------
function menuLayout(e) {
  const grandes = [...vista()].map((id) => G.nos.get(id)).filter((n) => !n.recolher && folhasRecolhiveis(n) >= 8);
  const recolhidas = [...G.nos.values()].filter((n) => n.recolher);
  bs.showMenu(e, [
    ...LAYOUTS.map(([id, nome, desc], i) => ({ label: `${nome}: ${desc}`, k: String(i + 1), icon: V.layout === id ? IC.ok : IC.organizar, action: () => aplicarLayout(id) })),
    '-',
    { label: 'Organizar de novo', icon: IC.organizar, action: organizar },
    ...(grandes.length ? [{ label: `Recolher os resultados grandes (${grandes.length})`, icon: IC.recolher, action: () => { grandes.forEach((n) => (n.recolher = true)); sujar(); historico(`Recolhidos os resultados de ${grandes.length} entidades`); mudou(); } }] : []),
    ...(recolhidas.length ? [{ label: `Abrir todos os recolhidos (${recolhidas.length})`, icon: IC.expandir, action: () => { recolhidas.forEach((n) => (n.recolher = false)); sujar(); mudou(); } }] : []),
  ], 'Organizar o grafo');
}
function pintarBarraLayout() { if (R.layoutNome) R.layoutNome.textContent = (LAYOUTS.find(([id]) => id === V.layout) || LAYOUTS[0])[1]; }
function pintarFoco() {
  const el = R.foco;
  if (!el) return;
  const n = V.foco && G.nos.get(V.foco.id);
  el.hidden = !n;
  if (!n) return;
  el.innerHTML = `${IC.foco}<span>Só a vizinhança de <b>${esc(curto(rotuloDe(n), 32))}</b></span><button data-f="-" title="Menos saltos">−</button><b>${V.foco.saltos} ${V.foco.saltos === 1 ? 'salto' : 'saltos'}</b><button data-f="+" title="Mais saltos">+</button><button class="btg-foco-sair" data-f="sair" title="Mostrar tudo (Esc)">Mostrar tudo</button>`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    if (b.dataset.f === 'sair') return focar(null);
    focar(n, V.foco.saltos + (b.dataset.f === '+' ? 1 : -1));
  };
}
function alternarTempo() {
  V.tempoAberto = !V.tempoAberto;
  if (!V.tempoAberto) { clearInterval(V.tocando); V.tocando = null; V.ate = null; sujar(); mudou(true); }
  pintarTempo();
}
// linha do tempo: volta a investigação ao ponto escolhido, ou "reproduz" do começo
function pintarTempo() {
  const el = R.tempo;
  if (!el) return;
  el.hidden = !V.tempoAberto;
  if (el.hidden) return;
  const ts = [...new Set([...G.nos.values()].map((n) => n.criado).filter(Boolean))].sort();
  if (!ts.length) { el.innerHTML = '<span class="btg-mudo">Nada no grafo ainda.</span>'; return; }
  const idx = V.ate ? Math.max(0, ts.findIndex((t) => t >= V.ate)) : ts.length - 1;
  const quantas = (i) => [...G.nos.values()].filter((n) => n.criado <= ts[i]).length;
  el.innerHTML = `<button class="icon-btn" data-play title="${V.tocando ? 'Pausar' : 'Reproduzir a investigação do começo'}">${V.tocando ? IC.pausa : IC.play}</button><input type="range" min="0" max="${ts.length - 1}" value="${idx}" data-r><span class="btg-tempo-q" data-q>${esc(quando(ts[idx]))} · ${quantas(idx)} de ${G.nos.size}</span><button class="icon-btn" data-fechar title="Fechar (T)">${IC.x}</button>`;
  const r = el.querySelector('[data-r]');
  const ir = (i) => { V.ate = i >= ts.length - 1 ? null : ts[i]; sujar(); el.querySelector('[data-q]').textContent = `${quando(ts[i])} · ${quantas(i)} de ${G.nos.size}`; r.value = i; desenhar(); pintarLegenda(); };
  r.oninput = () => ir(Number(r.value));
  el.querySelector('[data-fechar]').onclick = alternarTempo;
  el.querySelector('[data-play]').onclick = () => {
    if (V.tocando) { clearInterval(V.tocando); V.tocando = null; return pintarTempo(); }
    let i = Number(r.value) >= ts.length - 1 ? 0 : Number(r.value);
    const passo = Math.max(1, Math.ceil(ts.length / 60));
    V.tocando = setInterval(() => { i = Math.min(ts.length - 1, i + passo); ir(i); if (i >= ts.length - 1) { clearInterval(V.tocando); V.tocando = null; pintarTempo(); } }, 260);
    pintarTempo();
  };
}
function alternarPainel() {
  R.det.hidden = !R.det.hidden;
  plugin.data.set('painel', !R.det.hidden).catch(() => {});
  setTimeout(desenhar, 0);
}
function trocarAba(aba) {
  V.aba = aba;
  R.pg.querySelectorAll('[data-aba]').forEach((b) => b.classList.toggle('on', b.dataset.aba === aba));
  if (R.det.hidden) alternarPainel();
  pintarDetalhes();
}
function dlgAtalhos() {
  const linhas = [
    ['Enter no campo Investigar', 'põe a entidade no grafo e roda as rápidas'], ['Ctrl+V no grafo', 'investiga o que foi copiado (um valor ou um texto inteiro)'], ['Arrastar um arquivo', 'extrai as entidades dele'],
    ['Duplo clique', 'na entidade: rodar as rápidas · no fundo: adicionar'], ['Enter', 'rodar as rápidas na seleção'], ['Botão direito', 'transformações, máquinas, ligar, foco, cores; numa ligação: mudar ou remover'],
    ['L ou Alt + arrastar', 'ligar a entidade escolhida a outra'], ['N', 'nova entidade ligada à escolhida'], ['.', 'só a vizinhança da escolhida (de novo: mais um salto)'],
    ['C', 'recolher ou abrir os resultados soltos'], ['1 a 5', 'forças, hierárquico, radial, por tipo, círculo'], ['Setas', 'andar para a entidade vizinha'],
    ['F', 'ajustar à tela'], ['M · T · P', 'minimapa · linha do tempo · painel'], ['Shift + arrastar', 'selecionar várias'], ['Ctrl + clique', 'somar à seleção'],
    ['Ctrl+Z · Ctrl+Y', 'desfazer · refazer'], ['Del · Ctrl+C · Ctrl+A', 'remover · copiar os valores · selecionar tudo'], ['Esc', 'cancelar a ligação, sair do foco, limpar a seleção'],
  ];
  return dialogo(`<h3>Atalhos</h3><table class="btg-props btg-atalhos">${linhas.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table><div class="btg-dlg-b"><button class="chip primary" data-cancelar>Fechar</button></div>`, () => {});
}

// ---------- análise: pistas (sem IA) e IA ----------
const grafoParaServidor = (ids) => {
  const so = ids ? new Set(ids) : null;
  const nos = [...G.nos.values()].filter((n) => !so || so.has(n.id)).map((n) => ({ id: n.id, tipo: n.tipo, valor: n.valor, rotulo: n.rotulo, props: n.props, feitas: n.feitas, alerta: n.alerta, notas: n.notas }));
  const dentro = new Set(nos.map((n) => n.id));
  return { nos, ligacoes: [...G.lig.values()].filter((l) => dentro.has(l.de) && dentro.has(l.para)).map((l) => ({ de: l.de, para: l.para, rotulo: l.rotulo })) };
};
function agendarPistas() { clearTimeout(V.pistasT); V.pistasT = setTimeout(calcularPistas, 900); }
async function calcularPistas() {
  if (!G.inv || !CAT) return;
  try { V.pistas = (await chamar('pensar', { grafo: grafoParaServidor(), aprendizado: AP.dados })).pistas; } catch { return; }
  const descartadas = new Set(G.inv.descartadas || []);
  V.pistas = V.pistas.filter((p) => !descartadas.has(p.tipo + '|' + p.titulo));
  const novas = V.pistas.filter((p) => p.tipo !== 'proximo').length;
  if (R.npistas) { R.npistas.hidden = !novas; R.npistas.textContent = novas; }
  if (V.aba === 'analise') pintarDetalhes();
}
const ROTULO_ACAO = { ligar: 'Ligar', rodar: 'Rodar' };
function chipsEntidades(ids) {
  const vis = ids.slice(0, 6).map((id) => G.nos.get(id)).filter(Boolean);
  return `<div class="btg-chips">${vis.map((n) => `<button class="btg-chip" data-ir="${esc(n.id)}" style="--c:${tipo(n.tipo).cor}" title="${esc(n.valor)}">${esc(curto(rotuloCurto(n), 26))}</button>`).join('')}${ids.length > 6 ? `<button class="btg-chip" data-irv="${esc(ids.join('\u0001'))}">+${ids.length - 6}</button>` : ''}</div>`;
}
function executarAcao(a) {
  if (a.tipo === 'ligar') { if (!G.nos.has(a.de) || !G.nos.has(a.para)) return; lembrar(); ligar(a.de, a.para, a.rotulo, 'pista'); historico(`Pista aplicada: ${curto(rotuloDe(G.nos.get(a.de)), 30)} → ${a.rotulo} → ${curto(rotuloDe(G.nos.get(a.para)), 30)}`); mudou(); }
  if (a.tipo === 'rodar') { const n = G.nos.get(a.id); if (n) enfileirar(a.t, [n]); }
}
function pintarAnalise(d) {
  const ps = V.pistas || [];
  const icone_ = { alerta: IC.alerta, descoberta: IC.pensar, ligacao: IC.ligar, proximo: IC.raio };
  const ligacoes = ps.filter((p) => p.tipo === 'ligacao');
  const ia = V.ia || {};
  const r = ia.resultado;
  const nSel = V.sel.size;
  d.innerHTML = `
    <div class="btg-sec"><h4>Pistas <span>${ps.length}</span><button class="btg-link-btn" data-pensar title="O Bluetego olha o grafo de novo">Pensar de novo</button></h4>
      <p class="btg-mudo">O que o próprio Bluetego conclui olhando o grafo, sem IA: ligações que faltam, infraestrutura em comum, próximos passos.</p>
      ${ligacoes.length > 1 ? `<button class="btg-rapidas" data-ligar-todas>${IC.ligar}Aplicar as ${ligacoes.length} ligações sugeridas</button>` : ''}
      ${ps.length ? ps.slice(0, 40).map((p, i) => `<div class="btg-pista t-${p.tipo}"><div class="btg-pista-h">${icone_[p.tipo] || ''}<b>${esc(p.titulo)}</b><button class="icon-btn" data-desc="${i}" title="Descartar">${IC.x}</button></div><p>${esc(p.texto)}</p>${p.entidades && p.entidades.length ? chipsEntidades(p.entidades) : ''}${p.acao ? `<button class="chip btg-pista-ac" data-ac="${i}">${p.acao.tipo === 'rodar' ? IC.raio : IC.ligar}${ROTULO_ACAO[p.acao.tipo]}${p.acao.tipo === 'ligar' ? `: ${esc(p.acao.rotulo)}` : ''}</button>` : ''}</div>`).join('') : '<p class="btg-mudo">Nenhuma pista agora. Rode transformações e o Bluetego volta a pensar sozinho.</p>'}
    </div>
    <div class="btg-sec btg-ia"><h4>IA <span>${esc(ia.provedor || '')}</span><button class="btg-link-btn" data-ia-cfg title="Escolher o provedor de IA">Configurar</button></h4>
      <textarea class="btg-notas" data-ia-texto placeholder="Objetivo ou pergunta. Ex.: quem está por trás deste domínio? Que serviços estão expostos? Há sinais de golpe?">${esc(ia.texto || '')}</textarea>
      <label class="btg-check"><input type="checkbox" data-ia-sel${nSel ? '' : ' disabled'}${ia.soSel && nSel ? ' checked' : ''}> Só a seleção${nSel ? ` (${nSel})` : ''}</label>
      <div class="btg-ia-b">
        <button class="chip primary" data-ia="analise" title="A IA lê o grafo e sugere hipóteses, ligações, entidades e próximos passos">${IC.pensar}Analisar</button>
        <button class="chip" data-ia="pergunta" title="Pergunta livre sobre o grafo">Perguntar</button>
        <button class="chip" data-ia="piloto" title="A IA escolhe as transformações, roda e repete até chegar ao objetivo">${IC.maquina}Piloto automático</button>
      </div>
      ${ia.rodando ? `<div class="btg-ia-rodando"><span class="btg-giro"></span><span>${esc(ia.etapa || 'Pensando…')}</span><button class="icon-btn" data-ia-parar title="Parar">${IC.x}</button></div>` : ''}
      ${ia.erro ? `<div class="btg-alerta">${IC.alerta}<span>${esc(ia.erro)}</span></div>` : ''}
      ${r ? pintarResultadoIA(r) : ''}
      <p class="btg-mudo">O resumo do grafo (valores, propriedades e anotações) vai para o provedor escolhido. Nada entra no grafo sem o seu clique, exceto as transformações que o piloto automático roda.</p>
    </div>`;
  d.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ir) { const n = G.nos.get(b.dataset.ir); if (n) { selecionar([n.id], false, true); centrar(n); } }
    else if (b.dataset.irv) { const ids = b.dataset.irv.split('\u0001').filter((id) => G.nos.has(id)); selecionar(ids, false, true); ajustarEm(ids.map((id) => G.nos.get(id))); }
    else if (b.dataset.ac) executarAcao(ps[b.dataset.ac].acao);
    else if (b.dataset.desc) { const p = ps[b.dataset.desc]; G.inv.descartadas = [...(G.inv.descartadas || []), p.tipo + '|' + p.titulo].slice(-300); V.pistas = ps.filter((x) => x !== p); agendarSalvar(); pintarDetalhes(); }
    else if (b.hasAttribute('data-pensar')) { G.inv.descartadas = []; calcularPistas(); }
    else if (b.hasAttribute('data-ligar-todas')) { lembrar(); for (const p of ligacoes) ligar(p.acao.de, p.acao.para, p.acao.rotulo, 'pista'); historico(`${ligacoes.length} ligações sugeridas aplicadas`); mudou(); }
    else if (b.hasAttribute('data-ia-cfg')) plugin.settings.open();
    else if (b.hasAttribute('data-ia-parar')) { V.ia.cancelar = true; cancelarFila(); }
    else if (b.dataset.ia) rodarIA(b.dataset.ia);
    else if (b.dataset.ial) { const l = r.ligacoes[b.dataset.ial]; executarAcao({ tipo: 'ligar', de: l.de, para: l.para, rotulo: l.rotulo }); b.disabled = true; }
    else if (b.dataset.iae) adicionarSugerida(r.entidades[b.dataset.iae], b);
    else if (b.dataset.iap) { executarAcao({ tipo: 'rodar', ...r.proximos[b.dataset.iap] }); b.disabled = true; }
    else if (b.hasAttribute('data-iap-todos')) r.proximos.forEach((p) => executarAcao({ tipo: 'rodar', ...p }));
  };
  const tx = d.querySelector('[data-ia-texto]');
  tx.oninput = () => { V.ia = { ...(V.ia || {}), texto: tx.value }; };
  tx.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) rodarIA(tx.value.trim().endsWith('?') ? 'pergunta' : 'analise'); };
  d.querySelector('[data-ia-sel]').onchange = (e) => { V.ia = { ...(V.ia || {}), soSel: e.target.checked }; };
}
function pintarResultadoIA(r) {
  const nome = (id) => { const n = G.nos.get(id); return n ? curto(rotuloDe(n), 28) : '?'; };
  return `<div class="btg-ia-res">
    ${r.resposta ? `<div class="btg-ia-resp">${esc(r.resposta)}</div>` : ''}
    ${r.resumo ? `<p class="btg-ia-resumo">${esc(r.resumo)}</p>` : ''}
    ${r.hipoteses.length ? `<h5>Hipóteses</h5>${r.hipoteses.map((h) => `<div class="btg-hip c-${h.confianca === 'alta' ? 'alta' : h.confianca === 'média' ? 'media' : 'baixa'}"><span class="btg-conf">${esc(h.confianca)}</span><p>${esc(h.texto)}</p>${h.entidades.length ? chipsEntidades(h.entidades) : ''}</div>`).join('')}` : ''}
    ${r.ligacoes.length ? `<h5>Ligações que a IA sugere</h5>${r.ligacoes.map((l, i) => `<div class="btg-sug"><div><b>${esc(nome(l.de))}</b> → ${esc(l.rotulo)} → <b>${esc(nome(l.para))}</b><p>${esc(l.motivo)}</p></div><button class="chip" data-ial="${i}">${IC.ligar}Ligar</button></div>`).join('')}` : ''}
    ${r.entidades.length ? `<h5>Entidades para buscar</h5>${r.entidades.map((e, i) => `<div class="btg-sug"><div><span class="btg-tag" style="--c:${tipo(e.tipo).cor}">${esc(tipo(e.tipo).nome)}</span> <b>${esc(curto(e.valor, 40))}</b><p>${esc(e.motivo)}</p></div><button class="chip" data-iae="${i}"${G.nos.has(e.id) ? ' disabled' : ''}>${IC.mais}${G.nos.has(e.id) ? 'Já está' : 'Adicionar'}</button></div>`).join('')}` : ''}
    ${r.proximos.length ? `<h5>Próximos passos <button class="btg-link-btn" data-iap-todos>Rodar todos</button></h5>${r.proximos.map((p, i) => `<div class="btg-sug"><div><b>${esc(transf(p.t).nome)}</b> em ${esc(nome(p.id))}<p>${esc(p.motivo)}</p></div><button class="chip" data-iap="${i}">${IC.raio}Rodar</button></div>`).join('')}` : ''}
    ${r.concluido ? '<p class="btg-mudo">A IA considera o objetivo atingido.</p>' : ''}
  </div>`;
}
async function adicionarSugerida(e, botao) {
  if (G.nos.has(e.id)) return;
  lembrar();
  const pai = e.ligarA && G.nos.get(e.ligarA);
  const n = novoNo({ ...e, props: { 'sugerido pela IA': e.motivo } }, pai || null);
  if (pai) ligar(pai.id, n.id, e.rotulo, 'ia');
  historico(`Entidade sugerida pela IA adicionada: ${tipo(e.tipo).nome} ${e.valor}`);
  if (botao) { botao.disabled = true; botao.textContent = 'Adicionada'; }
  mudou();
}
// a pergunta à IA: monta o pedido no servidor, manda para o provedor e confere a resposta no servidor
async function perguntarComGrafo(modo, texto) {
  const soSel = V.ia && V.ia.soSel && V.sel.size;
  const foco = [...V.sel];
  const grafo = grafoParaServidor(soSel ? [...new Set(foco.flatMap((id) => [id, ...vizinhos(id)]))] : null);
  const ped = await chamar('ia-pedido', { grafo, objetivo: modo === 'pergunta' ? '' : texto, pergunta: modo === 'pergunta' ? texto : '', foco, modo, nome: G.inv.nome });
  const resposta = await perguntarIA(ped.prompt);
  const r = await chamar('ia-ler', { texto: resposta, mapa: ped.mapa, grafo });
  if (!r.ok) throw new Error(r.erro + (r.bruto ? ` Começo da resposta: "${curto(r.bruto, 160)}"` : ''));
  return r;
}
async function rodarIA(modo) {
  const texto = ((V.ia && V.ia.texto) || '').trim();
  if (modo !== 'analise' && !texto) { toast(modo === 'piloto' ? 'Escreva o objetivo do piloto automático' : 'Escreva a pergunta'); R.detc.querySelector('[data-ia-texto]')?.focus(); return; }
  if (!G.nos.size) return toast('Ponha pelo menos uma entidade no grafo');
  if (V.ia && V.ia.rodando) return;
  const cfg = await plugin.settings.get().catch(() => ({}));
  V.ia = { ...(V.ia || {}), rodando: true, erro: '', cancelar: false, etapa: 'Pensando…', provedor: nomeProvedor(cfg) };
  pintarDetalhes();
  try {
    if (modo === 'piloto') await piloto(texto, cfg);
    else {
      V.ia.resultado = await perguntarComGrafo(modo, texto);
      historico(`IA (${modo === 'pergunta' ? 'pergunta' : 'análise'}): ${V.ia.resultado.hipoteses.length} hipóteses, ${V.ia.resultado.ligacoes.length} ligações e ${V.ia.resultado.proximos.length} passos sugeridos`);
    }
    G.inv.ia = [{ quando: agora(), modo, texto, resultado: V.ia.resultado }, ...(G.inv.ia || [])].slice(0, 10);
    agendarSalvar();
  } catch (e) { V.ia.erro = e.message; } finally { V.ia.rodando = false; trocarAba('analise'); }
}
async function piloto(objetivo, cfg) {
  const rodadas = Math.max(1, Math.min(10, Number(cfg.iaRodadas) || 4));
  historico(`Piloto automático começou: ${curto(objetivo, 80)}`);
  for (let i = 1; i <= rodadas && !V.ia.cancelar; i++) {
    V.ia.etapa = `Rodada ${i} de ${rodadas}: a IA está escolhendo os próximos passos…`; pintarDetalhes();
    const r = await perguntarComGrafo('piloto', objetivo);
    V.ia.resultado = r;
    if (V.ia.cancelar) break;
    if (r.concluido || !r.proximos.length) { historico(`Piloto automático: a IA parou na rodada ${i}${r.concluido ? ' (objetivo atingido)' : ''}`); break; }
    const passos = r.proximos.slice(0, 6);
    V.ia.etapa = `Rodada ${i} de ${rodadas}: rodando ${passos.length} ${passos.length === 1 ? 'transformação' : 'transformações'}…`; pintarDetalhes();
    historico(`Piloto automático, rodada ${i}: ${passos.map((p) => transf(p.t).nome).join(', ')}`);
    await Promise.all(passos.map((p) => { const n = G.nos.get(p.id); return n ? enfileirar(p.t, [n]) : null; }));
  }
  if (V.ia.cancelar) return;
  V.ia.etapa = 'Escrevendo a conclusão…'; pintarDetalhes();
  V.ia.resultado = await perguntarComGrafo('analise', objetivo);
  historico('Piloto automático terminou');
}
const nomeProvedor = (c) => ({ anthropic: 'API da Anthropic', ollama: 'Ollama', desligada: 'desligada' })[c.iaProvedor] || `Agente da IDE: ${c.iaAgente || 'claude'}`;
// o mesmo jeito de chamar os agentes que o Automator usa (só leitura: a IA não mexe em nada no PC)
function comandoAgente(a, modelo) {
  const programa = (a.program || '').trim() || a.kind;
  const m = (modelo || a.model || '').trim(), extra = (a.args || []).map((x) => String(x).trim()).filter(Boolean);
  if (a.kind === 'codex') return { programa, args: ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', ...(m ? ['-m', m] : []), ...(a.effort ? ['-c', `model_reasoning_effort="${a.effort}"`] : []), ...extra, '-'], stdin: true };
  if (a.kind === 'claude') return { programa, args: ['-p', '--output-format', 'text', '--permission-mode', 'plan', '--tools', 'Read,Glob,Grep', '--strict-mcp-config', '--disable-slash-commands', ...(m ? ['--model', m] : []), ...(a.effort ? ['--effort', a.effort] : []), ...extra], stdin: true };
  if (!a.program) throw new Error(`O agente ${a.name} não tem programa: configure em Agentes de IA.`);
  return { programa, args: extra.map((x) => x.replace('{model}', m).replace('{effort}', a.effort || '').replace('{access}', 'read')), stdin: true, prompt: extra.some((x) => x.includes('{prompt}')) };
}
async function perguntarIA(prompt) {
  const c = await plugin.settings.get().catch(() => ({}));
  const prov = c.iaProvedor || 'agente';
  if (prov === 'desligada') throw new Error('A IA está desligada nas configurações do Bluetego.');
  if (prov === 'anthropic') {
    if (!(await plugin.vault.has('bluetego.anthropic'))) { plugin.vault.request('bluetego.anthropic'); throw new Error('Guarde a chave da API da Anthropic no Cofre (o pedido já está aberto) e tente de novo.'); }
    const r = await plugin.fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': '{{vault:bluetego.anthropic}}', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, json: { model: (c.iaModelo || '').trim() || 'claude-sonnet-5-5', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }, timeout: 300000 });
    if (!r.ok) throw new Error(`A API da Anthropic respondeu ${r.status}: ${curto(String(r.body || ''), 220)}`);
    return (r.json().content || []).map((x) => x.text || '').join('');
  }
  if (prov === 'ollama') {
    const base = String(c.iaUrl || 'http://localhost:11434').replace(/\/+$/, '');
    const r = await plugin.fetch(base + '/api/chat', { method: 'POST', json: { model: (c.iaModelo || '').trim() || 'llama3.1', stream: false, format: 'json', messages: [{ role: 'user', content: prompt }] }, timeout: 600000 });
    if (!r.ok) throw new Error(`O Ollama (${base}) respondeu ${r.status}: ${curto(String(r.body || ''), 200)}`);
    return (r.json().message || {}).content || '';
  }
  let lista;
  try { lista = await bs.api('agents/clis', {}, { quiet: true }); } catch { throw new Error('Os Agentes de IA da IDE precisam do Automator ligado. Ligue o Automator ou escolha a API da Anthropic ou o Ollama nas configurações do Bluetego.'); }
  const a = lista.find((x) => x.id === ((c.iaAgente || '').trim() || 'claude')) || lista[0];
  if (!a) throw new Error('Nenhum agente de IA configurado na IDE.');
  const cmd = comandoAgente(a, c.iaModelo);
  const args = cmd.prompt ? cmd.args.map((x) => x.replace('{prompt}', prompt)) : cmd.args;
  const r = await plugin.exec(cmd.programa, args, { stdin: cmd.prompt ? undefined : prompt, timeout: 600000 });
  if (r.timedOut) throw new Error(`${a.name} passou de 10 minutos sem responder.`);
  if (!r.ok) throw new Error(`${a.name} falhou: ${curto(String(r.err || r.out || ''), 300)}`);
  return r.out || '';
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
    AP.dados = (await plugin.data.get('aprendizado', {}).catch(() => ({}))) || {};
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
  pintarBarraLayout(); pintarFoco(); pintarTempo();
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
  const d = R.detc;
  if (!d || !CAT || !G.inv) return;
  R.pg.querySelectorAll('[data-aba]').forEach((b) => b.classList.toggle('on', b.dataset.aba === V.aba));
  if (V.aba === 'analise') return pintarAnalise(d);
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
      <button class="icon-btn" data-ligar title="Ligar a outra entidade (L)">${IC.ligar}</button>
      <button class="icon-btn" data-nova title="Nova entidade ligada a esta (N)">${IC.mais}</button>
      <button class="icon-btn" data-focar title="Mostrar só a vizinhança (.)">${IC.foco}</button>
      <span class="btg-cores">${CORES.map(([c, nome]) => `<button class="btg-cor${n.cor === c ? ' on' : ''}" data-cor="${c}" title="${nome}" style="--c:${c || 'transparent'}"></button>`).join('')}</span>
      <button class="icon-btn" data-remover title="Remover (Del)">${IC.lixo}</button>
    </div>
    ${n.alerta ? `<div class="btg-alerta">${IC.alerta}<span>${esc(n.props.risco || (n.props.VirusTotal ? 'VirusTotal: ' + n.props.VirusTotal : n.tipo === 'cve' ? 'Vulnerabilidade conhecida' : n.tipo === 'url' ? 'Endereço que costuma esconder algo (backup, painel, configuração)' : 'Ponto de atenção'))}</span></div>` : ''}
    <label class="btg-campo"><span>Rótulo</span><input data-rotulo value="${esc(n.rotulo || '')}" placeholder="${esc(curto(n.valor, 40))}" spellcheck="false"></label>
    <div class="btg-sec"><h4>Transformações <span>${ts.length}</span></h4>
      <button class="btg-rapidas" data-rapidas>${IC.raio}Rodar as rápidas <span>duplo clique · Enter</span></button>
      ${ts.map((x) => `<button class="btg-tr${n.feitas.includes(x.id) ? ' feita' : ''}" data-t="${x.id}" title="${n.feitas.includes(x.id) ? 'Já rodou: clique para rodar de novo' : 'Rodar'}"><span class="btg-tr-n">${n.feitas.includes(x.id) ? IC.ok : x.rapida ? IC.raio : IC.maquina}${esc(x.nome)}</span><span class="btg-tr-f">${(() => { const r = rendeu(n.tipo, x.id); return r == null ? esc(x.fonte) : `${esc(x.fonte)} · ≈${r >= 10 ? Math.round(r) : r.toFixed(1).replace('.', ',').replace(',0', '')}`; })()}</span></button>`).join('')}
      ${maqs.length ? `<h5>Máquinas</h5>${maqs.map((m) => `<button class="btg-tr" data-m="${m.id}" title="${esc(m.descricao)}"><span class="btg-tr-n">${IC.maquina}${esc(m.nome)}</span><span class="btg-tr-f">${m.passos.length} passos</span></button>`).join('')}` : ''}
    </div>
    ${props.length ? `<div class="btg-sec"><h4>Propriedades</h4><table class="btg-props">${props.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${valorProp(v)}</td></tr>`).join('')}</table></div>` : ''}
    ${n.tipo === 'texto' && n.props.completo ? `<div class="btg-sec"><h4>Texto completo</h4><pre class="btg-pre">${esc(n.props.completo)}</pre></div>` : ''}
    <div class="btg-sec"><h4>Anotações</h4><textarea data-notas class="btg-notas" placeholder="O que você já sabe sobre esta entidade, de onde veio, o que falta confirmar…">${esc(n.notas || '')}</textarea></div>
    <div class="btg-sec"><h4>Ligações <span>${lig.length}</span></h4>${lig.length ? lig.slice(0, 200).map((l) => { const o = G.nos.get(l.de === n.id ? l.para : l.de); if (!o) return ''; return `<button class="btg-li" data-ir="${esc(o.id)}"><span class="btg-pt" style="background:${tipo(o.tipo).cor}"></span><span class="btg-li-r">${l.de === n.id ? '→' : '←'} ${esc(l.rotulo || 'ligado a')}</span><span class="btg-li-v" title="${esc(o.valor)}">${esc(rotuloCurto(o))}</span></button>`; }).join('') : '<p class="btg-mudo">Nenhuma ainda.</p>'}</div>
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
    else if (b.hasAttribute('data-ligar')) comecarLigacao(n);
    else if (b.hasAttribute('data-nova')) dlgAdicionar(null, n.id);
    else if (b.hasAttribute('data-focar')) focar(n, 2);
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
      ${sel.length === 2 ? `<button class="btg-tr" data-ligar2><span class="btg-tr-n">${IC.ligar}Ligar as duas…</span></button><button class="btg-tr" data-caminho><span class="btg-tr-n">${IC.caminho}Mostrar o caminho entre as duas</span></button>` : ''}
      <button class="btg-tr" data-ia-sel><span class="btg-tr-n">${IC.pensar}Perguntar à IA sobre a seleção</span></button>
      <button class="btg-tr" data-viz><span class="btg-tr-n">${IC.vizinhos}Selecionar os vizinhos</span></button>
      <button class="btg-tr" data-copiar><span class="btg-tr-n">${IC.copiar}Copiar os valores</span></button>
      <button class="btg-tr" data-remover><span class="btg-tr-n">${IC.lixo}Remover as ${sel.length}</span></button>
    </div>
    ${V.caminho ? `<div class="btg-sec"><h4>Caminho</h4>${[...V.caminho.nos].map((id) => G.nos.get(id)).filter(Boolean).map((o) => `<button class="btg-li" data-ir="${esc(o.id)}"><span class="btg-pt" style="background:${tipo(o.tipo).cor}"></span><span class="btg-li-v" title="${esc(o.valor)}">${esc(rotuloCurto(o))}</span></button>`).join('')}</div>` : ''}`;
  const itens = itensTransformacoes(sel);
  d.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.i) itens[b.dataset.i].action();
    else if (b.dataset.ir) { const o = G.nos.get(b.dataset.ir); if (o) centrar(o); }
    else if (b.hasAttribute('data-rapidas')) rapidas(sel);
    else if (b.hasAttribute('data-caminho')) mostrarCaminho();
    else if (b.hasAttribute('data-ligar2')) ligarDuas(sel);
    else if (b.hasAttribute('data-ia-sel')) { V.ia = { ...(V.ia || {}), soSel: true }; trocarAba('analise'); }
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
  show() {
    V.mostrado = true; V.cores = null; iniciar();
    plugin.data.get('mini', true).then((v) => { V.mini = v !== false; desenhar(); }).catch(() => {});
    plugin.data.get('painel', true).then((v) => { if (R.det) R.det.hidden = v === false; desenhar(); }).catch(() => {});
    setTimeout(() => { desenhar(); if (V.alpha) animar(); }, 30);
  },
  hide() { V.mostrado = false; dica(null); pararLigacao(); salvar(); },
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
