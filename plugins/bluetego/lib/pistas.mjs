// Bluetego: o grafo "pensando" sem IA. Regras que um investigador aplicaria olhando o grafo: ligações óbvias que
// faltam, infraestrutura que une domínios diferentes, e-mails que parecem de uma pessoa do grafo e o que vale rodar
// em seguida. Cada pista traz a ação pronta (ligar, rodar), e a página só pergunta se a pessoa quer aplicar.
import { apelidosDeNome, ehIP, cpfCombina } from './entidades.mjs';

const SUFIXO_DUPLO = /^(com|net|org|gov|edu|co|ac|art|blog|eco|ind|inf|adv|eng|med|nom|tv)\.[a-z]{2}$/;
// a parte registrável: www.loja.exemplo.com.br -> exemplo.com.br
export function base(dominio) {
  const l = String(dominio).toLowerCase().split('.');
  return l.slice(l.length >= 3 && SUFIXO_DUPLO.test(l.slice(-2).join('.')) ? -3 : -2).join('.');
}
const ip4 = (s) => String(s).split('.').reduce((a, x) => a * 256 + Number(x), 0);
export function dentroDaRede(ip, cidr) {
  const [rede, bits] = String(cidr).split('/');
  const n = Number(bits);
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || !/^\d+\.\d+\.\d+\.\d+$/.test(rede) || !(n >= 0 && n <= 32)) return false;
  // sem operadores de bits: em JavaScript eles cortam em 32 bits com sinal
  const passo = 2 ** (32 - n);
  return Math.floor(ip4(ip) / passo) === Math.floor(ip4(rede) / passo);
}
// nome de organização sem a forma jurídica: "Google LLC" e "Google Inc." viram "google"
const nucleo = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(ltda|s\.?a\.?|eireli|me|epp|inc|llc|ltd|limited|gmbh|ag|corp(oration)?|co|company|group|grupo|holdings?)\b\.?/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// aprendizado: { "tipo|transformação": { n: vezes, a: resultados } }, o que o uso desta IDE já mostrou
export const rendimento = (ap, tipo, t) => { const x = ap && ap[tipo + '|' + t]; return x && x.n ? x.a / x.n : null; };
export function pensar(grafo, transformacoes = [], aprendizado = {}) {
  const nos = new Map((grafo.nos || []).map((n) => [n.id, n]));
  const adj = new Map([...nos.keys()].map((id) => [id, new Set()]));
  const ligado = new Set();
  for (const l of grafo.ligacoes || []) {
    if (!adj.has(l.de) || !adj.has(l.para)) continue;
    adj.get(l.de).add(l.para); adj.get(l.para).add(l.de);
    ligado.add(l.de + '|' + l.para); ligado.add(l.para + '|' + l.de);
  }
  const rot = (id) => { const n = nos.get(id); return n ? n.rotulo || n.valor : id; };
  const porTipo = (t) => [...nos.values()].filter((n) => n.tipo === t);
  const porValor = new Map([...nos.values()].map((n) => [n.tipo + ':' + String(n.valor).toLowerCase(), n]));
  const ache = (t, v) => porValor.get(t + ':' + String(v).toLowerCase());
  const pistas = [];
  let sugeridas = 0;
  const sugerir = (de, para, rotulo, motivo) => {
    if (!de || !para || de === para || ligado.has(de + '|' + para) || sugeridas >= 60) return;
    ligado.add(de + '|' + para); ligado.add(para + '|' + de); sugeridas++;
    pistas.push({ tipo: 'ligacao', titulo: `${rot(de)} → ${rot(para)}`, texto: motivo, entidades: [de, para], acao: { tipo: 'ligar', de, para, rotulo } });
  };

  // ---------- ligações óbvias que faltam ----------
  for (const e of porTipo('email')) { const d = ache('dominio', String(e.valor).split('@')[1]); if (d) sugerir(e.id, d.id, 'domínio do e-mail', 'O domínio deste e-mail está no grafo.'); }
  for (const u of [...porTipo('url'), ...porTipo('conta')]) {
    let h = ''; try { h = new URL(u.valor).hostname.replace(/^www\./, ''); } catch {}
    const d = h && (ache('dominio', h) || ache('dominio', 'www.' + h) || ache('ip', h));
    if (d) sugerir(u.id, d.id, 'hospedado em', 'A URL aponta para este endereço, que já está no grafo.');
  }
  for (const s of porTipo('dominio')) {
    const partes = String(s.valor).split('.');
    for (let i = 1; i < partes.length - 1; i++) {
      const pai = ache('dominio', partes.slice(i).join('.'));
      if (pai) { sugerir(s.id, pai.id, 'subdomínio de', `${s.valor} fica dentro de ${pai.valor}.`); break; }
    }
  }
  const redes = porTipo('rede');
  for (const ip of porTipo('ip')) for (const r of redes) if (dentroDaRede(ip.valor, r.valor)) sugerir(ip.id, r.id, 'dentro do bloco', `${ip.valor} pertence a ${r.valor}.`);
  // organizações com o mesmo nome por baixo da forma jurídica
  const orgs = porTipo('organizacao'), vistas = new Map();
  for (const o of orgs) {
    const k = nucleo(o.valor);
    if (k.length < 3) continue;
    if (vistas.has(k)) sugerir(o.id, vistas.get(k), 'mesma organização', `"${o.valor}" e "${rot(vistas.get(k))}" parecem a mesma organização.`);
    else vistas.set(k, o.id);
  }
  // o valor de uma entidade aparece nas propriedades de outra
  const procuraveis = [...nos.values()].filter((n) => !['texto', 'local', 'tecnologia'].includes(n.tipo) && String(n.valor).length >= 6);
  for (const a of nos.values()) {
    const texto = Object.entries(a.props || {}).filter(([k]) => k !== 'completo').map(([, v]) => String(v)).join(' \u0001 ').toLowerCase();
    if (!texto) continue;
    for (const b of procuraveis) if (b.id !== a.id && texto.includes(String(b.valor).toLowerCase())) sugerir(a.id, b.id, 'citado nas propriedades', `As propriedades de ${rot(a.id)} citam ${b.valor}.`);
  }
  // e-mail que parece ser de uma pessoa do grafo (ana.souza@ ↔ Ana Souza)
  const pessoas = porTipo('pessoa');
  for (const e of porTipo('email')) {
    const local = String(e.valor).split('@')[0].toLowerCase().replace(/\d+$/, '');
    for (const p of pessoas) if (apelidosDeNome(p.valor).includes(local)) sugerir(p.id, e.id, 'parece ser o e-mail de', `O começo do e-mail (${local}) combina com o nome ${p.valor}.`);
  }
  // CPF do grafo × CPF mascarado que a Receita publica dos sócios (***912137**): os 6 dígitos do meio batem
  for (const c of porTipo('cpf')) for (const p of pessoas) if (cpfCombina(c.valor, (p.props || {})['CPF na Receita'])) sugerir(c.id, p.id, 'CPF do sócio', `Os dígitos do meio do CPF batem com o CPF que a Receita mostra para ${p.valor}. Confirme pelo nome antes de concluir.`);
  for (const a of porTipo('apelido')) for (const p of pessoas) if (apelidosDeNome(p.valor).includes(String(a.valor).toLowerCase())) sugerir(p.id, a.id, 'parece ser o apelido de', `"${a.valor}" combina com o nome ${p.valor}.`);

  // ---------- infraestrutura compartilhada ----------
  const FRASE = { ip: 'o mesmo servidor', rede: 'o mesmo bloco de endereços', asn: 'o mesmo sistema autônomo', organizacao: 'a mesma organização', email: 'o mesmo e-mail', pessoa: 'a mesma pessoa', telefone: 'o mesmo telefone', cnpj: 'o mesmo CNPJ', tecnologia: 'a mesma tecnologia', rastreador: 'o mesmo ID de rastreamento (Analytics, AdSense)', dominio: 'o mesmo servidor de nomes ou de e-mail' };
  const porFrase = new Map();
  for (const x of nos.values()) {
    if (!FRASE[x.tipo]) continue;
    const doms = [...adj.get(x.id)].map((id) => nos.get(id)).filter((n) => n && n.tipo === 'dominio');
    const bases = [...new Set(doms.map((d) => base(d.valor)))].filter((b) => x.tipo !== 'dominio' || b !== base(x.valor));
    if (bases.length < 2 || (x.tipo === 'tecnologia' && bases.length < 3)) continue;
    (porFrase.get(x.tipo) || porFrase.set(x.tipo, []).get(x.tipo)).push({ tipo: 'descoberta', titulo: `${bases.length} domínios diferentes com ${FRASE[x.tipo]}`, texto: `${rot(x.id)} liga ${bases.slice(0, 6).join(', ')}${bases.length > 6 ? '…' : ''}. Domínios com ${FRASE[x.tipo]} costumam ter o mesmo dono ou a mesma operação.`, entidades: [x.id, ...doms.map((d) => d.id)].slice(0, 30), peso: bases.length });
  }
  // por tipo, as três mais fortes; o resto numa pista só (12 IPs de CDN não viram 12 pistas)
  for (const [t, l] of porFrase) {
    l.sort((a, b) => b.peso - a.peso);
    pistas.push(...l.slice(0, 3));
    if (l.length > 3) {
      const resto = l.slice(3);
      pistas.push({ tipo: 'descoberta', titulo: `Mais ${resto.length} casos de domínios com ${FRASE[t]}`, texto: `${resto.map((p) => rot(p.entidades[0])).slice(0, 8).join(', ')}${resto.length > 8 ? '…' : ''}. Costuma ser hospedagem ou serviço em comum (CDN, provedor de e-mail).`, entidades: resto.map((p) => p.entidades[0]).slice(0, 30), peso: 0 });
    }
  }

  // ---------- alertas ----------
  const alertas = [...nos.values()].filter((n) => n.alerta);
  if (alertas.length) {
    const por = {};
    for (const a of alertas) por[a.tipo] = (por[a.tipo] || 0) + 1;
    pistas.push({ tipo: 'alerta', titulo: `${alertas.length} ${alertas.length === 1 ? 'ponto de atenção' : 'pontos de atenção'}`, texto: Object.entries(por).map(([t, q]) => `${q} ${t}`).join(', ') + '. Comece por eles.', entidades: alertas.map((a) => a.id).slice(0, 30) });
  }

  // ---------- próximos passos ----------
  // as rápidas, primeiro as que mais renderam neste tipo; uma que nunca rende (já rodou 5 vezes sem nada) sai
  const rapidas = (t) => transformacoes.filter((x) => x.rapida && x.de.includes(t)).filter((x) => { const ap = aprendizado[t + '|' + x.id]; return !(ap && ap.n >= 5 && ap.a === 0); }).sort((a, b) => (rendimento(aprendizado, t, b.id) ?? 1) - (rendimento(aprendizado, t, a.id) ?? 1));
  const candidatos = [...nos.values()]
    .map((n) => ({ n, faltam: rapidas(n.tipo).filter((t) => !(n.feitas || []).includes(t.id)), peso: (n.alerta ? 50 : 0) + adj.get(n.id).size * 3 + ((n.feitas || []).length ? 0 : 10) }))
    // "Nome de usuário da conta" numa conta que já está ligada a um apelido só devolveria o mesmo apelido
    .map((c) => ({ ...c, faltam: c.faltam.filter((t) => !(t.id === 'conta-apelido' && [...adj.get(c.n.id)].some((v) => (nos.get(v) || {}).tipo === 'apelido'))) }))
    .filter((c) => c.faltam.length)
    .sort((a, b) => b.peso - a.peso)
    .slice(0, 8);
  for (const { n, faltam } of candidatos) {
    const t = faltam[0];
    const rend = rendimento(aprendizado, n.tipo, t.id);
    pistas.push({ tipo: 'proximo', titulo: `${t.nome}: ${n.rotulo || n.valor}`, texto: (rend != null ? `Costuma trazer ${rend >= 10 ? Math.round(rend) : rend.toFixed(1).replace('.', ',')} resultados aqui. ` : '') + (n.alerta ? 'Entidade com alerta ainda pouco explorada.' : adj.get(n.id).size >= 3 ? 'Entidade central da investigação, ainda sem esta transformação.' : (n.feitas || []).length ? `Faltam ${faltam.length} transformações rápidas.` : 'Ainda não foi explorada.'), entidades: [n.id], acao: { tipo: 'rodar', id: n.id, t: t.id } });
  }
  const isoladas = [...nos.values()].filter((n) => !adj.get(n.id).size);
  if (isoladas.length >= 2) pistas.push({ tipo: 'descoberta', titulo: `${isoladas.length} entidades soltas`, texto: 'Não se ligam a nada. Rode transformações nelas ou ligue à mão (botão Ligar, ou Alt + arrastar de uma para a outra).', entidades: isoladas.map((n) => n.id).slice(0, 30) });

  const ordem = { alerta: 0, descoberta: 1, ligacao: 2, proximo: 3 };
  return pistas.sort((a, b) => ordem[a.tipo] - ordem[b.tipo] || (b.peso || 0) - (a.peso || 0));
}
