// Bluetego: o grafo "pensando" sem IA. Regras que um investigador aplicaria olhando o grafo: ligações óbvias que
// faltam, infraestrutura que une domínios diferentes, e-mails que parecem de uma pessoa do grafo e o que vale rodar
// em seguida. Cada pista traz a ação pronta (ligar, rodar), e a página só pergunta se a pessoa quer aplicar.
// Poucas e acionáveis: cada regra tem teto, e uma entidade não recebe duas sugestões de rodar.
import { apelidosDeNome, cpfCombina, cpfValido } from './entidades.mjs';

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
const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// nome de organização sem a forma jurídica: "Google LLC" e "Google Inc." viram "google"
const nucleo = (s) => semAcento(s).replace(/\b(ltda|s\.?a\.?|eireli|me|epp|inc|llc|ltd|limited|gmbh|ag|corp(oration)?|co|company|group|grupo|holdings?)\b\.?/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// nome de pessoa em palavras, sem acento e sem "da", "de", "dos"
const palavras = (s) => semAcento(s).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((x) => x.length > 1 && !['da', 'de', 'do', 'das', 'dos', 'e'].includes(x));
// "v" aparece no texto como valor inteiro: 10.0.0.5 não está em 10.0.0.55, exemplo.com não está em exemplo.com.br
const ALNUM = /[a-z0-9]/;
export function cita(texto, v) {
  if (!v) return false;
  for (let i = texto.indexOf(v); i >= 0; i = texto.indexOf(v, i + 1)) {
    const antes = texto[i - 1] || ' ', depois = texto[i + v.length] || ' ', depois2 = texto[i + v.length + 1] || ' ';
    if (ALNUM.test(antes) || antes === '.' || antes === '-') continue;
    if (ALNUM.test(depois) || depois === '-' || ((depois === '.' || depois === '@') && ALNUM.test(depois2))) continue;
    return true;
  }
  return false;
}

// aprendizado: { "tipo|transformação": { n: vezes, a: resultados } }, o que o uso desta IDE já mostrou.
// Lido com cuidado: valor torto (texto, negativo, NaN) vira "sem dado", e não bagunça a ordem.
const numero = (x) => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN);
export const rendimento = (ap, tipo, t) => {
  const k = tipo + '|' + t;
  const x = ap && typeof ap === 'object' && Object.hasOwn(ap, k) ? ap[k] : null;
  if (!x || typeof x !== 'object') return null;
  const n = numero(x.n), a = numero(x.a);
  return Number.isFinite(n) && n > 0 && Number.isFinite(a) && a >= 0 ? a / n : null;
};
// para quem guarda o aprendizado: o contador não cresce sem fim (passou do teto, n e a encolhem na mesma proporção, a
// média fica e o uso recente pesa mais), entrada torta sai, e o total de chaves tem limite
export function limparAprendizado(ap, teto = 50, maxChaves = 1500) {
  const out = {};
  if (!ap || typeof ap !== 'object') return out;
  for (const k of Object.keys(ap)) {
    if (!/^[a-z]+\|[a-z0-9-]+$/.test(k)) continue;
    const r = rendimento(ap, ...k.split('|'));
    if (r == null) continue;
    const n = Math.min(numero(ap[k].n), teto);
    out[k] = { n: Math.round(n), a: Math.round(r * Math.round(n) * 10) / 10 };
    if (Object.keys(out).length >= maxChaves) break;
  }
  return out;
}

// transformações que as pistas nunca sugerem: o tellows aumenta um contador público a cada consulta
const NUNCA_SUGERIR = new Set(['tellows']);
const ORDEM = { alerta: 0, descoberta: 1, ligacao: 2, proximo: 3 };

export function pensar(grafo, transformacoes = [], aprendizadoBruto = {}) {
  const aprendizado = limparAprendizado(aprendizadoBruto, Infinity, Infinity);
  const nos = new Map((grafo.nos || []).filter((n) => n && n.id != null).map((n) => [n.id, n]));
  const adj = new Map([...nos.keys()].map((id) => [id, new Set()]));
  const ligado = new Set(), rotuloLig = new Map();
  for (const l of grafo.ligacoes || []) {
    if (!l || !adj.has(l.de) || !adj.has(l.para) || l.de === l.para) continue;
    adj.get(l.de).add(l.para); adj.get(l.para).add(l.de);
    ligado.add(l.de + '|' + l.para); ligado.add(l.para + '|' + l.de);
    const r = String(l.rotulo || '');
    rotuloLig.set(l.de + '|' + l.para, r); rotuloLig.set(l.para + '|' + l.de, r);
  }
  const rot = (id) => { const n = nos.get(id); return n ? n.rotulo || n.valor : id; };
  const tiposDe = new Map();
  for (const n of nos.values()) (tiposDe.get(n.tipo) || tiposDe.set(n.tipo, []).get(n.tipo)).push(n);
  const porTipo = (t) => tiposDe.get(t) || [];
  const porValor = new Map([...nos.values()].map((n) => [n.tipo + ':' + String(n.valor).toLowerCase(), n]));
  const ache = (t, v) => porValor.get(t + ':' + String(v).toLowerCase());
  const vizinhos = (id, tipo) => [...adj.get(id)].map((v) => nos.get(v)).filter((v) => v && (!tipo || v.tipo === tipo));
  const pistas = [];

  // só sugere rodar o que existe no catálogo, serve para o tipo (e para o valor) e ainda não rodou nesta entidade
  const cat = new Map(transformacoes.map((t) => [t.id, t]));
  const feitas = (n) => (Array.isArray(n.feitas) ? n.feitas : []);
  const pode = (n, id) => {
    const t = cat.get(id);
    return !!t && !t.cofre && !NUNCA_SUGERIR.has(id) && t.de.includes(n.tipo) && !(t.so && !t.so.test(String(n.valor))) && !feitas(n).includes(id);
  };
  const jaRodar = new Set(); // entidades que já ganharam uma sugestão de rodar
  const rodar = (n, id, titulo, texto, peso, tipo = 'proximo', extra = []) => {
    if (!n || jaRodar.has(n.id) || !pode(n, id)) return false;
    jaRodar.add(n.id);
    pistas.push({ tipo, titulo, texto, entidades: [n.id, ...extra.filter((x) => x !== n.id)].slice(0, 30), acao: { tipo: 'rodar', id: n.id, t: id }, peso });
    return true;
  };

  let sugeridas = 0;
  const sugerir = (de, para, rotulo, motivo, peso = 0) => {
    if (!de || !para || de === para || !nos.has(de) || !nos.has(para) || ligado.has(de + '|' + para) || sugeridas >= 60) return;
    ligado.add(de + '|' + para); ligado.add(para + '|' + de); sugeridas++;
    pistas.push({ tipo: 'ligacao', titulo: `${rot(de)} → ${rot(para)}`, texto: motivo, entidades: [de, para], acao: { tipo: 'ligar', de, para, rotulo }, peso });
  };

  // ---------- ligações óbvias que faltam (as mais fortes primeiro: o teto de 60 corta as fracas) ----------
  const pessoas = porTipo('pessoa');
  // CPF do grafo × CPF mascarado que a Receita publica dos sócios (***912137**): os 6 dígitos do meio batem
  for (const c of porTipo('cpf')) {
    if (!cpfValido(c.valor)) continue;
    for (const p of pessoas) if (cpfCombina(c.valor, (p.props || {})['CPF na Receita'])) sugerir(c.id, p.id, 'CPF do sócio', `Os dígitos do meio do CPF batem com o CPF que a Receita mostra para ${p.valor}. Confirme pelo nome antes de concluir.`, 5);
  }
  // a mesma pessoa vinda de fontes diferentes: "João Silva" e "JOAO SILVA" (acento) são a mesma; "Ana Souza" e
  // "Ana Maria Souza" só se já dividem um vizinho (a mesma empresa, o mesmo domínio)
  const ps = pessoas.slice(0, 500).map((p) => ({ p, w: palavras(p.valor) })).filter((x) => x.w.length >= 2);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j];
    if (a.w[0] !== b.w[0] || a.w[a.w.length - 1] !== b.w[b.w.length - 1]) continue;
    if (a.w.join(' ') === b.w.join(' ')) { sugerir(a.p.id, b.p.id, 'mesma pessoa', `"${a.p.valor}" e "${b.p.valor}" são o mesmo nome escrito de outro jeito (fontes diferentes).`, 4); continue; }
    const [menor, maior] = a.w.length < b.w.length ? [a, b] : [b, a];
    if (!menor.w.every((x) => maior.w.includes(x))) continue;
    const comum = [...adj.get(a.p.id)].find((v) => adj.get(b.p.id).has(v));
    if (comum) sugerir(menor.p.id, maior.p.id, 'pode ser a mesma pessoa', `"${menor.p.valor}" pode ser "${maior.p.valor}" (nome mais curto) e os dois se ligam a ${rot(comum)}. Confirme antes de juntar.`, 3);
  }
  for (const e of porTipo('email')) { const d = ache('dominio', String(e.valor).split('@')[1] || ''); if (d) sugerir(e.id, d.id, 'domínio do e-mail', 'O domínio deste e-mail está no grafo.'); }
  // a URL aponta para um domínio do grafo (conta não: ligar cada perfil ao github.com só polui)
  for (const u of porTipo('url')) {
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
  // e-mail que parece ser de uma pessoa do grafo (ana.souza@ ↔ Ana Souza)
  for (const e of porTipo('email')) {
    const local = String(e.valor).split('@')[0].toLowerCase().replace(/\d+$/, '');
    for (const p of pessoas) if (apelidosDeNome(p.valor).includes(local)) sugerir(p.id, e.id, 'parece ser o e-mail de', `O começo do e-mail (${local}) combina com o nome ${p.valor}.`);
  }
  for (const a of porTipo('apelido')) for (const p of pessoas) if (apelidosDeNome(p.valor).includes(String(a.valor).toLowerCase())) sugerir(p.id, a.id, 'parece ser o apelido de', `"${a.valor}" combina com o nome ${p.valor}.`);
  // organizações com o mesmo nome por baixo da forma jurídica
  const vistas = new Map();
  for (const o of porTipo('organizacao')) {
    const k = nucleo(o.valor);
    if (k.length < 3) continue;
    if (vistas.has(k)) sugerir(o.id, vistas.get(k), 'mesma organização', `"${o.valor}" e "${rot(vistas.get(k))}" parecem a mesma organização.`);
    else vistas.set(k, o.id);
  }
  // o valor de uma entidade aparece nas propriedades de outra (valor inteiro, não pedaço de outro valor)
  const procuraveis = [...nos.values()].filter((n) => !['texto', 'local', 'tecnologia'].includes(n.tipo) && String(n.valor).length >= 6).map((n) => ({ n, v: String(n.valor).toLowerCase() }));
  if (nos.size <= 4000) for (const a of nos.values()) {
    const texto = Object.entries(a.props || {}).filter(([k]) => k !== 'completo' && k !== 'sugerido pela IA').map(([, v]) => String(v)).join(' \u0001 ').toLowerCase();
    if (!texto) continue;
    for (const { n: b, v } of procuraveis) if (b.id !== a.id && texto.includes(v) && cita(texto, v)) sugerir(a.id, b.id, 'citado nas propriedades', `As propriedades de ${rot(a.id)} citam ${b.valor}.`);
  }

  // ---------- infraestrutura compartilhada ----------
  const FRASE = { ip: 'o mesmo servidor', rede: 'o mesmo bloco de endereços', asn: 'o mesmo sistema autônomo', organizacao: 'a mesma organização', email: 'o mesmo e-mail', pessoa: 'a mesma pessoa', telefone: 'o mesmo telefone', cnpj: 'o mesmo CNPJ', tecnologia: 'a mesma tecnologia', rastreador: 'o mesmo ID de rastreamento (Analytics, AdSense)', dominio: 'o mesmo servidor de nomes ou de e-mail' };
  const porFrase = new Map();
  for (const x of nos.values()) {
    if (!FRASE[x.tipo]) continue;
    const doms = vizinhos(x.id, 'dominio');
    const bases = [...new Set(doms.map((d) => base(d.valor)))].filter((b) => x.tipo !== 'dominio' || b !== base(x.valor));
    if (bases.length < 2 || (x.tipo === 'tecnologia' && bases.length < 3)) continue;
    (porFrase.get(x.tipo) || porFrase.set(x.tipo, []).get(x.tipo)).push({ tipo: 'descoberta', titulo: `${bases.length} domínios diferentes com ${FRASE[x.tipo]}`, texto: `${rot(x.id)} liga ${bases.slice(0, 6).join(', ')}${bases.length > 6 ? '…' : ''}. Domínios com ${FRASE[x.tipo]} costumam ter o mesmo dono ou a mesma operação.`, entidades: [x.id, ...doms.map((d) => d.id)].slice(0, 30), peso: bases.length });
  }
  // por tipo, as três mais fortes; o resto numa pista só (12 IPs de CDN não viram 12 pistas)
  for (const [t, l] of porFrase) {
    l.sort((a, b) => b.peso - a.peso);
    // o mesmo título duas vezes (dois IPs ligando 3 domínios cada) ganha o nome da entidade
    const top = l.slice(0, 3);
    for (const p of top) if (top.filter((q) => q.titulo === p.titulo).length > 1) p.titulo += ` (${rot(p.entidades[0])})`;
    pistas.push(...top);
    if (l.length > 3) {
      const resto = l.slice(3);
      pistas.push({ tipo: 'descoberta', titulo: `Mais ${resto.length} casos de domínios com ${FRASE[t]}`, texto: `${resto.map((p) => rot(p.entidades[0])).slice(0, 8).join(', ')}${resto.length > 8 ? '…' : ''}. Costuma ser hospedagem ou serviço em comum (CDN, provedor de e-mail).`, entidades: resto.map((p) => p.entidades[0]).slice(0, 30), peso: 0 });
    }
  }

  // ---------- alertas ----------
  // sanções, TCU, STF e offshores em destaque, uma pista por pessoa ou empresa, sempre com a cautela do homônimo
  const juridicos = [];
  for (const n of [...pessoas, ...porTipo('organizacao')]) {
    const p = n.props || {}, f = [];
    const listas = ['OFAC (EUA)', 'ONU', 'União Europeia'].filter((k) => p[k] === 'consta');
    if (listas.length) f.push(`lista de sanções (${listas.join(', ')})`);
    if (p.TCU && !/^nada consta/i.test(String(p.TCU))) f.push(`TCU: ${String(p.TCU).slice(0, 120)}`);
    const stf = parseInt(p['processos no STF'], 10);
    if (stf > 0) f.push(`${stf} ${stf === 1 ? 'processo' : 'processos'} no STF`);
    const off = parseInt(p['Offshore Leaks'], 10);
    if (off > 0) f.push(`${off} ${off === 1 ? 'possível menção' : 'possíveis menções'} no Offshore Leaks`);
    if (!f.length) continue;
    // sanção e TCU pesam mais que processo (ser parte num processo não é condenação)
    juridicos.push({ n, f, peso: 100 + (listas.length ? 40 : 0) + (p.TCU && !/^nada consta/i.test(String(p.TCU)) ? 30 : 0) + f.length });
  }
  juridicos.sort((a, b) => b.peso - a.peso);
  for (const { n, f, peso } of juridicos.slice(0, 5)) {
    const homonimo = String((n.props || {})['risco de homônimo'] || '');
    const texto = `${f.join('; ')}. A busca é pelo nome: confira data de nascimento, cidade ou CPF mascarado antes de concluir${homonimo ? ` (risco de homônimo ${homonimo})` : ''}.`;
    const titulo = `${rot(n.id)}: ${f.length === 1 ? f[0].split(':')[0].replace(/ \(.*/, '') : `${f.length} registros públicos de risco`}`;
    if (!(n.tipo === 'pessoa' && !homonimo && rodar(n, 'ibge-nome', titulo, texto + ' Rode o IBGE para ver quão comum é o nome.', peso, 'alerta', vizinhos(n.id).filter((v) => v.alerta).map((v) => v.id)))) {
      pistas.push({ tipo: 'alerta', titulo, texto, entidades: [n.id, ...vizinhos(n.id).filter((v) => v.alerta).map((v) => v.id)].slice(0, 30), peso });
    }
  }
  const alertas = [...nos.values()].filter((n) => n.alerta);
  if (alertas.length) {
    const por = {};
    for (const a of alertas) por[a.tipo] = (por[a.tipo] || 0) + 1;
    pistas.push({ tipo: 'alerta', titulo: `${alertas.length} ${alertas.length === 1 ? 'ponto de atenção' : 'pontos de atenção'}`, texto: Object.entries(por).map(([t, q]) => `${q} ${t}`).join(', ') + '. Comece por eles.', entidades: alertas.map((a) => a.id).slice(0, 30), peso: 50 });
  }

  // ---------- cautela: homônimo provável ----------
  let cautelas = 0;
  for (const p of pessoas) {
    if (cautelas >= 2) break;
    const risco = String((p.props || {})['risco de homônimo'] || '');
    if (risco === 'baixo') continue;
    const porNome = vizinhos(p.id).filter((v) => /homônimo|com este nome|mesmo nome/i.test(rotuloLig.get(p.id + '|' + v.id) || ''));
    if (porNome.length < 3) continue;
    cautelas++;
    const texto = `${porNome.length} achados vieram só pelo nome${risco ? ` e o primeiro nome tem risco de homônimo ${risco}` : ''}. Confirme cada um por um dado único (e-mail, foto, cidade, CPF mascarado) antes de ligar à pessoa ou concluir.`;
    const titulo = `Cuidado com homônimos: ${rot(p.id)}`;
    if (!(risco === '' && rodar(p, 'ibge-nome', titulo, texto + ' Rode o IBGE para ver quão comum é o nome.', 60, 'descoberta', porNome.map((v) => v.id))))
      pistas.push({ tipo: 'descoberta', titulo, texto, entidades: [p.id, ...porNome.map((v) => v.id)].slice(0, 30), peso: 60 });
  }

  // ---------- próximos passos com motivo (as fontes recentes) ----------
  const deOnde = (n) => { const v = [...adj.get(n.id)].find((x) => rotuloLig.get(x + '|' + n.id)); return v ? { n: nos.get(v), rotulo: rotuloLig.get(v + '|' + n.id) } : null; };
  // CNPJ achado (no site, no registro, num resultado de busca) e ainda não consultado na Receita
  let k = 0;
  for (const c of porTipo('cnpj')) {
    if (k >= 3) break;
    const o = deOnde(c);
    if (rodar(c, 'cnpj', `Razão social e sócios: CNPJ ${c.valor}`, `${o ? `Veio de ${rot(o.n.id)} (${o.rotulo}). ` : ''}A Receita diz quem é a empresa, os sócios e se ela está ativa.`, 40)) k++;
  }
  // telefone: primeiro tipo, operadora e região; depois quem mais usa o número (Wikidata). Os do site antes.
  k = 0;
  const fones = porTipo('telefone').map((n) => ({ n, o: deOnde(n) })).sort((a, b) => Number(/site|whatsapp/i.test((b.o || {}).rotulo || '')) - Number(/site|whatsapp/i.test((a.o || {}).rotulo || '')));
  for (const { n, o } of fones) {
    if (k >= 3) break;
    const doSite = o && /site|whatsapp/i.test(o.rotulo) ? `Telefone de ${rot(o.n.id)}. ` : '';
    if (rodar(n, 'telefone', `Operadora e região: ${rot(n.id)}`, `${doSite}Tipo (celular ou fixo), operadora original da faixa, região do DDD e links de WhatsApp, Telegram e Signal, sem consulta externa.`, 30)
      || (feitas(n).includes('telefone') && rodar(n, 'telefone-wikidata', `Quem mais usa: ${rot(n.id)}`, `${doSite}Organizações que publicam este número no Wikidata (uma empresa, um órgão, outro site do mesmo dono).`, 25))) k++;
  }
  // e-mail que a chave PGP verificada lista junto: é da mesma pessoa, e ainda ninguém olhou
  k = 0;
  for (const e of porTipo('email')) {
    if (k >= 3) break;
    const irmao = vizinhos(e.id, 'email').find((v) => /verificad/i.test(rotuloLig.get(v.id + '|' + e.id) || '') && /PGP/i.test(rotuloLig.get(v.id + '|' + e.id) || ''));
    if (!irmao) continue;
    const t = ['email-github', 'gravatar', 'pgp-email'].filter((x) => pode(e, x)).sort((a, b) => (rendimento(aprendizado, 'email', b) ?? 1) - (rendimento(aprendizado, 'email', a) ?? 1))[0];
    if (t && rodar(e, t, `Outro e-mail da mesma pessoa: ${e.valor}`, `A chave PGP verificada de ${irmao.valor} também lista este e-mail (o servidor confere o dono). Vale ver ${cat.get(t).nome.toLowerCase()}.`, 35, 'proximo', [irmao.id])) k++;
  }

  // ---------- próximos passos genéricos ----------
  // as rápidas, primeiro as que mais renderam neste tipo; uma que nunca rende (já rodou 5 vezes sem nada) sai
  const cacheRapidas = new Map();
  const rapidas = (tp) => {
    if (!cacheRapidas.has(tp)) cacheRapidas.set(tp, transformacoes.filter((x) => x.rapida && x.de.includes(tp) && !x.cofre && !NUNCA_SUGERIR.has(x.id))
      .filter((x) => { const ap = aprendizado[tp + '|' + x.id]; return !(ap && ap.n >= 5 && ap.a === 0); })
      .map((x, i) => ({ x, i, r: rendimento(aprendizado, tp, x.id) ?? 1 })).sort((a, b) => b.r - a.r || a.i - b.i).map((y) => y.x));
    return cacheRapidas.get(tp);
  };
  const candidatos = [...nos.values()]
    .filter((n) => !jaRodar.has(n.id))
    .map((n, i) => ({ n, i, faltam: rapidas(n.tipo).filter((t) => pode(n, t.id)), peso: (n.alerta ? 50 : 0) + adj.get(n.id).size * 3 + (feitas(n).length ? 0 : 10) }))
    // "Nome de usuário da conta" numa conta que já está ligada a um apelido só devolveria o mesmo apelido
    .map((c) => ({ ...c, faltam: c.faltam.filter((t) => !(t.id === 'conta-apelido' && vizinhos(c.n.id, 'apelido').length)) }))
    .filter((c) => c.faltam.length)
    .sort((a, b) => b.peso - a.peso || a.i - b.i)
    .slice(0, 8);
  for (const { n, faltam } of candidatos) {
    const t = faltam[0];
    const rend = rendimento(aprendizado, n.tipo, t.id);
    rodar(n, t.id, `${t.nome}: ${n.rotulo || n.valor}`, (rend != null ? `Costuma trazer ${rend >= 10 ? Math.round(rend) : rend.toFixed(1).replace('.', ',')} resultados aqui. ` : '') + (n.alerta ? 'Entidade com alerta ainda pouco explorada.' : adj.get(n.id).size >= 3 ? 'Entidade central da investigação, ainda sem esta transformação.' : feitas(n).length ? `Faltam ${faltam.length} transformações rápidas.` : 'Ainda não foi explorada.'), 0);
  }
  const isoladas = [...nos.values()].filter((n) => !adj.get(n.id).size);
  if (isoladas.length >= 2) pistas.push({ tipo: 'descoberta', titulo: `${isoladas.length} entidades soltas`, texto: 'Não se ligam a nada. Rode transformações nelas ou ligue à mão (botão Ligar, ou Alt + arrastar de uma para a outra).', entidades: isoladas.map((n) => n.id).slice(0, 30), peso: 0 });

  // sem repetidas (a página descarta pela dupla tipo|título) e numa ordem que não muda de uma vez para outra
  const vistasP = new Set();
  const unicas = pistas.filter((p) => {
    // duas entidades com o mesmo rótulo: o título ganha o tipo de ligação antes de a pista ser descartada como repetida
    if (vistasP.has(p.tipo + '|' + p.titulo) && p.acao) p.titulo += ` · ${p.acao.rotulo || p.acao.t}`;
    const k2 = p.tipo + '|' + p.titulo;
    if (vistasP.has(k2)) return false;
    vistasP.add(k2); return true;
  });
  return unicas.map((p, i) => ({ p, i })).sort((a, b) => (ORDEM[a.p.tipo] ?? 9) - (ORDEM[b.p.tipo] ?? 9) || (b.p.peso || 0) - (a.p.peso || 0) || a.i - b.i).map((x) => x.p);
}
