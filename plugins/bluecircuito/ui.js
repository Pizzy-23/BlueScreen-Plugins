// BlueCircuito: protótipos de automação com ESP32, Arduino e Raspberry Pi Pico, desenhados por uma IA local
// (Claude Code, Codex, Gemini CLI ou Ollama) e conferidos sem IA. Uma aba inteira (ícone na barra da esquerda), com a
// lista de projetos no painel da esquerda. A IA devolve o projeto em JSON; o servidor do plugin confere a parte
// elétrica e, se achar erro, a página pede a correção sozinha (até o número das configurações).
const { $, esc, toast } = bs;

const ICON = '<svg class="i" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/><circle cx="12" cy="12" r="2"/></svg>';
const IC = {
  mais: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  enviar: '<svg class="i" viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5 20 4"/></svg>',
  parar: '<svg class="i" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  lixo: '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  ok: '<svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  alerta: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg>',
  erro: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  dica: '<svg class="i" viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  pasta: '<svg class="i" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  play: '<svg class="i" viewBox="0 0 24 24"><path d="M7 5v14l11-7z"/></svg>',
  chip: ICON,
  martelo: '<svg class="i" viewBox="0 0 24 24"><path d="M14 4l6 6-3 3-6-6zM11 7l-8 8 3 3 8-8"/></svg>',
  upload: '<svg class="i" viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
  serial: '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/></svg>',
  copiar: '<svg class="i" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
  ajustar: '<svg class="i" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  organizar: '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="4" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  desfazer: '<svg class="i" viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  fora: '<svg class="i" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  ia: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>',
  seta: '<svg class="i" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
};
const ABAS = [['ligacoes', 'Ligações'], ['pecas', 'Peças e compras'], ['fluxo', 'Fluxo'], ['codigo', 'Código'], ['montagem', 'Montagem'], ['conferencia', 'Conferência'], ['pinos', 'Pinos']];
const EXEMPLOS = [
  'Estação de temperatura e umidade com display OLED que manda os dados para o celular pelo Wi-Fi',
  'Rega automática de vaso: sensor de umidade do solo liga uma bomba de 5 V pelo relé',
  'Alarme com sensor de presença, buzzer e aviso no Telegram',
  'Medidor de distância com ultrassom e LCD, numa placa de 3,3 V',
  'Fita de LED de 60 LEDs com efeitos controlados por um encoder',
  'Fechadura com leitor RFID que aciona um servo e registra quem entrou',
];
const MAX_MSGS = 200, MAX_HIST = 40;
const B = { cat: null, lista: [], p: null, a: null, aba: 'ligacoes', run: null, ferr: null, pasta: '', cfg: {}, foco: null, hist: [], console: '', compilando: null, cam: { x: 0, y: 0, z: 1 }, camDe: null };
const R = {};

// ---------- chamadas ----------
const chamar = (rota, corpo) => bs.api('bluecircuito/' + rota, {}, corpo === undefined ? { quiet: true } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo), quiet: true });
const id8 = () => Math.random().toString(36).slice(2, 10);
const agora = () => new Date().toISOString();
const brl = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
const quando = (iso) => { try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };
const placaNome = (id) => ((B.cat && B.cat.placas.find((x) => x.id === id)) || { nome: id || 'a IA escolhe' }).nome;
const pecaCat = (id) => (B.cat && B.cat.pecas.find((x) => x.id === id)) || null;
// texto da IA: **negrito** e `código`, o resto escapado
const md = (t) => esc(String(t || '')).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

async function catalogo() { if (!B.cat) B.cat = await chamar('catalogo'); return B.cat; }

// ---------- projetos (plugin.data: "lista" e "p:<id>") ----------
async function carregarLista() { B.lista = (await plugin.data.get('lista', []).catch(() => [])) || []; }
let salvarT = 0;
function salvar(agoraJa) {
  clearTimeout(salvarT);
  const ir = async () => {
    const p = B.p; if (!p) return;
    p.alterado = agora();
    p.conversa = (p.conversa || []).slice(-MAX_MSGS);
    await plugin.data.set('p:' + p.id, p).catch(() => {});
    const i = B.lista.findIndex((x) => x.id === p.id), item = { id: p.id, nome: p.nome || 'Projeto sem nome', placa: p.placa || '', alterado: p.alterado };
    if (i >= 0) B.lista[i] = item; else B.lista.unshift(item);
    B.lista.sort((a, b) => String(b.alterado).localeCompare(String(a.alterado)));
    await plugin.data.set('lista', B.lista).catch(() => {});
    pintarLado();
  };
  if (agoraJa) return ir();
  salvarT = setTimeout(ir, 500);
}
async function novoProjeto() {
  if (B.run) return toast('Espere a IA terminar ou pare antes.');
  B.p = { id: id8(), nome: '', placa: '', linguagem: 'arduino', pecas: [], ligacoes: [], conversa: [], criado: agora(), alterado: agora() };
  B.a = null; B.hist = []; B.console = ''; B.aba = 'ligacoes'; B.cam = { x: 0, y: 0, z: 1 };
  plugin.data.set('atual', B.p.id).catch(() => {});
  pintar(); pintarLado();
  setTimeout(() => { const t = R.pg && R.pg.querySelector('[data-hero-tx]'); if (t) t.focus(); }, 30);
}
async function abrirProjeto(id) {
  if (B.run) return toast('Espere a IA terminar ou pare antes.');
  const p = await plugin.data.get('p:' + id, null).catch(() => null);
  if (!p) { toast('Projeto não encontrado'); B.lista = B.lista.filter((x) => x.id !== id); plugin.data.set('lista', B.lista).catch(() => {}); pintarLado(); return; }
  B.p = p; B.a = null; B.hist = []; B.console = ''; B.cam = { x: 0, y: 0, z: 1 }; B.camDe = null;
  plugin.data.set('atual', id).catch(() => {});
  pintarLado(); pintar();
  await analisar();
}
async function apagarProjeto(id) {
  const item = B.lista.find((x) => x.id === id);
  if (!(await confirmar(`Apagar o projeto "${item ? item.nome : id}"? A pasta exportada no disco continua.`, 'Apagar'))) return;
  await plugin.data.remove('p:' + id).catch(() => {});
  B.lista = B.lista.filter((x) => x.id !== id);
  await plugin.data.set('lista', B.lista).catch(() => {});
  if (B.p && B.p.id === id) { B.p = null; B.a = null; if (B.lista[0]) await abrirProjeto(B.lista[0].id); else novoProjeto(); }
  pintarLado();
}
// guarda o estado para desfazer (a IA mexeu, a pessoa ligou um fio...)
function lembrar() {
  if (!B.p) return;
  const { conversa, ...resto } = B.p;
  B.hist.push(JSON.stringify(resto));
  if (B.hist.length > MAX_HIST) B.hist.shift();
}
function desfazer() {
  if (!B.hist.length || B.run) return;
  const antes = JSON.parse(B.hist.pop());
  B.p = { ...antes, conversa: B.p.conversa };
  msg('sis', 'Mudança desfeita.');
  salvar(); analisar();
}

// ---------- conversa ----------
function msg(quem, texto, extra = {}) {
  if (!B.p) return;
  B.p.conversa = B.p.conversa || [];
  B.p.conversa.push({ quem, texto, em: agora(), ...extra });
  pintarConversa();
}

// ---------- IA ----------
async function agente() {
  const c = B.cfg;
  const prov = c.iaProvedor || 'agente';
  if (prov === 'ollama') return { tipo: 'ollama', nome: 'Ollama', url: String(c.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, ''), modelo: (c.iaModelo || '').trim() || 'qwen2.5-coder:7b' };
  if (prov === 'gemini') return { tipo: 'cli', nome: 'Gemini CLI', programa: 'gemini', args: [...((c.iaModelo || '').trim() ? ['--model', c.iaModelo.trim()] : []), '-p', 'Siga as instrucoes recebidas pela entrada padrao.'], instalar: 'npm install -g @google/gemini-cli' };
  let lista;
  try { lista = await bs.api('agents/clis', {}, { quiet: true }); } catch { throw new Error('Os Agentes de IA da IDE precisam do Automator ligado. Ligue o Automator ou escolha Gemini CLI ou Ollama nas configurações do BlueCircuito.'); }
  const a = lista.find((x) => x.id === ((c.iaAgente || '').trim() || 'claude')) || lista[0];
  if (!a) throw new Error('Nenhum agente de IA configurado na IDE.');
  const programa = (a.program || '').trim() || a.kind, m = ((c.iaModelo || '').trim() || a.model || '').trim(), extra = (a.args || []).map((x) => String(x).trim()).filter(Boolean);
  // só leitura: a IA devolve o projeto em texto, quem grava é o BlueCircuito
  if (a.kind === 'codex') return { tipo: 'cli', nome: a.name, programa, args: ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', ...(m ? ['-m', m] : []), ...(a.effort ? ['-c', `model_reasoning_effort="${a.effort}"`] : []), ...extra, '-'], instalar: 'npm install -g @openai/codex' };
  if (a.kind === 'claude') return { tipo: 'cli', nome: a.name, programa, args: ['-p', '--output-format', 'text', '--permission-mode', 'plan', '--tools', 'Read', '--strict-mcp-config', '--disable-slash-commands', ...(m ? ['--model', m] : []), ...(a.effort ? ['--effort', a.effort] : []), ...extra], instalar: 'npm install -g @anthropic-ai/claude-code' };
  if (!a.program) throw new Error(`O agente ${a.name} não tem programa: configure em Agentes de IA.`);
  const comPrompt = extra.some((x) => x.includes('{prompt}'));
  return { tipo: 'cli', nome: a.name, programa, args: extra.map((x) => x.replace('{model}', m).replace('{effort}', a.effort || '').replace('{access}', 'read')), comPrompt };
}

// uma rodada: pede, espera, lê o JSON, confere; com erro elétrico, pede a correção (até cfg.correcoes vezes)
async function rodarIA(modo, texto, rodada = 0) {
  if (B.run || !B.p) return;
  let a;
  try { a = await agente(); } catch (e) { msg('erro', e.message); return; }
  const run = B.run = { modo, ini: Date.now(), out: '', err: '', h: null, parado: false, nome: a.nome };
  ocupado(true);
  const ped = await chamar('pedido', { modo, pedido: texto, projeto: B.p.pecas && B.p.pecas.length ? B.p : null, problemas: modo === 'corrigir' ? problemasParaCorrigir() : (modo === 'compilar' ? [{ nivel: 'erro', texto }] : []), placa: B.p.placa, linguagem: B.p.linguagem }).catch((e) => ({ erro: e.message }));
  if (ped.erro) { B.run = null; ocupado(false); msg('erro', ped.erro); return; }
  if (modo === 'compilar') ped.prompt = ped.prompt.replace('# A conferência elétrica achou estes problemas', '# O compilador deu este erro');
  try {
    let saida;
    if (a.tipo === 'ollama') {
      const r = await plugin.fetch(a.url + '/api/chat', { method: 'POST', json: { model: a.modelo, stream: false, format: 'json', messages: [{ role: 'user', content: ped.prompt }] }, timeout: 900000 });
      if (!r.ok) throw new Error(`O Ollama (${a.url}) respondeu ${r.status}: ${String(r.body || '').slice(0, 200)}`);
      saida = (r.json().message || {}).content || '';
    } else {
      const args = a.comPrompt ? a.args.map((x) => x.replace('{prompt}', ped.prompt)) : a.args;
      const fim = new Promise((ok) => { run.fim = ok; });
      try {
        run.h = await plugin.spawn(a.programa, args, { label: 'BlueCircuito · ' + a.nome, onData: (t, s) => { if (s === 'err') run.err = (run.err + t).slice(-6000); else run.out += t; }, onExit: (code) => run.fim(code) });
      } catch (e) {
        const falta = /não encontrado|not found|ENOENT/i.test(e.message);
        throw new Error(falta ? `O ${a.nome} não está instalado (ou não está no PATH).${a.instalar ? ` Instale com \`${a.instalar}\` e faça o login rodando \`${a.programa}\` uma vez no terminal.` : ''}` : `${a.nome}: ${e.message}`);
      }
      if (!a.comPrompt) { await run.h.write(ped.prompt); await run.h.close(); }
      const code = await fim;
      if (run.parado) { msg('sis', 'Parado.'); return; }
      if (code && !run.out.trim()) {
        const por = run.err.trim().split(/\r?\n/).slice(-5).join('\n') || `saiu com o código ${code}`;
        throw new Error(`${a.nome} não terminou: ${por}${/login|auth|api key|credential|unauthori/i.test(por) ? `\n\nFaça o login rodando \`${a.programa}\` no terminal.` : ''}`);
      }
      saida = run.out;
    }
    const r = await chamar('ler', { texto: saida, anterior: B.p });
    lembrar();
    const conversa = B.p.conversa, posicoes = B.p.posicoes || {};
    // peças que continuam no projeto mantêm a posição arrastada
    const ficam = new Set((r.projeto.pecas || []).map((x) => x.id));
    B.p = { ...r.projeto, id: B.p.id, criado: B.p.criado, pasta: B.p.pasta, feitos: B.p.feitos, posicoes: Object.fromEntries(Object.entries(posicoes).filter(([k]) => ficam.has(k))), conversa };
    const res = r.conferencia.resumo;
    msg('ia', r.projeto.mensagem || 'Pronto.', { nome: a.nome, seg: Math.round((Date.now() - run.ini) / 1000), erros: res.erro, avisos: res.aviso });
    delete B.p.mensagem;
    salvar();
    B.run = null; ocupado(false);
    await analisar();
    const max = Math.max(0, Math.min(5, Number(B.cfg.correcoes ?? 2)));
    const corrigirAvisos = !!B.cfg.corrigirAvisos && res.aviso > 0;
    if ((res.erro > 0 || corrigirAvisos) && rodada < max) {
      msg('sis', `A conferência achou ${res.erro ? `${res.erro} erro${res.erro > 1 ? 's' : ''}` : `${res.aviso} aviso${res.aviso > 1 ? 's' : ''}`}. Pedindo a correção para a IA (tentativa ${rodada + 1} de ${max})…`);
      return rodarIA('corrigir', '', rodada + 1);
    }
    if (res.erro > 0) msg('sis', `Ainda há ${res.erro} erro${res.erro > 1 ? 's' : ''} elétrico${res.erro > 1 ? 's' : ''}: veja na aba Conferência antes de montar.`, { acao: 'conferencia' });
  } catch (e) {
    msg('erro', e.message);
  } finally {
    if (B.run === run) { B.run = null; ocupado(false); }
  }
}
function problemasParaCorrigir() {
  const l = (B.a && B.a.conferencia.problemas) || [];
  return l.filter((p) => p.nivel === 'erro' || (B.cfg.corrigirAvisos && p.nivel === 'aviso'));
}
function parar() {
  const r = B.run; if (!r) return;
  r.parado = true;
  if (r.h) r.h.kill().catch(() => {});
}
let relogio = 0;
function ocupado(sim) {
  clearInterval(relogio);
  if (sim) relogio = setInterval(pintarEstadoIA, 1000);
  pintarEstadoIA(); pintarBarra(); pintarConversa();
  if (!B.a) pintarConteudo();
  if (R.pg && R.pg.querySelector('[data-hero]') && !sim) pintar();
}
function pintarEstadoIA() {
  const el = R.pg && R.pg.querySelector('[data-estado-ia]'); if (!el) return;
  const r = B.run;
  el.hidden = !r;
  if (!r) return;
  const s = Math.round((Date.now() - r.ini) / 1000);
  el.querySelector('[data-t]').textContent = `${r.nome} ${r.modo === 'novo' ? 'projetando' : r.modo === 'corrigir' ? 'corrigindo os erros' : r.modo === 'compilar' ? 'corrigindo o código' : 'alterando'}… ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function enviar(texto) {
  texto = String(texto || '').trim();
  if (!texto || B.run) return;
  if (!B.p) novoProjeto();
  const novo = !(B.p.pecas && B.p.pecas.length);
  msg('eu', texto);
  if (novo && !B.p.nome) B.p.nome = texto.slice(0, 60);
  salvar();
  if (novo) pintar();
  rodarIA(novo ? 'novo' : 'alterar', texto);
}

// ---------- análise (conferência + desenho + compras) ----------
let analisando = 0;
async function analisar() {
  if (!B.p) return;
  const n = ++analisando;
  try {
    const a = await chamar('analisar', { projeto: B.p });
    if (n !== analisando) return;
    B.a = a;
  } catch (e) { toast('BlueCircuito: ' + e.message); }
  pintar();
}

// ---------- página ----------
function montar(el) {
  R.pg = el;
  el.classList.add('bc-pg');
  el.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.matches('input, textarea')) { e.preventDefault(); desfazer(); }
  });
  pintar();
}
function pintar() {
  const el = R.pg; if (!el) return;
  if (!B.p) { el.innerHTML = '<div class="bc-vazio">Abrindo…</div>'; return; }
  const vazio = !(B.p.pecas && B.p.pecas.length) && !(B.p.conversa || []).some((m) => m.quem === 'eu');
  if (vazio) return pintarHero();
  if (!el.querySelector('[data-corpo]')) {
    el.innerHTML = `
      <div class="bc-barra" data-barra></div>
      <div class="bc-corpo" data-corpo>
        <section class="bc-chat" aria-label="Conversa com a IA">
          <div class="bc-msgs" data-msgs></div>
          <div class="bc-estado-ia" data-estado-ia hidden><span class="bc-giro"></span><span data-t></span><button class="chip" data-parar>${IC.parar}<span>Parar</span></button></div>
          <form class="bc-entrada" data-form>
            <textarea data-tx rows="2" spellcheck="false" placeholder="Peça uma mudança ou tire uma dúvida (troque o sensor, ponha um display, use bateria…). Enter envia."></textarea>
            <button type="submit" class="chip primary" data-enviar title="Enviar (Enter)">${IC.enviar}<span>Enviar</span></button>
          </form>
        </section>
        <section class="bc-painel">
          <nav class="bc-abas" data-abas role="tablist"></nav>
          <div class="bc-conteudo" data-conteudo></div>
        </section>
      </div>
      <div class="bc-dlg" data-dlg hidden></div>`;
    ligarChat();
  }
  pintarBarra(); pintarConversa(); pintarAbas(); pintarConteudo(); pintarEstadoIA();
}

function pintarHero() {
  const el = R.pg;
  const placas = (B.cat ? B.cat.placas : []).map((x) => `<option value="${x.id}"${B.p.placa === x.id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('');
  const lings = Object.entries((B.cat && B.cat.linguagens) || {}).map(([k, x]) => `<option value="${k}"${B.p.linguagem === k ? ' selected' : ''}>${esc(x.nome)}</option>`).join('');
  el.innerHTML = `
    <div class="bc-hero" data-hero>
      <div class="bc-hero-in">
        <div class="bc-hero-ic">${ICON}</div>
        <h2>O que você quer montar?</h2>
        <p>Descreva a automação. A IA escolhe a placa e as peças, desenha as ligações, o fluxo e o código, e o BlueCircuito confere a parte elétrica antes de você comprar qualquer coisa.</p>
        <form data-hero-form>
          <textarea data-hero-tx rows="4" spellcheck="false" placeholder="Ex.: quando a terra do vaso secar, ligar uma bomba d'água por 5 segundos e me avisar no celular">${esc(B.p._rascunho || '')}</textarea>
          <div class="bc-hero-op">
            <label><span>Placa</span><select data-hero-placa><option value="">A IA escolhe</option>${placas}</select></label>
            <label><span>Linguagem</span><select data-hero-ling>${lings}</select></label>
            <button type="submit" class="chip primary" data-hero-ir ${B.run ? 'disabled' : ''}>${IC.ia}<span>Projetar</span></button>
          </div>
        </form>
        <div class="bc-ex">${EXEMPLOS.map((x) => `<button type="button" class="bc-ex-b">${esc(x)}</button>`).join('')}</div>
        <p class="bc-mudo">IA: ${esc(nomeIA())} · <button type="button" class="bc-link" data-cfg>trocar</button></p>
      </div>
    </div>
    <div class="bc-dlg" data-dlg hidden></div>`;
  const tx = el.querySelector('[data-hero-tx]');
  tx.oninput = () => { B.p._rascunho = tx.value; };
  tx.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); el.querySelector('[data-hero-form]').requestSubmit(); } };
  el.querySelector('[data-hero-placa]').onchange = (e) => { B.p.placa = e.target.value; };
  el.querySelector('[data-hero-ling]').onchange = (e) => { B.p.linguagem = e.target.value; };
  el.querySelector('[data-hero-form]').onsubmit = (e) => { e.preventDefault(); const t = tx.value.trim(); if (!t) return tx.focus(); delete B.p._rascunho; enviar(t); };
  el.querySelectorAll('.bc-ex-b').forEach((b) => (b.onclick = () => { tx.value = b.textContent; B.p._rascunho = tx.value; tx.focus(); }));
  el.querySelector('[data-cfg]').onclick = () => plugin.settings.open();
}
const nomeIA = () => ({ agente: `Agente da IDE (${(B.cfg.iaAgente || 'claude').trim()})`, gemini: 'Gemini CLI', ollama: 'Ollama' }[B.cfg.iaProvedor || 'agente'] || 'Agente da IDE');

function pintarBarra() {
  const el = R.pg && R.pg.querySelector('[data-barra]'); if (!el || !B.p) return;
  const r = B.a && B.a.conferencia.resumo;
  const st = !r ? '' : r.erro ? `<button class="bc-st err" data-ir="conferencia" title="Ver os erros">${IC.erro}<span>${r.erro} erro${r.erro > 1 ? 's' : ''}</span></button>` : r.aviso ? `<button class="bc-st warn" data-ir="conferencia" title="Ver os avisos">${IC.alerta}<span>${r.aviso} aviso${r.aviso > 1 ? 's' : ''}</span></button>` : `<button class="bc-st ok" data-ir="conferencia" title="A conferência elétrica não achou problema">${IC.ok}<span>Conferido</span></button>`;
  const placas = (B.p.placa ? '' : '<option value="" selected>A IA escolhe</option>') + (B.cat ? B.cat.placas : []).map((x) => `<option value="${x.id}"${B.p.placa === x.id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('');
  el.innerHTML = `
    <input class="bc-nome" data-nome value="${esc(B.p.nome || '')}" placeholder="Nome do projeto" spellcheck="false" aria-label="Nome do projeto">
    <span class="bc-placa" title="Placa (trocar pede para a IA refazer as ligações)">${IC.chip}<select data-placa aria-label="Placa">${placas}</select></span>
    ${st}
    <span class="bc-sep"></span>
    <button class="icon-btn" data-a="desfazer" title="Desfazer (Ctrl+Z)" ${B.hist.length && !B.run ? '' : 'disabled'}>${IC.desfazer}</button>
    <button class="chip" data-a="simular" title="Simular no Wokwi antes de montar">${IC.play}<span>Simular</span></button>
    <button class="chip" data-a="exportar" title="Gravar a pasta do projeto: código, PlatformIO, Wokwi e LEIA-ME">${IC.pasta}<span>Salvar pasta</span></button>
    <button class="chip primary" data-a="gravar" title="Compilar e gravar na placa pelo USB">${IC.upload}<span>Gravar</span></button>`;
  const nome = el.querySelector('[data-nome]');
  nome.onchange = () => { B.p.nome = nome.value.trim(); salvar(); };
  nome.onkeydown = (e) => { if (e.key === 'Enter') nome.blur(); };
  el.querySelector('[data-placa]').onchange = (e) => {
    const nova = e.target.value, antiga = B.p.placa;
    if (nova === antiga || !nova) return;
    if (!(B.p.pecas || []).length) { B.p.placa = nova; salvar(); pintarBarra(); return; }
    e.target.value = antiga;
    enviar(`Troque a placa para ${placaNome(nova)} (${nova}) e refaça as ligações e o código para ela.`);
  };
  el.onclick = (e) => {
    const ir = e.target.closest('[data-ir]'); if (ir) return trocarAba(ir.dataset.ir);
    const b = e.target.closest('[data-a]'); if (!b) return;
    ({ desfazer, simular, exportar: () => exportar(true), gravar: () => compilar('upload') })[b.dataset.a]?.();
  };
}

function ligarChat() {
  const el = R.pg;
  const tx = el.querySelector('[data-tx]');
  el.querySelector('[data-form]').onsubmit = (e) => { e.preventDefault(); const t = tx.value; tx.value = ''; enviar(t); };
  tx.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.querySelector('[data-form]').requestSubmit(); } };
  el.querySelector('[data-parar]').onclick = parar;
  el.querySelector('[data-msgs]').onclick = (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return;
    if (b.dataset.acao === 'conferencia') trocarAba('conferencia');
    if (b.dataset.acao === 'cfg') plugin.settings.open();
  };
}
function pintarConversa() {
  const el = R.pg && R.pg.querySelector('[data-msgs]'); if (!el || !B.p) return;
  const fim = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.innerHTML = (B.p.conversa || []).map((m) => {
    if (m.quem === 'eu') return `<div class="bc-m eu">${md(m.texto)}</div>`;
    if (m.quem === 'ia') return `<div class="bc-m ia"><div class="bc-m-h">${IC.ia}<span>${esc(m.nome || 'IA')}</span>${m.seg ? `<span class="bc-mudo">${m.seg} s</span>` : ''}${m.erros != null ? (m.erros ? `<span class="bc-tag err">${m.erros} erro${m.erros > 1 ? 's' : ''}</span>` : `<span class="bc-tag ok">conferido</span>`) : ''}</div>${md(m.texto)}</div>`;
    if (m.quem === 'erro') return `<div class="bc-m erro">${IC.erro}<div>${md(m.texto)}<div><button class="bc-link" data-acao="cfg">Configurações da IA</button></div></div></div>`;
    return `<div class="bc-m sis">${md(m.texto)}${m.acao ? ` <button class="bc-link" data-acao="${esc(m.acao)}">Ver</button>` : ''}</div>`;
  }).join('') || '<div class="bc-mudo bc-pad">A conversa com a IA aparece aqui.</div>';
  if (fim) el.scrollTop = el.scrollHeight;
  const env = R.pg.querySelector('[data-enviar]'); if (env) env.disabled = !!B.run;
}
function pintarAbas() {
  const el = R.pg && R.pg.querySelector('[data-abas]'); if (!el) return;
  const r = B.a && B.a.conferencia.resumo;
  el.innerHTML = ABAS.map(([k, n]) => `<button role="tab" aria-selected="${B.aba === k}" class="bc-aba${B.aba === k ? ' on' : ''}" data-aba="${k}">${n}${k === 'conferencia' && r && (r.erro || r.aviso) ? `<span class="bc-n ${r.erro ? 'err' : 'warn'}">${r.erro || r.aviso}</span>` : ''}${k === 'pecas' && B.p.pecas && B.p.pecas.length ? `<span class="bc-n">${B.p.pecas.length}</span>` : ''}</button>`).join('');
  el.onclick = (e) => { const b = e.target.closest('[data-aba]'); if (b) trocarAba(b.dataset.aba); };
}
function trocarAba(k) { B.aba = k; plugin.data.set('aba', k).catch(() => {}); pintarAbas(); pintarConteudo(); }
function pintarConteudo() {
  const el = R.pg && R.pg.querySelector('[data-conteudo]'); if (!el) return;
  el.dataset.aba = B.aba;
  if (!B.a) { el.innerHTML = `<div class="bc-vazio">${B.run ? 'Esperando a IA…' : 'Carregando…'}</div>`; return; }
  ({ ligacoes: pintarLigacoes, pecas: pintarPecas, fluxo: pintarFluxo, codigo: pintarCodigo, montagem: pintarMontagem, conferencia: pintarConferencia, pinos: pintarPinos })[B.aba](el);
}

// ---------- aba Ligações: diagrama ----------
// sinais: sem azul, amarelo, laranja, vermelho e cinza, que já dizem SDA, SCL, 3,3 V, 5 V e GND
const COR_FIO = ['#3fb950', '#a371f7', '#39c5cf', '#f778ba', '#7ee787', '#bc8cff', '#56d4dd', '#ff9bce'];
function tipoFio(l, mapa) {
  const papel = (s) => { const x = mapa[s]; return x ? x.papel : ''; };
  const ps = [papel(l.de), papel(l.para)];
  if (ps.includes('gnd')) return 'gnd';
  if (ps.some((x) => x === '3v3')) return '3v3';
  if (ps.some((x) => ['5v', 'vin', 'vcc', 'fonte'].includes(x))) return 'vcc';
  if (ps.includes('sda')) return 'sda';
  if (ps.includes('scl')) return 'scl';
  return 'sinal';
}
// posição absoluta de cada ponto "peça:pino"
function mapaDePontos(L) {
  const m = {};
  for (const x of L.placa.pinos) m['placa:' + x.nome] = { x: x.x, y: x.y, lado: x.lado === 'e' ? -1 : 1, papel: x.tipo === 'gpio' ? 'gpio' : x.tipo };
  for (const pc of L.pecas) for (const x of pc.pinos) m[pc.id + ':' + x.nome] = { x: pc.x + pc.pinoX, y: pc.y + x.dy, lado: pc.pinoX ? 1 : -1, papel: x.papel, peca: pc.id };
  return m;
}
// "placa:GPIO4" -> "placa:D4" (o nome canônico, como no desenho)
function canonico(ponto, L) {
  const s = String(ponto), i = s.lastIndexOf(':'), quem = s.slice(0, i), pino = s.slice(i + 1);
  if (/^(placa|board|mcu|esp|esp32|arduino|uno|pico)$/i.test(quem)) {
    const u = pino.toUpperCase();
    const p = L.placa.pinos.find((x) => x.nome.toUpperCase() === u) || L.placa.pinos.find((x) => x.gpio != null && (u === String(x.gpio) || u === 'GPIO' + x.gpio || u === 'GP' + x.gpio || u === 'D' + x.gpio)) || (u === 'GND' ? L.placa.pinos.find((x) => x.tipo === 'gnd') : null);
    return p ? 'placa:' + p.nome : s;
  }
  const pc = L.pecas.find((x) => x.id === quem);
  const pin = pc && pc.pinos.find((x) => x.nome.toLowerCase() === pino.toLowerCase());
  return pc && pin ? pc.id + ':' + pin.nome : s;
}
function pintarLigacoes(el) {
  const L = B.a.layout;
  if (!L) { el.innerHTML = `<div class="bc-vazio">Escolha uma placa para desenhar as ligações.</div>`; return; }
  const probs = B.a.conferencia.problemas;
  const ruins = new Set(probs.filter((p) => p.nivel === 'erro').flatMap((p) => p.onde || []));
  el.innerHTML = `
    <div class="bc-diag" data-diag tabindex="0" aria-label="Diagrama de ligações">
      <svg data-svg><g data-cena></g></svg>
      <div class="bc-diag-ferr">
        <button class="icon-btn" data-d="ajustar" title="Ajustar à tela (F)">${IC.ajustar}</button>
        <button class="icon-btn" data-d="organizar" title="Reorganizar as peças">${IC.organizar}</button>
        <button class="chip" data-d="peca" title="Acrescentar uma peça do catálogo">${IC.mais}<span>Peça</span></button>
      </div>
      <div class="bc-legenda"><span><i style="background:var(--bc-gnd)"></i>GND</span><span><i style="background:var(--bc-3v3)"></i>3,3 V</span><span><i style="background:var(--bc-vcc)"></i>5 V e mais</span><span><i style="background:#4f8cff"></i>SDA</span><span><i style="background:#d4b72c"></i>SCL</span><span class="bc-mudo">Arraste do pino até outro pino para ligar · clique num fio para remover</span></div>
      <div class="bc-dica-fio" data-dica hidden></div>
    </div>`;
  const svg = el.querySelector('[data-svg]'), cena = el.querySelector('[data-cena]'), dica = el.querySelector('[data-dica]');
  const desenhar = () => {
    const m = mapaDePontos(L);
    const fios = (B.p.ligacoes || []).map((l, i) => {
      const a = m[canonico(l.de, L)], b = m[canonico(l.para, L)];
      if (!a || !b) return '';
      const t = tipoFio(l, { [l.de]: a, [l.para]: b, [canonico(l.de, L)]: a, [canonico(l.para, L)]: b });
      const cor = t === 'gnd' ? 'var(--bc-gnd)' : t === '3v3' ? 'var(--bc-3v3)' : t === 'vcc' ? 'var(--bc-vcc)' : t === 'sda' ? '#4f8cff' : t === 'scl' ? '#d4b72c' : COR_FIO[i % COR_FIO.length];
      const d = Math.max(40, Math.min(140, Math.abs(b.x - a.x) * 0.5));
      const foco = B.foco && (B.foco.includes(canonico(l.de, L)) || B.foco.includes(canonico(l.para, L)));
      return `<path class="bc-fio${foco ? ' foco' : ''}" data-fio="${i}" d="M${a.x},${a.y} C${a.x + a.lado * d},${a.y} ${b.x + b.lado * d},${b.y} ${b.x},${b.y}" stroke="${cor}"/>`;
    }).join('');
    const pl = L.placa;
    const pinosPlaca = pl.pinos.map((x) => {
      const k = 'placa:' + x.nome, ruim = ruins.has(k), foco = B.foco && B.foco.includes(k);
      return `<g class="bc-pino ${x.estado}${ruim ? ' ruim' : ''}${foco ? ' foco' : ''}" data-ponto="${esc(k)}"><circle cx="${x.x}" cy="${x.y}" r="4.5"/><text x="${x.lado === 'e' ? x.x + 10 : x.x - 10}" y="${x.y + 3.5}" text-anchor="${x.lado === 'e' ? 'start' : 'end'}">${esc(x.nome)}</text></g>`;
    }).join('');
    const pecas = L.pecas.map((pc) => {
      const ruim = probs.some((p) => p.nivel === 'erro' && (p.onde || []).some((o) => o === pc.id || String(o).startsWith(pc.id + ':')));
      const pinos = pc.pinos.map((x) => {
        const k = pc.id + ':' + x.nome, px = pc.pinoX, foco = B.foco && B.foco.includes(k);
        return `<g class="bc-pino p-${x.papel}${ruins.has(k) ? ' ruim' : ''}${x.opcional ? ' opc' : ''}${foco ? ' foco' : ''}" data-ponto="${esc(k)}"><circle cx="${px}" cy="${x.dy}" r="4.5"/><text x="${px ? px - 10 : 10}" y="${x.dy + 3.5}" text-anchor="${px ? 'end' : 'start'}">${esc(x.nome)}</text></g>`;
      }).join('');
      const foco = B.foco && B.foco.includes(pc.id);
      return `<g class="bc-peca${ruim ? ' ruim' : ''}${foco ? ' foco' : ''}" data-peca="${esc(pc.id)}" transform="translate(${pc.x},${pc.y})"><rect class="bc-peca-c" width="${pc.w}" height="${pc.h}" rx="7"/><text class="bc-peca-t" x="10" y="15">${esc(cortar(pc.nome, 22))}</text><text class="bc-peca-s" x="10" y="27">${esc(cortar(pc.id + ' · ' + (pc.valor || pc.modelo), 26))}</text>${pinos}<title>${esc(pc.modelo)}</title></g>`;
    }).join('');
    cena.innerHTML = `<g class="bc-placa-g"><rect class="bc-placa-c" width="${pl.w}" height="${pl.h}" rx="10"/><text class="bc-placa-t" x="${pl.w / 2}" y="20" text-anchor="middle">${esc(cortar(pl.nome, 24))}</text><text class="bc-placa-s" x="${pl.w / 2}" y="34" text-anchor="middle">USB ↓</text>${pinosPlaca}</g><g data-fios>${fios}</g>${pecas}<path data-temp class="bc-fio temp" d="" hidden/>`;
  };
  const camera = () => cena.setAttribute('transform', `translate(${B.cam.x},${B.cam.y}) scale(${B.cam.z})`);
  const ajustar = () => {
    const r = svg.getBoundingClientRect(); if (!r.width) return;
    const xs = [0, L.placa.w, ...L.pecas.flatMap((p) => [p.x, p.x + p.w])], ys = [0, L.placa.h, ...L.pecas.flatMap((p) => [p.y, p.y + p.h])];
    const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30, y0 = Math.min(...ys) - 30, y1 = Math.max(...ys) + 50;
    const z = Math.min(1.4, Math.max(0.25, Math.min(r.width / (x1 - x0), r.height / (y1 - y0))));
    B.cam = { z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - (y1 - y0) * z) / 2 - y0 * z };
    B.camDe = B.p.id; camera();
  };
  desenhar();
  requestAnimationFrame(() => { if (B.camDe !== B.p.id) ajustar(); else camera(); });
  const mundo = (e) => { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left - B.cam.x) / B.cam.z, y: (e.clientY - r.top - B.cam.y) / B.cam.z }; };
  svg.onwheel = (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const z = Math.min(3, Math.max(0.2, B.cam.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    B.cam.x = mx - (mx - B.cam.x) * (z / B.cam.z); B.cam.y = my - (my - B.cam.y) * (z / B.cam.z); B.cam.z = z;
    camera();
  };
  svg.onpointerdown = (e) => {
    if (e.button !== 0) return;
    const pino = e.target.closest('[data-ponto]'), peca = e.target.closest('[data-peca]'), fio = e.target.closest('[data-fio]');
    if (fio) return removerFio(Number(fio.dataset.fio));
    svg.setPointerCapture(e.pointerId);
    const ini = mundo(e), cam0 = { ...B.cam }, c0 = { x: e.clientX, y: e.clientY };
    if (pino) {
      // ligar: arrasta de um pino até outro
      const de = pino.dataset.ponto, m = mapaDePontos(L)[de], temp = cena.querySelector('[data-temp]');
      temp.hidden = false;
      svg.onpointermove = (ev) => { const p = mundo(ev); temp.setAttribute('d', `M${m.x},${m.y} L${p.x},${p.y}`); };
      svg.onpointerup = (ev) => {
        svg.onpointermove = svg.onpointerup = null; temp.hidden = true;
        const alvo = document.elementFromPoint(ev.clientX, ev.clientY);
        const para = alvo && alvo.closest && alvo.closest('[data-ponto]');
        if (para && para.dataset.ponto !== de) ligar(de, para.dataset.ponto);
      };
      return;
    }
    if (peca) {
      const pc = L.pecas.find((x) => x.id === peca.dataset.peca), x0 = pc.x, y0 = pc.y;
      let mexeu = false;
      svg.onpointermove = (ev) => { const p = mundo(ev); pc.x = Math.round(x0 + p.x - ini.x); pc.y = Math.round(y0 + p.y - ini.y); pc.pinoX = pc.x + pc.w / 2 < L.placa.w / 2 ? pc.w : 0; mexeu = true; desenhar(); };
      svg.onpointerup = () => {
        svg.onpointermove = svg.onpointerup = null;
        if (mexeu) { B.p.posicoes = { ...(B.p.posicoes || {}), [pc.id]: { x: pc.x, y: pc.y } }; salvar(); }
        else focar([pc.id]);
      };
      return;
    }
    svg.onpointermove = (ev) => { B.cam.x = cam0.x + ev.clientX - c0.x; B.cam.y = cam0.y + ev.clientY - c0.y; camera(); };
    svg.onpointerup = (ev) => { svg.onpointermove = svg.onpointerup = null; if (Math.abs(ev.clientX - c0.x) + Math.abs(ev.clientY - c0.y) < 4 && B.foco) { B.foco = null; desenhar(); } };
  };
  svg.oncontextmenu = (e) => {
    const peca = e.target.closest('[data-peca]');
    if (!peca) return;
    e.preventDefault();
    const id = peca.dataset.peca;
    bs.showMenu(e, [
      { label: 'Renomear (para que serve)', icon: IC.martelo, action: () => renomearPeca(id) },
      { label: 'Tirar a peça e os fios dela', icon: IC.lixo, action: () => removerPeca(id) },
    ], id);
  };
  // dica do fio
  svg.onpointerover = (e) => {
    const f = e.target.closest('[data-fio]');
    if (!f) { dica.hidden = true; return; }
    const l = B.p.ligacoes[Number(f.dataset.fio)];
    if (!l) return;
    dica.textContent = `${l.de} → ${l.para}${l.nota ? ' · ' + l.nota : ''} (clique para remover)`;
    dica.hidden = false;
  };
  el.querySelector('.bc-diag-ferr').onclick = (e) => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    if (b.dataset.d === 'ajustar') ajustar();
    if (b.dataset.d === 'organizar') { lembrar(); B.p.posicoes = {}; B.camDe = null; salvar(); analisar(); }
    if (b.dataset.d === 'peca') menuPecas(b);
  };
  el.querySelector('[data-diag]').onkeydown = (e) => { if (e.key === 'f' || e.key === 'F') ajustar(); };
}
const cortar = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
function focar(onde) { B.foco = onde && onde.length ? onde : null; if (B.aba !== 'ligacoes') trocarAba('ligacoes'); else pintarConteudo(); }
function ligar(a, b) {
  if (B.run) return toast('Espere a IA terminar.');
  if ((B.p.ligacoes || []).some((l) => (l.de === a && l.para === b) || (l.de === b && l.para === a))) return;
  lembrar();
  B.p.ligacoes = [...(B.p.ligacoes || []), { de: a, para: b }];
  salvar(); analisar();
}
function removerFio(i) {
  if (B.run) return toast('Espere a IA terminar.');
  const l = B.p.ligacoes[i]; if (!l) return;
  lembrar();
  B.p.ligacoes = B.p.ligacoes.filter((_, j) => j !== i);
  toast(`Fio ${l.de} → ${l.para} removido (Ctrl+Z desfaz)`);
  salvar(); analisar();
}
function removerPeca(id) {
  if (B.run) return toast('Espere a IA terminar.');
  lembrar();
  B.p.pecas = B.p.pecas.filter((x) => x.id !== id);
  B.p.ligacoes = (B.p.ligacoes || []).filter((l) => !String(l.de).startsWith(id + ':') && !String(l.para).startsWith(id + ':'));
  salvar(); analisar();
}
async function renomearPeca(id) {
  const pc = B.p.pecas.find((x) => x.id === id); if (!pc) return;
  const v = await perguntar('Para que serve esta peça neste projeto?', pc.rotulo || '');
  if (v == null) return;
  lembrar(); pc.rotulo = v.trim(); salvar(); analisar();
}
function menuPecas(botao) {
  const r = botao.getBoundingClientRect(), ev = { preventDefault() {}, stopPropagation() {}, clientX: r.left, clientY: r.bottom + 4 };
  const grupos = {};
  for (const x of B.cat.pecas) (grupos[x.grupo] = grupos[x.grupo] || []).push(x);
  bs.showMenu(ev, Object.entries(grupos).map(([g, l]) => ({ label: g, icon: IC.chip, sub: l.map((x) => ({ label: x.nome, action: () => acrescentarPeca(x.id) })) })), 'Acrescentar peça');
}
function acrescentarPeca(tipo) {
  lembrar();
  const base = tipo.replace(/[^a-z0-9]/g, '').slice(0, 6) || 'p';
  let n = 1; while (B.p.pecas.some((x) => x.id === base + n)) n++;
  B.p.pecas = [...B.p.pecas, { id: base + n, tipo, ...(tipo === 'resistor' ? { valor: '220Ω' } : {}) }];
  salvar(); analisar();
  toast(`${pecaCat(tipo).nome} acrescentada: ligue os pinos arrastando até a placa.`);
}

// ---------- aba Peças e compras ----------
function pintarPecas(el) {
  const c = B.a.compras;
  el.innerHTML = `
    <div class="bc-rolar">
      <div class="bc-cab"><h3>Lista de compras</h3><span class="bc-total">${brl(c.total)} <span class="bc-mudo">estimado</span></span></div>
      <div class="bc-tabela-w"><table class="bc-tabela bc-compras">
        <thead><tr><th>Qtd</th><th>Peça</th><th class="num">Preço</th><th>Procurar</th></tr></thead>
        <tbody>${c.itens.map((i) => `<tr><td class="num">${i.qtd}</td><td><div>${esc(i.nome)}</div>${i.usos && i.usos.length ? `<div class="bc-mudo">${esc([...new Set(i.usos)].join(' · '))}</div>` : ''}</td><td class="num">${brl(i.preco * i.qtd)}</td><td class="bc-lojas"><button class="bc-loja" data-url="${esc(i.lojas.mercadolivre)}">Mercado Livre</button><button class="bc-loja" data-url="${esc(i.lojas.aliexpress)}">AliExpress</button><button class="bc-loja" data-url="${esc(i.lojas.shopee)}">Shopee</button></td></tr>`).join('')}</tbody>
      </table></div>
      <p class="bc-mudo">Preços médios de loja nacional, só para ter ideia. No AliExpress costuma sair mais barato e demorar mais.</p>
      <h3>Peças no projeto</h3>
      <div class="bc-cards">${(B.p.pecas || []).map((pc) => { const k = pecaCat(pc.tipo) || { nome: pc.tipo, pinos: [] }; return `<div class="bc-card" data-foco="${esc(pc.id)}" tabindex="0" role="button" title="Mostrar no diagrama"><div class="bc-card-t">${esc(pc.rotulo || k.nome)}</div><div class="bc-mudo">${esc(pc.id)} · ${esc(k.nome)}${pc.valor ? ' · ' + esc(pc.valor) : ''}</div>${k.dica ? `<p>${esc(k.dica)}</p>` : ''}</div>`; }).join('') || '<div class="bc-mudo">Nenhuma peça ainda.</div>'}</div>
    </div>`;
  el.onclick = (e) => {
    const u = e.target.closest('[data-url]'); if (u) return chamar('abrir', { url: u.dataset.url }).catch((x) => toast(x.message));
    const f = e.target.closest('[data-foco]'); if (f) focar([f.dataset.foco]);
  };
}

// ---------- aba Fluxo ----------
const TIPO_FLUXO = { inicio: 'Início', gatilho: 'Gatilho', leitura: 'Leitura', decisao: 'Decisão', acao: 'Ação', espera: 'Espera', rede: 'Rede' };
function pintarFluxo(el) {
  const f = B.p.fluxo || [];
  if (!f.length) { el.innerHTML = '<div class="bc-vazio">A IA ainda não descreveu o fluxo. Peça: "descreva o fluxo do programa".</div>'; return; }
  // níveis pela primeira vez que cada passo aparece andando a partir do primeiro; volta para trás vira laço
  const por = new Map(f.map((x) => [x.id, x])), nivel = new Map(), ordem = [];
  const fila = [[f[0].id, 0]];
  while (fila.length) {
    const [id, n] = fila.shift();
    if (nivel.has(id) || !por.has(id)) continue;
    nivel.set(id, n); ordem.push(id);
    for (const d of por.get(id).depois || []) fila.push([d, n + 1]);
  }
  for (const x of f) if (!nivel.has(x.id)) { nivel.set(x.id, Math.max(0, ...nivel.values()) + 1); ordem.push(x.id); }
  const linhas = new Map();
  for (const id of ordem) { const n = nivel.get(id); if (!linhas.has(n)) linhas.set(n, []); linhas.get(n).push(id); }
  const W = 210, H = 54, GX = 40, GY = 46, pos = new Map();
  const larg = Math.max(...[...linhas.values()].map((l) => l.length)) * (W + GX);
  for (const [n, ids] of linhas) ids.forEach((id, i) => pos.set(id, { x: (larg - ids.length * (W + GX)) / 2 + i * (W + GX) + GX / 2, y: 20 + n * (H + GY) }));
  const altura = 20 + (Math.max(...linhas.keys()) + 1) * (H + GY);
  let setas = '';
  for (const x of f) (x.depois || []).forEach((d, i) => {
    const a = pos.get(x.id), b = pos.get(d); if (!a || !b) return;
    const rot = (x.rotulos || [])[i] || '';
    let path, lx, ly;
    if (b.y > a.y) { const x1 = a.x + W / 2 + (x.depois.length > 1 ? (i ? 30 : -30) : 0), y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y; path = `M${x1},${y1} C${x1},${y1 + 26} ${x2},${y2 - 26} ${x2},${y2}`; lx = (x1 + x2) / 2 + 6; ly = (y1 + y2) / 2; }
    else { const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x + W, y2 = b.y + H / 2, o = 60 + Math.abs(y1 - y2) * 0.08; path = `M${x1},${y1} C${x1 + o},${y1} ${x2 + o},${y2} ${x2},${y2}`; lx = Math.max(x1, x2) + o * 0.6; ly = (y1 + y2) / 2; }
    setas += `<path class="bc-seta" d="${path}" marker-end="url(#bc-ponta)"/>${rot ? `<text class="bc-seta-t" x="${lx}" y="${ly}">${esc(rot)}</text>` : ''}`;
  });
  const caixas = f.map((x) => { const p = pos.get(x.id); return `<g class="bc-no t-${x.tipo}" transform="translate(${p.x},${p.y})"><rect width="${W}" height="${H}" rx="${x.tipo === 'inicio' ? H / 2 : x.tipo === 'decisao' ? 14 : 8}"/><text class="bc-no-k" x="12" y="17">${TIPO_FLUXO[x.tipo] || ''}</text>${quebrar(x.texto, 30).slice(0, 2).map((l, i) => `<text class="bc-no-t" x="12" y="${33 + i * 14}">${esc(l)}</text>`).join('')}<title>${esc(x.texto)}</title></g>`; }).join('');
  el.innerHTML = `<div class="bc-rolar bc-fluxo"><svg width="${larg + 140}" height="${altura}" viewBox="0 0 ${larg + 140} ${altura}"><defs><marker id="bc-ponta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>${setas}${caixas}</svg></div>`;
}
function quebrar(t, n) {
  const ls = [], ps = String(t || '').split(/\s+/);
  let l = '';
  for (const p of ps) { if ((l + ' ' + p).trim().length > n && l) { ls.push(l); l = p; } else l = (l + ' ' + p).trim(); }
  if (l) ls.push(l);
  if (ls.length > 2) ls[1] = cortar(ls.slice(1).join(' '), n);
  return ls;
}

// ---------- aba Código ----------
function pintarCodigo(el) {
  const f = B.p.firmware || {}, ling = (B.cat.linguagens[B.p.linguagem] || {}).nome || B.p.linguagem;
  const fe = B.ferr || {};
  const ferr = B.p.linguagem === 'arduino' ? (fe.pio ? `PlatformIO pronto` : 'PlatformIO não encontrado') : B.p.linguagem === 'micropython' ? (fe.mpremote ? 'mpremote pronto' : 'mpremote não encontrado') : (fe.esphome ? 'ESPHome pronto' : 'ESPHome não encontrado');
  el.innerHTML = `
    <div class="bc-codigo">
      <div class="bc-cod-barra">
        <span class="bc-chip-info">${esc(ling)}</span>
        ${(f.bibliotecas || []).map((x) => `<span class="bc-chip-info lib" title="Biblioteca">${esc(x)}</span>`).join('')}
        <span class="bc-sep"></span>
        <button class="icon-btn" data-c="copiar" title="Copiar o código">${IC.copiar}</button>
        <button class="chip" data-c="abrir" title="Abrir o arquivo no editor da IDE (salva a pasta antes)">${IC.fora}<span>Editor</span></button>
        <button class="chip" data-c="compilar" title="Compilar (salva a pasta antes)" ${B.p.linguagem !== 'arduino' ? 'hidden' : ''}>${IC.martelo}<span>Compilar</span></button>
        <button class="chip" data-c="serial" title="Monitor serial no terminal">${IC.serial}<span>Serial</span></button>
      </div>
      ${(f.configurar || []).length ? `<div class="bc-config">${IC.dica}<div><b>Antes de gravar:</b><ul>${f.configurar.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : ''}
      <pre class="bc-pre" data-pre>${esc(f.codigo || '// A IA ainda não escreveu o código.')}</pre>
      <div class="bc-console" data-console ${B.console ? '' : 'hidden'}>
        <div class="bc-console-h"><span data-console-t>${esc(B.compilando ? B.compilando.titulo : 'Saída')}</span><span class="bc-mudo">${esc(ferr)}</span><span class="bc-sep"></span><button class="chip" data-c="corrigir" ${B.consoleErro && !B.compilando ? '' : 'hidden'}>${IC.ia}<span>Corrigir com a IA</span></button><button class="icon-btn" data-c="fechar" title="Fechar a saída">${bs.I && bs.I.x ? bs.I.x : '×'}</button></div>
        <pre data-console-pre>${esc(B.console)}</pre>
      </div>
    </div>`;
  const cp = el.querySelector('[data-console-pre]'); if (cp) cp.scrollTop = cp.scrollHeight;
  el.onclick = async (e) => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    const c = b.dataset.c;
    if (c === 'copiar') { try { await navigator.clipboard.writeText(f.codigo || ''); toast('Código copiado'); } catch { toast('Não deu para copiar'); } }
    if (c === 'abrir') { const r = await exportar(false); if (r) bs.openFile(r.dir + '/' + (B.p.linguagem === 'arduino' ? 'src/main.cpp' : B.p.linguagem === 'micropython' ? 'main.py' : r.arquivos.find((x) => x.endsWith('.yaml'))), 'editor'); }
    if (c === 'compilar') compilar('compilar');
    if (c === 'serial') serial();
    if (c === 'corrigir') { const erro = B.console.split(/\r?\n/).filter((l) => /error|erro|undefined|not declared|No such file/i.test(l)).slice(-25).join('\n') || B.console.slice(-3000); B.consoleErro = false; pintarConteudo(); rodarIA('compilar', 'Erro de compilação do PlatformIO:\n' + erro); }
    if (c === 'fechar') { B.console = ''; pintarConteudo(); }
  };
}

// ---------- aba Montagem ----------
function pintarMontagem(el) {
  const feitos = new Set(B.p.feitos || []);
  const passos = B.p.montagem || [];
  el.innerHTML = `
    <div class="bc-rolar bc-texto">
      ${(B.p.seguranca || []).length ? `<div class="bc-seg">${IC.alerta}<div><b>Segurança</b><ul>${B.p.seguranca.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : ''}
      <h3>Montagem <span class="bc-mudo">${passos.filter((_, i) => feitos.has(i)).length} de ${passos.length}</span></h3>
      <ol class="bc-passos">${passos.map((x, i) => `<li><label><input type="checkbox" data-i="${i}" ${feitos.has(i) ? 'checked' : ''}><span>${md(x)}</span></label></li>`).join('') || '<li class="bc-mudo">A IA ainda não escreveu o passo a passo.</li>'}</ol>
      <p class="bc-mudo">Monte com a placa desligada do USB. Antes de ligar, confira cada fio com a aba Ligações.</p>
      ${(B.p.testes || []).length ? `<h3>Testar</h3><ul class="bc-lista">${B.p.testes.map((x) => `<li>${md(x)}</li>`).join('')}</ul>` : ''}
    </div>`;
  el.onchange = (e) => {
    const c = e.target.closest('[data-i]'); if (!c) return;
    const s = new Set(B.p.feitos || []); const i = Number(c.dataset.i);
    if (c.checked) s.add(i); else s.delete(i);
    B.p.feitos = [...s]; salvar(); pintarConteudo();
  };
}

// ---------- aba Conferência ----------
function pintarConferencia(el) {
  const c = B.a.conferencia, r = c.resumo;
  const ic = { erro: IC.erro, aviso: IC.alerta, dica: IC.dica };
  el.innerHTML = `
    <div class="bc-rolar bc-texto">
      <div class="bc-conf-topo ${r.erro ? 'err' : r.aviso ? 'warn' : 'ok'}">
        ${r.erro ? IC.erro : r.aviso ? IC.alerta : IC.ok}
        <div><b>${r.erro ? `${r.erro} erro${r.erro > 1 ? 's' : ''} elétrico${r.erro > 1 ? 's' : ''}` : r.aviso ? 'Sem erros, com avisos' : 'Nenhum problema elétrico'}</b>
        <div class="bc-mudo">Conferido por regras, sem IA: tensão de cada pino, corrente, pinos de boot, terra comum, endereços I2C, resistores e se o código usa os mesmos pinos.</div></div>
        ${r.erro || r.aviso ? `<button class="chip primary" data-corrigir ${B.run ? 'disabled' : ''}>${IC.ia}<span>Corrigir com a IA</span></button>` : ''}
      </div>
      <div class="bc-probs">${c.problemas.map((p, i) => `<div class="bc-prob ${p.nivel}">${ic[p.nivel]}<div class="bc-prob-t">${esc(p.texto)}</div>${(p.onde || []).length ? `<button class="bc-link" data-ver="${i}">Ver</button>` : ''}</div>`).join('')}</div>
      ${c.consumo.length ? `<h3>Consumo por alimentação</h3>${c.consumo.map((x) => { const pct = x.capacidade ? Math.min(100, Math.round((x.total / x.capacidade) * 100)) : 0; return `<div class="bc-consumo"><div class="bc-consumo-h"><span>${esc(x.fonte)} · ${String(x.tensao).replace('.', ',')} V</span><span class="bc-mudo">${x.total} de ${x.capacidade} mA</span></div><div class="bc-barra-c"><i class="${pct > 100 || x.total > x.capacidade ? 'err' : pct > 80 ? 'warn' : ''}" style="width:${pct}%"></i></div><div class="bc-mudo">${x.pecas.filter((p) => p.mA).map((p) => `${esc(p.nome)}: ${p.mA} mA`).join(' · ') || 'consumo desprezível'}</div></div>`; }).join('')}` : ''}
    </div>`;
  el.onclick = (e) => {
    if (e.target.closest('[data-corrigir]')) { const ps = problemasParaCorrigir(); if (!ps.length) { B.cfg = { ...B.cfg, corrigirAvisos: true }; } msg('sis', 'Pedindo a correção dos problemas da conferência…'); return rodarIA('corrigir', ''); }
    const v = e.target.closest('[data-ver]'); if (v) { const p = c.problemas[Number(v.dataset.ver)]; focar(p.onde); }
  };
}

// ---------- aba Pinos ----------
function pintarPinos(el) {
  const ps = B.a.conferencia.pinos;
  const linhas = (B.a.layout ? B.a.layout.placa.pinos : []).filter((x) => x.gpio != null);
  const nomesCap = { adc: 'ADC', adc2: 'ADC2', pwm: 'PWM', dac: 'DAC', touch: 'toque', strap: 'boot', serial: 'serial', evitar: 'ocupado' };
  el.innerHTML = `
    <div class="bc-rolar">
      <div class="bc-cab"><h3>${esc(placaNome(B.p.placa))}</h3><span class="bc-mudo">${linhas.filter((x) => (ps[x.nome] || {}).estado === 'livre').length} pinos livres</span></div>
      <div class="bc-tabela-w"><table class="bc-tabela bc-pinos">
        <thead><tr><th>Pino</th><th class="num">GPIO</th><th>Faz</th><th>Ligado em</th></tr></thead>
        <tbody>${linhas.map((x) => { const p = ps[x.nome] || { caps: [], uso: [] }; const caps = p.caps || []; return `<tr class="${p.estado}"><td><b>${esc(x.nome)}</b></td><td class="num">${x.gpio}</td><td>${!caps.includes('out') && caps.includes('in') ? '<span class="bc-cap warn">só entrada</span>' : ''}${caps.filter((k) => nomesCap[k]).map((k) => `<span class="bc-cap${['strap', 'serial', 'evitar'].includes(k) ? ' warn' : ''}">${nomesCap[k]}</span>`).join('')}${p.nota ? `<div class="bc-mudo">${esc(p.nota)}</div>` : ''}</td><td>${p.uso.length ? esc(p.uso.join(', ')) : '<span class="bc-mudo">livre</span>'}</td></tr>`; }).join('')}</tbody>
      </table></div>
    </div>`;
}

// ---------- exportar, simular, compilar ----------
async function pastaBase() {
  if (B.cfg.pasta && String(B.cfg.pasta).trim()) return String(B.cfg.pasta).trim();
  if (!B.pasta) B.pasta = (await chamar('pasta-padrao')).pasta;
  return B.pasta;
}
async function exportar(avisar) {
  if (!B.p || !(B.p.pecas || []).length) { toast('Projete algo primeiro.'); return null; }
  try {
    const r = await chamar('exportar', { projeto: B.p, pasta: await pastaBase() });
    B.p.pasta = r.dir; salvar();
    if (avisar) { toast(`Projeto salvo em ${r.dir}`); chamar('mostrar-pasta', { dir: r.dir }).catch(() => {}); }
    return r;
  } catch (e) { toast('BlueCircuito: ' + e.message); return null; }
}
async function simular() {
  if (!B.a) return;
  if (!B.a.wokwi.ok) return toast(B.a.wokwi.motivo || 'Esta placa não tem simulação no Wokwi.');
  try {
    const r = await chamar('wokwi', { projeto: B.p });
    await navigator.clipboard.writeText(r.json);
    const novo = { 'esp32-devkit': 'esp32', 'arduino-uno': 'arduino-uno', 'rpi-pico': 'pi-pico', 'rpi-pico-w': 'pi-pico-w' }[B.p.placa] || 'esp32';
    chamar('abrir', { url: 'https://wokwi.com/projects/new/' + novo }).catch(() => {});
    msg('sis', `Diagrama do Wokwi copiado. No Wokwi: abra a aba **diagram.json**, apague tudo e cole; depois cole o código da aba Código no **sketch.ino**.${r.faltam.length ? ` O Wokwi não tem: ${r.faltam.join(', ')} (ficaram de fora).` : ''}`);
  } catch (e) { toast('BlueCircuito: ' + e.message); }
}
async function ferramentas() { B.ferr = await chamar('ferramentas').catch(() => ({})); return B.ferr; }
async function compilar(qual) {
  if (B.compilando) return toast('Já está compilando.');
  const ling = B.p.linguagem;
  const f = await ferramentas();
  const r = await exportar(false); if (!r) return;
  let prog, args, cwd = r.dir, titulo;
  if (ling === 'arduino') {
    if (!f.pio) return faltaFerramenta('PlatformIO', f.python ? 'pip install -U platformio' : 'winget install Python.Python.3.12', 'O PlatformIO compila e grava o código (baixa sozinho o que a placa precisa na primeira vez).');
    prog = f.pio; args = qual === 'upload' ? ['run', '-t', 'upload', '-d', r.dir] : ['run', '-d', r.dir]; titulo = qual === 'upload' ? 'Compilando e gravando' : 'Compilando';
  } else if (ling === 'micropython') {
    if (!f.mpremote) return faltaFerramenta('mpremote', 'pip install mpremote', 'O mpremote copia o main.py para a placa com MicroPython.');
    prog = f.mpremote; args = ['connect', 'auto', 'cp', 'main.py', ':main.py', '+', 'reset']; titulo = 'Copiando para a placa';
  } else {
    if (!f.esphome) return faltaFerramenta('ESPHome', 'pip install esphome', 'O ESPHome compila e grava o dispositivo.');
    bs.terminal.run(`cd "${r.dir}" && "${f.esphome}" run ${r.arquivos.find((x) => x.endsWith('.yaml'))}`);
    return;
  }
  B.compilando = { titulo }; B.console = `> ${titulo} em ${r.dir}\n`; B.consoleErro = false;
  if (B.aba !== 'codigo') trocarAba('codigo'); else pintarConteudo();
  const pre = () => R.pg && R.pg.querySelector('[data-console-pre]');
  let t = 0;
  const atualizar = () => { clearTimeout(t); t = setTimeout(() => { const p = pre(); if (p) { p.textContent = B.console; p.scrollTop = p.scrollHeight; } }, 120); };
  try {
    const h = await plugin.spawn(prog, args, { cwd, label: 'BlueCircuito · ' + titulo, onData: (x) => { B.console = (B.console + x).slice(-200000); atualizar(); } });
    const code = await h.done;
    B.consoleErro = code !== 0;
    B.console += code === 0 ? `\n✓ ${qual === 'upload' ? 'Gravado na placa.' : 'Compilou sem erro.'}\n` : `\n✗ Falhou (código ${code}).${qual === 'upload' && /upload|port|serial|COM\d/i.test(B.console.slice(-2000)) ? ' Confira o cabo USB (de dados), a porta e, no ESP32, segure o botão BOOT quando aparecer "Connecting...".' : ''}\n`;
  } catch (e) { B.console += '\n' + e.message + '\n'; B.consoleErro = true; }
  B.compilando = null;
  if (B.aba === 'codigo') pintarConteudo();
}
function faltaFerramenta(nome, cmd, porque) {
  msg('sis', `${porque} Ele não está instalado: rodei \`${cmd}\` no terminal. Quando terminar, clique de novo.`);
  bs.terminal.run(cmd);
}
async function serial() {
  const f = await ferramentas();
  if (B.p.linguagem === 'arduino' && f.pio) { const r = await exportar(false); if (r) bs.terminal.run(`"${f.pio}" device monitor -b 115200 -d "${r.dir}"`); return; }
  if (f.mpremote) return bs.terminal.run(`"${f.mpremote}" connect auto repl`);
  if (f.pio) return bs.terminal.run(`"${f.pio}" device monitor -b 115200`);
  faltaFerramenta('PlatformIO', 'pip install -U platformio', 'O monitor serial usa o PlatformIO.');
}

// ---------- diálogos ----------
function dialogo(html, montarDlg) {
  return new Promise((fim) => {
    const d = R.pg && R.pg.querySelector('[data-dlg]'); if (!d) return fim(null);
    d.innerHTML = `<div class="bc-dlg-caixa" role="dialog" aria-modal="true">${html}</div>`;
    d.hidden = false;
    const fechar = (v) => { d.hidden = true; d.innerHTML = ''; document.removeEventListener('keydown', tecla, true); fim(v); };
    const tecla = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(null); } };
    document.addEventListener('keydown', tecla, true);
    d.onpointerdown = (e) => { if (e.target === d) fechar(null); };
    d.querySelectorAll('[data-cancelar]').forEach((b) => (b.onclick = () => fechar(null)));
    montarDlg(d.firstElementChild, fechar);
  });
}
function confirmar(texto, botao) {
  if (!R.pg || !R.pg.querySelector('[data-dlg]')) return Promise.resolve(true);
  return dialogo(`<p class="bc-dlg-t">${esc(texto)}</p><div class="bc-dlg-b"><button class="chip" data-cancelar>Cancelar</button><button class="chip primary danger" data-sim>${esc(botao)}</button></div>`, (el, fechar) => {
    el.querySelector('[data-sim]').onclick = () => fechar(true); el.querySelector('[data-sim]').focus();
  });
}
function perguntar(texto, valor) {
  return dialogo(`<p class="bc-dlg-t">${esc(texto)}</p><input class="bc-dlg-in" data-v value="${esc(valor)}" spellcheck="false"><div class="bc-dlg-b"><button class="chip" data-cancelar>Cancelar</button><button class="chip primary" data-sim>Salvar</button></div>`, (el, fechar) => {
    const i = el.querySelector('[data-v]'); i.focus(); i.select();
    i.onkeydown = (e) => { if (e.key === 'Enter') fechar(i.value); };
    el.querySelector('[data-sim]').onclick = () => fechar(i.value);
  });
}

// ---------- painel da esquerda ----------
const lado = document.createElement('div');
lado.className = 'bc-lado';
function pintarLado() {
  lado.innerHTML = `
    <div class="bc-lado-h"><span>Projetos</span><button class="icon-btn" data-novo title="Novo projeto">${IC.mais}</button></div>
    ${B.lista.map((x) => `<div class="bc-item${B.p && x.id === B.p.id ? ' on' : ''}" data-id="${esc(x.id)}" tabindex="0" role="button" title="${esc(placaNome(x.placa))} · ${esc(quando(x.alterado))}"><span class="nm">${esc(x.nome)}</span><button class="icon-btn bc-item-x" data-apagar="${esc(x.id)}" title="Apagar o projeto" aria-label="Apagar ${esc(x.nome)}">${IC.lixo}</button></div>`).join('') || '<div class="bc-mudo bc-pad">Nenhum ainda.</div>'}`;
}
lado.onclick = (e) => {
  const ap = e.target.closest('[data-apagar]'); if (ap) { e.stopPropagation(); abrirPagina(); return apagarProjeto(ap.dataset.apagar); }
  if (e.target.closest('[data-novo]')) { abrirPagina(); return novoProjeto(); }
  const it = e.target.closest('[data-id]'); if (it) { abrirPagina(); abrirProjeto(it.dataset.id); }
};
lado.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.bc-item')) { e.preventDefault(); e.target.click(); } };
function abrirPagina() { if (!bs.pages.isActive('bluecircuito')) bs.pages.open('bluecircuito'); }

// ---------- início ----------
let iniciando = null;
function iniciar() {
  if (!iniciando) iniciando = (async () => {
    B.cfg = await plugin.settings.get().catch(() => ({}));
    await catalogo().catch((e) => toast('BlueCircuito: ' + e.message));
    await carregarLista();
    B.aba = (await plugin.data.get('aba', 'ligacoes').catch(() => 'ligacoes')) || 'ligacoes';
    if (!ABAS.some(([k]) => k === B.aba)) B.aba = 'ligacoes';
    const atual = await plugin.data.get('atual', null).catch(() => null);
    pintarLado();
    if (atual && B.lista.some((x) => x.id === atual)) await abrirProjeto(atual);
    else if (B.lista[0]) await abrirProjeto(B.lista[0].id);
    else novoProjeto();
    ferramentas().catch(() => {});
  })();
  return iniciando;
}
plugin.settings.onChange((v) => { B.cfg = v || {}; if (R.pg && R.pg.querySelector('[data-hero]')) pintar(); });

bs.tools.register({ id: 'bluecircuito', title: 'BlueCircuito', icon: ICON, order: 74, page: 'bluecircuito', render() { pintarLado(); bs.$('#toolBody').replaceChildren(lado); iniciar(); } });
bs.pages.register({
  id: 'bluecircuito', title: 'BlueCircuito', icon: ICON, pinned: true, render: montar,
  show() { iniciar().then(() => pintar()); },
  hide() { salvar(true); },
});
bs.actions.add([
  { label: 'BlueCircuito: abrir', icon: ICON, run: () => { abrirPagina(); iniciar(); } },
  { label: 'BlueCircuito: novo projeto', icon: ICON, run: () => { abrirPagina(); iniciar().then(novoProjeto); } },
]);
plugin.onUnload(() => { clearInterval(relogio); clearTimeout(salvarT); if (B.p) salvar(true); if (B.run) parar(); });
