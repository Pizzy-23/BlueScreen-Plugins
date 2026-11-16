// Onde cada coisa fica no diagrama de ligações: a placa no meio, com os pinos dos dois lados como na placa de
// verdade, e as peças em colunas, do lado dos pinos em que estão ligadas e na altura deles (fios curtos, sem cruzar
// à toa). A página desenha os fios e deixa arrastar as peças; posição arrastada fica no projeto.
import { PLACAS, PECAS, pinosDa, acharPinoPlaca } from './catalogo.mjs';

const PASSO = 18, TOPO = 46, PECA_L = 156, PECA_TOPO = 34, PECA_PASSO = 17, VAO = 130;

export function layout(p, conferencia) {
  const placa = PLACAS[p.placa];
  if (!placa) return null;
  const esq = placa.esquerda, dir = placa.direita;
  const W = 176, H = TOPO + Math.max(esq.length, dir.length) * PASSO + 14;
  const estado = (conferencia && conferencia.pinos) || {};
  const pinos = pinosDa(placa).map((x) => {
    const i = (x.lado === 'e' ? esq : dir).findIndex((y) => y.nome === x.nome);
    return { nome: x.nome, gpio: x.gpio ?? null, tipo: x.tipo || 'gpio', lado: x.lado, x: x.lado === 'e' ? 0 : W, y: TOPO + i * PASSO + PASSO / 2, estado: (estado[x.nome] || {}).estado || (x.tipo ? 'forca' : 'livre') };
  });
  const pinoY = Object.fromEntries(pinos.map((x) => [x.nome, x]));

  // vizinhos de cada peça (placa ou outras peças), para achar o lado e a altura
  const viz = new Map((p.pecas || []).map((pc) => [pc.id, []]));
  const ponto = (s) => {
    const t = String(s), i = t.lastIndexOf(':'), quem = t.slice(0, i), pino = t.slice(i + 1);
    if (/^(placa|board|mcu|esp|esp32|arduino|uno|pico)$/i.test(quem)) { const pp = acharPinoPlaca(placa, pino); return pp ? { placa: pinoY[pp.nome] } : null; }
    return viz.has(quem) ? { peca: quem, pino } : null;
  };
  for (const l of p.ligacoes || []) {
    const a = ponto(l.de), b = ponto(l.para);
    if (!a || !b) continue;
    if (a.peca) viz.get(a.peca).push(b);
    if (b.peca) viz.get(b.peca).push(a);
  }
  // lado e altura desejada: média dos pinos da placa ligados (alimentação pesa pouco: GND está nos dois lados)
  const alvo = new Map();
  const calcular = (id, visto = new Set()) => {
    if (alvo.has(id)) return alvo.get(id);
    if (visto.has(id)) return null;
    visto.add(id);
    let se = 0, sd = 0, sy = 0, n = 0;
    for (const v of viz.get(id) || []) {
      if (v.placa) { const w = v.placa.tipo === 'gpio' ? 3 : 0.3; if (v.placa.lado === 'e') se += w; else sd += w; sy += v.placa.y * w; n += w; }
      else { const o = calcular(v.peca, visto); if (o) { const w = 1; if (o.lado === 'e') se += w; else sd += w; sy += o.y * w; n += w; } }
    }
    const r = n ? { lado: se > sd ? 'e' : 'd', y: sy / n } : null;
    if (r) alvo.set(id, r);
    return r;
  };
  for (const id of viz.keys()) calcular(id);

  const pecas = (p.pecas || []).map((pc) => {
    const c = PECAS[pc.tipo] || { nome: pc.tipo, pinos: [] };
    const a = alvo.get(pc.id) || { lado: 'd', y: H / 2 };
    const h = PECA_TOPO + c.pinos.length * PECA_PASSO + 8;
    return { id: pc.id, tipo: pc.tipo, nome: pc.rotulo || c.nome, modelo: c.nome, valor: pc.valor || '', lado: a.lado, desejado: a.y - h / 2, w: PECA_L, h,
      pinos: c.pinos.map((x, i) => ({ nome: x.nome, papel: x.papel, opcional: !!x.opcional, dy: PECA_TOPO + i * PECA_PASSO + PECA_PASSO / 2 })) };
  });
  // empilha cada lado sem sobrepor, perto da altura desejada; lado cheio demais abre uma segunda coluna
  for (const lado of ['e', 'd']) {
    const col = pecas.filter((x) => x.lado === lado).sort((a, b) => a.desejado - b.desejado);
    const limite = Math.max(H * 1.6, 520);
    let coluna = 0, fim = -Infinity, usado = 0;
    for (const x of col) {
      if (usado + x.h > limite && usado > 0) { coluna++; fim = -Infinity; usado = 0; }
      const y = Math.max(x.desejado, fim + 16);
      const dx = VAO + coluna * (PECA_L + 70);
      x.x = lado === 'e' ? -dx - PECA_L : W + dx;
      x.y = y; fim = y + x.h; usado += x.h + 16;
      x.pinoX = lado === 'e' ? PECA_L : 0;
    }
  }
  const pos = p.posicoes || {};
  for (const x of pecas) {
    if (pos[x.id] && Number.isFinite(pos[x.id].x) && Number.isFinite(pos[x.id].y)) { x.x = pos[x.id].x; x.y = pos[x.id].y; x.pinoX = x.x + PECA_L / 2 < W / 2 ? PECA_L : 0; }
    delete x.desejado;
  }
  return { placa: { nome: placa.nome, x: 0, y: 0, w: W, h: H, pinos }, pecas };
}
