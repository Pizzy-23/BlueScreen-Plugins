// Conferência elétrica do BlueCircuito, sem IA: monta as redes (o que está ligado com o quê) e confere tensão,
// corrente, o que cada GPIO aceita, pinos de boot, terra comum, endereços I2C, resistor do LED, pull-up, motor sem
// driver e se o código usa os mesmos pinos da ligação. Erro = queima, não liga ou não funciona; aviso = funciona,
// mas com risco ou pegadinha; dica = melhoria.
import { PLACAS, PECAS, pinosDa, acharPinoPlaca } from './catalogo.mjs';

const SINAIS = new Set(['in', 'out', 'analog', 'io', 'sda', 'scl', 'mosi', 'miso', 'sck', 'cs']);
const BARRAMENTO = new Set(['sda', 'scl', 'mosi', 'miso', 'sck']);
const MANDA = new Set(['out', 'analog', 'io', 'miso']); // a peça põe tensão no fio
const v = (x) => String(Math.round(x * 10) / 10).replace('.', ',') + ' V';
const hex = (a) => '0x' + a.toString(16).toUpperCase().padStart(2, '0');

// "placa:D4", "led1:A" -> { peca, pino, chave } (a chave usa o nome canônico do pino)
export function lerPonto(txt, projeto, placa) {
  const s = String(txt || '').trim();
  const i = s.lastIndexOf(':');
  if (i <= 0) return { erro: `"${s}" não está no formato peça:pino (ex.: placa:D4, led1:A)` };
  const quem = s.slice(0, i).trim(), pino = s.slice(i + 1).trim();
  if (/^(placa|board|mcu|esp|esp32|arduino|uno|pico)$/i.test(quem)) {
    const p = acharPinoPlaca(placa, pino);
    if (!p) return { erro: `a placa ${placa.nome} não tem o pino "${pino}"` };
    return { peca: 'placa', pino: p.nome, chave: 'placa:' + p.nome, pp: p };
  }
  const pc = (projeto.pecas || []).find((x) => x.id === quem || String(x.id).toLowerCase() === quem.toLowerCase());
  if (!pc) return { erro: `não há peça com o id "${quem}"` };
  const cat = PECAS[pc.tipo];
  if (!cat) return { erro: `a peça ${quem} é de um tipo desconhecido` };
  const pin = cat.pinos.find((x) => x.nome.toLowerCase() === pino.toLowerCase());
  if (!pin) return { erro: `${cat.nome} (${pc.id}) não tem o pino "${pino}"; os pinos são ${cat.pinos.map((x) => x.nome).join(', ')}` };
  return { peca: pc.id, pino: pin.nome, chave: pc.id + ':' + pin.nome, pin, pc, cat };
}

function uniao() {
  const pai = new Map();
  const achar = (x) => { if (!pai.has(x)) pai.set(x, x); let r = x; while (pai.get(r) !== r) r = pai.get(r); let y = x; while (pai.get(y) !== r) { const n = pai.get(y); pai.set(y, r); y = n; } return r; };
  return { achar, unir: (a, b) => pai.set(achar(a), achar(b)), todos: () => [...pai.keys()] };
}

export function conferir(projeto) {
  const problemas = [];
  const add = (nivel, codigo, texto, onde = []) => { if (!problemas.some((p) => p.codigo === codigo && p.texto === texto)) problemas.push({ nivel, codigo, texto, onde }); };
  const placa = PLACAS[projeto && projeto.placa];
  if (!placa) {
    add('erro', 'placa', `Placa desconhecida: "${projeto && projeto.placa}". Use uma destas: ${Object.keys(PLACAS).join(', ')}.`);
    return { problemas, resumo: contar(problemas), redes: [], pinos: {}, consumo: [] };
  }
  const pecas = Array.isArray(projeto.pecas) ? projeto.pecas : [];
  const vistos = new Set();
  for (const pc of pecas) {
    if (!pc || !pc.id) { add('erro', 'peca-id', 'Há uma peça sem id.'); continue; }
    if (vistos.has(pc.id)) add('erro', 'peca-id', `Duas peças com o mesmo id "${pc.id}".`);
    vistos.add(pc.id);
    if (pc.id === 'placa') add('erro', 'peca-id', 'O id "placa" é reservado para a placa.');
    if (!PECAS[pc.tipo]) add('erro', 'peca-tipo', `A peça ${pc.id} é do tipo "${pc.tipo}", que não está no catálogo.`);
  }
  if (projeto.wifi && !placa.wifi) add('erro', 'wifi', `O projeto usa Wi-Fi, mas a ${placa.nome} não tem. Troque por um ESP32 ou pelo Pico W.`);

  // ---------- redes ----------
  const U = uniao(), info = new Map();
  const reg = (pt) => { info.set(pt.chave, pt); U.achar(pt.chave); };
  // dentro da placa, os GND são o mesmo ponto (e os 3V3 também)
  const pp = pinosDa(placa);
  for (const t of ['gnd', '3v3']) { const l = pp.filter((x) => x.tipo === t); l.forEach((x) => { reg({ peca: 'placa', pino: x.nome, chave: 'placa:' + x.nome, pp: x }); if (l[0] !== x) U.unir('placa:' + x.nome, 'placa:' + l[0].nome); }); }
  for (const l of Array.isArray(projeto.ligacoes) ? projeto.ligacoes : []) {
    const a = lerPonto(l && l.de, projeto, placa), b = lerPonto(l && l.para, projeto, placa);
    if (a.erro || b.erro) { add('erro', 'ponto', `Ligação ${l && l.de} → ${l && l.para}: ${a.erro || b.erro}.`, [l && l.de, l && l.para]); continue; }
    reg(a); reg(b);
    if (a.chave !== b.chave) U.unir(a.chave, b.chave);
  }
  const redes = new Map();
  for (const k of info.keys()) { const r = U.achar(k); if (!redes.has(r)) redes.set(r, []); redes.get(r).push(info.get(k)); }
  const redeDe = (chave) => (info.has(chave) ? redes.get(U.achar(chave)) : null);
  const nomePc = (id) => { const pc = pecas.find((x) => x.id === id); return pc ? (pc.rotulo || (PECAS[pc.tipo] || {}).nome || id) + ` (${id})` : id; };
  const rot = (m) => (m.peca === 'placa' ? m.pino : `${nomePc(m.peca)} ${m.pino}`);
  // o que está num pino da placa, curto; pelo conversor de nível, a peça do outro lado
  const curto = (m) => `${String(m.cat.nome).split('(')[0].trim()} ${m.pino}`;
  const uso = (rede) => rede.filter((m) => m.peca !== 'placa' && m.cat).flatMap((m) => {
    const par = m.cat.conversor && /^(HV|LV)(\d)$/.exec(m.pino);
    if (!par) return [curto(m)];
    const outro = redeDe(m.peca + ':' + (par[1] === 'LV' ? 'HV' : 'LV') + par[2]) || [];
    const l = outro.filter((x) => x.peca !== m.peca && x.cat).map((x) => curto(x) + ' (pelo conversor)');
    return l.length ? l : [curto(m)];
  });

  // o que cada rede tem de fonte de tensão
  const fontesDa = (rede) => {
    const f = [];
    for (const m of rede) {
      if (m.peca === 'placa') {
        const t = m.pp.tipo;
        if (t === '3v3') f.push({ m, tensao: 3.3, cap: (placa.fontes['3V3'] || placa.fontes['3.3V'] || { capacidade: 50 }).capacidade, placa: true, nome: m.pino });
        else if (t === '5v' || t === 'vin') { const fo = placa.fontes[m.pino] || placa.fontes['5V'] || placa.fontes.VIN || placa.fontes.VBUS || { capacidade: 400 }; f.push({ m, tensao: 5, cap: fo.capacidade, placa: true, nome: m.pino, vin: t === 'vin' }); }
      } else if (m.pin && m.pin.papel === 'fonte') f.push({ m, tensao: m.pc.tensao || m.pin.tensao, cap: m.pin.capacidade, nome: rot(m) });
    }
    return f;
  };
  const temGnd = (rede) => rede.some((m) => (m.peca === 'placa' ? m.pp.tipo === 'gnd' : m.pin && m.pin.papel === 'gnd'));
  const temGndPlaca = (rede) => rede.some((m) => m.peca === 'placa' && m.pp.tipo === 'gnd');

  // tensão de alimentação de cada peça (pela rede do VCC)
  const alimentacao = new Map();
  for (const pc of pecas) {
    const cat = PECAS[pc.tipo]; if (!cat) continue;
    for (const pin of cat.pinos.filter((x) => x.papel === 'vcc')) {
      const rede = redeDe(pc.id + ':' + pin.nome);
      const f = rede ? fontesDa(rede) : [];
      if (f.length) alimentacao.set(pc.id + ':' + pin.nome, Math.max(...f.map((x) => x.tensao)));
    }
  }
  const vccDe = (pcId) => {
    const cat = PECAS[(pecas.find((x) => x.id === pcId) || {}).tipo]; if (!cat) return null;
    const pin = cat.pinos.find((x) => x.papel === 'vcc');
    return pin ? alimentacao.get(pcId + ':' + pin.nome) ?? null : null;
  };

  // ---------- por rede ----------
  const usoPlaca = {};
  for (const rede of redes.values()) {
    const daPlaca = rede.filter((m) => m.peca === 'placa');
    const gpios = daPlaca.filter((m) => m.pp.gpio != null);
    const forca = daPlaca.filter((m) => ['3v3', '5v', 'vin'].includes(m.pp.tipo));
    const fontes = fontesDa(rede);
    const sinais = rede.filter((m) => m.pin && SINAIS.has(m.pin.papel));
    const onde = rede.map((m) => m.chave);
    // curto: tensões diferentes juntas, força com GND, GPIO direto na força
    const tensoes = [...new Set(fontes.map((f) => f.tensao))];
    if (tensoes.length > 1) add('erro', 'curto', `Curto: ${fontes.map((f) => `${f.nome} (${v(f.tensao)})`).join(' e ')} estão ligados juntos.`, onde);
    if (fontes.length && temGnd(rede)) add('erro', 'curto', `Curto: ${fontes.map((f) => f.nome).join(', ')} ligado direto no GND.`, onde);
    if (gpios.length && (fontes.length || temGnd(rede))) add('erro', 'curto', `O pino ${gpios.map((g) => g.pino).join(', ')} está ligado direto ${temGnd(rede) ? 'no GND' : 'na alimentação'}: ao virar saída, queima.`, onde);
    if (gpios.length > 1) add('erro', 'curto', `Os pinos ${gpios.map((g) => g.pino).join(' e ')} da placa estão ligados entre si.`, onde);
    const placaFonte5 = fontes.filter((f) => f.placa && f.tensao === 5);
    const externas = fontes.filter((f) => !f.placa);
    if (placaFonte5.length && externas.length && tensoes.length === 1) add('aviso', 'fonte-dupla', `A fonte externa (${externas.map((f) => f.nome).join(', ')}) está ligada no ${placaFonte5.map((f) => f.nome).join('/')} da placa: não ligue o USB e a fonte ao mesmo tempo, ou ponha um diodo.`, onde);
    for (const m of daPlaca.filter((x) => ['nc', 'reset'].includes(x.pp.tipo))) add('aviso', 'pino-especial', `O pino ${m.pino} da placa não é de uso geral${m.pp.tipo === 'reset' ? ' (reinicia a placa)' : ''}.`, onde);

    for (const g of gpios) {
      const p = g.pp, caps = p.caps || [];
      usoPlaca[p.nome] = uso(rede);
      if (caps.includes('evitar')) add('erro', 'pino-ocupado', `O ${p.nome} é usado pela própria placa (${(placa.notas || {})[p.gpio] || 'memória'}): escolha outro.`, onde);
      if (caps.includes('strap') && sinais.length) add('aviso', 'pino-boot', `${p.nome}: ${(placa.notas || {})[p.gpio] || 'decide o modo de boot.'} Se der problema ao ligar ou gravar, troque de pino.`, onde);
      if (caps.includes('serial') && sinais.length) add('aviso', 'pino-serial', `${p.nome}: ${(placa.notas || {})[p.gpio] || 'é a serial do USB.'}`, onde);
      if (!sinais.length) continue;
      // um só pino com mais de uma peça mandando sinal (barramento é outra conversa)
      const bus = sinais.filter((s) => BARRAMENTO.has(s.pin.papel)), outros = sinais.filter((s) => !BARRAMENTO.has(s.pin.papel));
      const papeisBus = [...new Set(bus.map((s) => s.pin.papel))];
      if (papeisBus.length > 1 || (bus.length && outros.length)) add('erro', 'pino-duplo', `O ${p.nome} está ligado a sinais diferentes: ${sinais.map(rot).join(', ')}.`, onde);
      const mandam = outros.filter((s) => MANDA.has(s.pin.papel) || s.pin.papel === 'cs');
      if (mandam.length > 1 || (mandam.length && outros.length > mandam.length && outros.some((s) => s.pin.papel === 'cs'))) add('erro', 'pino-duplo', `O ${p.nome} tem mais de uma peça no mesmo fio: ${outros.map(rot).join(', ')}. Cada uma precisa de um pino próprio.`, onde);
      // o que o pino aceita
      const precisaSaida = sinais.some((s) => ['in', 'io', 'sda', 'scl', 'mosi', 'sck', 'cs'].includes(s.pin.papel));
      if (precisaSaida && !caps.includes('out')) add('erro', 'pino-so-entrada', `O ${p.nome} só lê (é só entrada) e não consegue mandar sinal para ${sinais.map(rot).join(', ')}.`, onde);
      if (p.analogico && sinais.some((s) => s.pin.papel !== 'analog')) add('erro', 'pino-analogico', `O ${p.nome} só faz leitura analógica: ${p.nota || ''}`.trim(), onde);
      for (const s of sinais.filter((x) => x.pin.papel === 'analog')) {
        if (!caps.includes('adc') && !caps.includes('adc2')) add('erro', 'pino-sem-adc', `${rot(s)} é analógico, mas o ${p.nome} não lê tensão. Use um pino com ADC.`, onde);
        else if (caps.includes('adc2') && !caps.includes('adc') && placa.wifi && projeto.wifi !== false && /^ESP32$/.test(placa.mcu)) add(projeto.wifi ? 'erro' : 'aviso', 'adc2-wifi', `${rot(s)} está no ${p.nome}, que é ADC2: com o Wi-Fi ligado ele não lê nada. Use um pino de ADC1 (${pinosDa(placa).filter((x) => (x.caps || []).includes('adc')).map((x) => x.nome).join(', ')}).`, onde);
      }
      // I2C nos pinos certos
      for (const s of sinais.filter((x) => x.pin.papel === 'sda' || x.pin.papel === 'scl')) {
        const certo = placa.i2c[s.pin.papel];
        if (p.gpio !== certo) {
          const nomeCerto = (pinosDa(placa).find((x) => x.gpio === certo) || {}).nome || certo;
          if (!placa.i2c.livre) add('erro', 'i2c-pino', `Na ${placa.nome}, o ${s.pin.papel.toUpperCase()} do I2C é só no ${nomeCerto}; ${rot(s)} está no ${p.nome}.`, onde);
          else add('dica', 'i2c-pino', `${s.pin.papel.toUpperCase()} no ${p.nome} (o padrão é ${nomeCerto}): o código precisa de Wire.begin(SDA, SCL) com esses pinos.`, onde);
        }
      }
      // tensão do sinal que a peça manda contra o que o pino aguenta
      for (const s of sinais.filter((x) => MANDA.has(x.pin.papel) || x.pin.papel === 'io')) {
        const nivel = s.pin.nivel ?? vccDe(s.peca);
        if (nivel != null && nivel > placa.logica + 0.4 && !placa.tolerante5v) add('erro', 'nivel', `${rot(s)} manda ${v(nivel)} para o ${p.nome}, que aguenta ${v(placa.logica)}: queima o pino. Use um divisor de tensão ou um conversor de nível.`, onde);
      }
      // placa de 5 V mandando sinal para peça de 3,3 V
      if (placa.logica >= 5) for (const s of sinais.filter((x) => ['in', 'io', 'sda', 'scl', 'mosi', 'sck', 'cs'].includes(x.pin.papel))) {
        const cat = s.cat, vcc = cat.pinos.find((x) => x.papel === 'vcc');
        if (cat.so33 || (vcc && vcc.faixa[1] < 4.5)) add(cat.so33 ? 'erro' : 'aviso', 'nivel-5v', `O ${p.nome} manda 5 V para ${rot(s)}, que é de 3,3 V. Use um conversor de nível.`, onde);
      }
      // módulo I2C que puxa SDA/SCL para 5 V numa placa de 3,3 V
      for (const s of sinais.filter((x) => (x.pin.papel === 'sda' || x.pin.papel === 'scl') && x.cat.pullup5v)) {
        if (!placa.tolerante5v && (vccDe(s.peca) || 0) > 4) add('aviso', 'i2c-5v', `${nomePc(s.peca)} está em 5 V e o módulo puxa o ${s.pin.papel.toUpperCase()} para 5 V no ${p.nome}. Costuma funcionar, mas o certo é um conversor de nível (ou tirar os resistores de pull-up do módulo).`, onde);
      }
      // corrente tirada direto do pino
      for (const s of sinais) if ((s.pin.corrente || 0) > placa.corrente.pino) add('aviso', 'corrente-pino', `${rot(s)} puxa uns ${s.pin.corrente} mA direto do ${p.nome} (limite seguro: ${placa.corrente.pino} mA). Um transistor resolve.`, onde);
    }
    // carga (motor, contato do relé) encostando na placa
    const cargas = rede.filter((m) => m.pin && m.pin.papel === 'carga');
    if (cargas.length && (gpios.length || forca.length)) {
      const motor = cargas.filter((m) => m.cat.motorCarga);
      if (motor.length) add('erro', 'motor-direto', `${motor.map(rot).join(', ')} ligado direto na placa: motor queima o pino. Use um driver (DRV8833 ou L298N).`, onde);
    }
  }

  // ---------- por peça ----------
  const consumoPorRede = new Map();
  for (const pc of pecas) {
    const cat = PECAS[pc.tipo]; if (!cat) continue;
    const nome = nomePc(pc.id);
    const liga = (pin) => { const r = redeDe(pc.id + ':' + pin.nome); return r && r.length > 1 ? r : null; };
    // pinos obrigatórios sem ligação
    for (const pin of cat.pinos) {
      if (pin.opcional || pin.papel === 'nc') continue;
      if (!liga(pin)) add('erro', 'sem-ligacao', `${nome}: o pino ${pin.nome}${pin.desc ? ' (' + pin.desc + ')' : ''} não está ligado a nada.`, [pc.id + ':' + pin.nome]);
    }
    if (cat.umDe && !cat.umDe.some((n) => liga(cat.pinos.find((x) => x.nome === n)))) add('erro', 'sem-ligacao', `${nome}: ligue pelo menos um destes pinos: ${cat.umDe.join(' ou ')}.`, [pc.id]);
    // alimentação dentro da faixa
    for (const pin of cat.pinos.filter((x) => x.papel === 'vcc')) {
      const rede = liga(pin); if (!rede) continue;
      const f = fontesDa(rede);
      if (!f.length) { add('erro', 'sem-alimentacao', `${nome}: o ${pin.nome} não chega a nenhuma alimentação (3V3, 5V ou uma fonte).`, [pc.id + ':' + pin.nome]); continue; }
      const t = Math.max(...f.map((x) => x.tensao)), [mn, mx] = pin.faixa;
      if (t > mx + 0.15) add('erro', 'tensao-alta', `${nome} aceita de ${v(mn)} a ${v(mx)} no ${pin.nome}, mas está em ${v(t)}: queima.`, [pc.id + ':' + pin.nome]);
      else if (t < mn - 0.15) add('erro', 'tensao-baixa', `${nome} precisa de ${v(mn)} a ${v(mx)} no ${pin.nome}, mas está em ${v(t)}: não funciona direito.`, [pc.id + ':' + pin.nome]);
      const raiz = U.achar(pc.id + ':' + pin.nome);
      const gasto = (cat.consumo || 0) + (cat.porLed ? cat.porLed * (Number(pc.leds) || cat.qtdLeds || 1) : 0);
      if (!consumoPorRede.has(raiz)) consumoPorRede.set(raiz, { fontes: f, pecas: [], total: 0 });
      const c = consumoPorRede.get(raiz); c.pecas.push({ id: pc.id, nome, mA: gasto }); c.total += gasto;
      if ((cat.motor || cat.porLed) && f.some((x) => x.placa) && t >= 4.5) add('aviso', 'motor-placa', `${nome} está na alimentação da placa (${f.filter((x) => x.placa).map((x) => x.nome).join('/')}). ${cat.motor ? 'No arranque o motor puxa corrente demais, a tensão cai e a placa reinicia' : 'Com muitos LEDs acesos a corrente passa do que o USB dá'}: use uma fonte de 5 V própria com o GND junto ao da placa.`, [pc.id + ':' + pin.nome]);
    }
    // terra comum com a placa
    for (const pin of cat.pinos.filter((x) => x.papel === 'gnd')) {
      const rede = liga(pin); if (!rede) continue;
      if (!temGndPlaca(rede)) add('erro', 'gnd-comum', `${nome}: o ${pin.nome} não está ligado ao GND da placa. Sem terra comum, os sinais não funcionam.`, [pc.id + ':' + pin.nome]);
    }
    // LED sem resistor
    if (pc.tipo === 'led') {
      const ra = redeDe(pc.id + ':A') || [], rk = redeDe(pc.id + ':K') || [];
      const temR = (r) => r.some((m) => m.pc && m.pc.tipo === 'resistor');
      if ((ra.length > 1 || rk.length > 1) && !temR(ra) && !temR(rk)) add('erro', 'led-resistor', `${nome} está sem resistor em série: queima o LED e força o pino. Ponha um de 220 Ω a 330 Ω.`, [pc.id]);
      const kVaiPraGnd = rk.some((m) => m.peca === 'placa' && m.pp.tipo === 'gnd') || (temR(rk) && rk.some((m) => m.pc && m.pc.tipo === 'resistor' && (redeDe(m.peca + ':' + (m.pino === '1' ? '2' : '1')) || []).some((x) => x.peca === 'placa' && x.pp.tipo === 'gnd')));
      const aVaiPraGnd = ra.some((m) => m.peca === 'placa' && m.pp.tipo === 'gnd');
      if (aVaiPraGnd && !kVaiPraGnd) add('erro', 'led-invertido', `${nome} está invertido: o ânodo (A, perna longa) vai no sinal e o cátodo (K) no GND.`, [pc.id]);
      // corrente pelo resistor
      for (const r of [...ra, ...rk].filter((m) => m.pc && m.pc.tipo === 'resistor')) {
        const ohms = ohm(r.pc.valor);
        if (ohms != null && ohms < 100) add('aviso', 'resistor-baixo', `O resistor ${r.pc.id} (${r.pc.valor}) do ${nome} é baixo demais: passa corrente que o pino não aguenta. Use 220 Ω ou mais.`, [r.pc.id]);
      }
    }
    // pull-up
    for (const pin of cat.pinos.filter((x) => x.precisaPullup)) {
      const rede = liga(pin); if (!rede) continue;
      const temPull = rede.some((m) => m.pc && m.pc.tipo === 'resistor' && fontesDa(redeDe(m.peca + ':' + (m.pino === '1' ? '2' : '1')) || []).length);
      if (!temPull) add('erro', 'pullup', `${nome}: o ${pin.nome} precisa de um resistor de ${pin.precisaPullup >= 1000 ? String(pin.precisaPullup / 1000).replace('.', ',') + ' kΩ' : pin.precisaPullup + ' Ω'} ligado ao VCC (pull-up); sem ele a leitura falha.`, [pc.id + ':' + pin.nome]);
    }
    // motor DC precisa sair de um driver
    if (cat.motorCarga) {
      const r = [...cat.pinos.map((p) => redeDe(pc.id + ':' + p.nome) || [])].flat();
      if (!r.some((m) => m.pin && m.pin.papel === 'cargaSaida')) add('erro', 'motor-driver', `${nome} precisa ser ligado às saídas (OUT) de um driver de motor.`, [pc.id]);
    }
  }

  // ---------- I2C: endereços repetidos no mesmo barramento ----------
  const porBarramento = new Map();
  for (const pc of pecas) {
    const cat = PECAS[pc.tipo]; if (!cat || !cat.i2c) continue;
    const sda = cat.pinos.find((x) => x.papel === 'sda'); if (!sda) continue;
    const r = redeDe(pc.id + ':' + sda.nome); if (!r || r.length < 2) continue;
    const k = U.achar(pc.id + ':' + sda.nome);
    if (!porBarramento.has(k)) porBarramento.set(k, []);
    const end = pc.endereco != null ? (typeof pc.endereco === 'number' ? pc.endereco : parseInt(String(pc.endereco), 16)) : cat.i2c[0];
    porBarramento.get(k).push({ pc, cat, end });
  }
  for (const lista of porBarramento.values()) {
    const por = new Map();
    for (const x of lista) { if (!por.has(x.end)) por.set(x.end, []); por.get(x.end).push(x); }
    for (const [end, xs] of por) if (xs.length > 1) {
      const troca = xs.find((x) => x.cat.i2c.length > 1);
      add('erro', 'i2c-endereco', `Endereço I2C ${hex(end)} repetido: ${xs.map((x) => nomePc(x.pc.id)).join(' e ')}. ${troca ? `Mude o ${nomePc(troca.pc.id)} para ${troca.cat.i2c.filter((a) => a !== end).map(hex).join(' ou ')} (campo "endereco" da peça)${troca.pc.tipo === 'mpu6050' ? ', ligando o AD0 no 3V3' : ''}.` : 'Esses dois não trocam de endereço: use um multiplexador I2C (TCA9548A) ou outro modelo.'}`, xs.map((x) => x.pc.id));
    }
  }

  // ---------- consumo por fonte ----------
  const consumo = [];
  for (const c of consumoPorRede.values()) {
    const cap = Math.max(...c.fontes.map((f) => f.cap || 0)), nome = c.fontes.map((f) => f.nome).join(' + ');
    consumo.push({ fonte: nome, tensao: Math.max(...c.fontes.map((f) => f.tensao)), capacidade: cap, total: c.total, pecas: c.pecas });
    if (cap && c.total > cap) add('erro', 'consumo', `${nome} dá uns ${cap} mA, mas as peças ligadas nele pedem ${c.total} mA (${c.pecas.filter((p) => p.mA).map((p) => `${p.nome}: ${p.mA}`).join(', ')}). Use uma fonte maior.`, c.pecas.map((p) => p.id));
    else if (cap && c.total > cap * 0.8) add('aviso', 'consumo', `${nome} está perto do limite: ${c.total} de ${cap} mA.`, c.pecas.map((p) => p.id));
  }

  // ---------- o código usa os mesmos pinos? ----------
  const codigo = String((projeto.firmware && projeto.firmware.codigo) || '');
  if (codigo.trim()) {
    const doCodigo = pinosNoCodigo(codigo, placa, projeto.linguagem);
    const ligados = new Map();
    for (const [nome, quem] of Object.entries(usoPlaca)) {
      const p = acharPinoPlaca(placa, nome);
      const rede = redeDe('placa:' + nome) || [];
      // barramentos nos pinos padrão a biblioteca já sabe sozinha
      const padrao = rede.every((m) => m.peca === 'placa' || !m.pin || BARRAMENTO.has(m.pin.papel)) && [placa.i2c.sda, placa.i2c.scl, placa.spi.mosi, placa.spi.miso, placa.spi.sck].includes(p.gpio);
      if (!padrao && quem.length) ligados.set(p.gpio, { nome, quem });
    }
    if (doCodigo.size || ligados.size) {
      for (const [g, x] of ligados) if (!doCodigo.has(g)) add('aviso', 'codigo-pino', `O código não usa o ${x.nome} (GPIO ${g}), onde está ${x.quem.join(', ')}. Confira o número do pino no código.`, ['placa:' + x.nome]);
      for (const g of doCodigo) if (!ligados.has(g) && ![placa.i2c.sda, placa.i2c.scl].includes(g)) {
        const p = pinosDa(placa).find((x) => x.gpio === g);
        if (p) add('aviso', 'codigo-pino', `O código usa o ${p.nome} (GPIO ${g}), mas não há nada ligado nele.`, ['placa:' + p.nome]);
      }
    }
  }

  const pinos = {};
  for (const p of pp) {
    const uso = usoPlaca[p.nome];
    pinos[p.nome] = { gpio: p.gpio ?? null, tipo: p.tipo || 'gpio', caps: p.caps || [], uso: uso || [], nota: p.nota || (p.gpio != null ? (placa.notas || {})[p.gpio] || '' : ''),
      estado: p.tipo ? 'forca' : (p.caps || []).includes('evitar') ? 'evitar' : uso && uso.length ? 'usado' : 'livre' };
  }
  const ordem = { erro: 0, aviso: 1, dica: 2 };
  problemas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
  return { problemas, resumo: contar(problemas), redes: [...redes.values()].filter((r) => r.length > 1).map((r) => r.map((m) => m.chave)), pinos, consumo };
}

function contar(problemas) {
  const c = { erro: 0, aviso: 0, dica: 0 };
  for (const p of problemas) c[p.nivel]++;
  return c;
}

export function ohm(valor) {
  const m = String(valor ?? '').trim().replace(',', '.').match(/^([\d.]+)\s*([kKmM]?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  return n * ({ k: 1e3, K: 1e3, m: 1e6, M: 1e6 }[m[2]] || 1);
}

// os GPIOs que o código cita: #define LED 4, const int X = 4, pinMode(4, ...), Pin(4), GPIO_NUM_4, A0, D4 (NodeMCU),
// "pin: GPIO4" (ESPHome)
export function pinosNoCodigo(codigo, placa, linguagem) {
  const s = new Set();
  const semComentario = String(codigo).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(linguagem === 'micropython' || linguagem === 'esphome' ? /#.*$/gm : /$^/, '');
  const num = (n) => { const g = Number(n); if (Number.isInteger(g) && pinosDa(placa).some((x) => x.gpio === g)) s.add(g); };
  const nome = (n) => { const p = acharPinoPlaca(placa, n); if (p && p.gpio != null) s.add(p.gpio); };
  // constantes com nome de pino (#define LED 4, const int PINO_RELE = 26); fora as que são quantidade ou tempo
  const NOME_PINO = /(PIN|PINO|LED|BTN|BOTAO|BUTTON|RELE|RELAY|SERVO|TRIG|ECHO|SENSOR|DHT|BUZZ|DATA|SDA|SCL|^CS|_CS|SS|RST|^DT|_DT|SCK|CLK|DIO|IN\d|^EN|_EN|MOTOR|PWM|OUT|LDR|POT|WIRE|^SW|_SW)/i;
  const NAO_PINO = /(NUM|COUNT|QTD|QTDE|MAX|MIN|DELAY|TEMPO|INTERVAL|BAUD|TYPE|TIPO|ADDR|ENDER|WIDTH|HEIGHT|SIZE|BRIGHT|BRILHO|CHANNEL|CANAL|FREQ|RES|TIMEOUT|LIMIT|LIMIAR|ANGLE|ANGULO|SPEED|VELOC)/i;
  const valor = (x) => { if (!x) return; if (/^\d+$/.test(x)) num(x); else if (/^(GPIO|GP)?\d+$|^[AD]\d+$/i.test(x)) nome(x); };
  for (const m of semComentario.matchAll(/#define\s+(\w+)\s+(\w+)|(?:int|uint8_t|byte|gpio_num_t|short)\s+(\w+)\s*=\s*(\w+)|^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(\d+)\s*$/gm)) {
    const n = m[1] || m[3] || m[5], x = m[2] || m[4] || m[6];
    if (NOME_PINO.test(n) && !NAO_PINO.test(n)) valor(x);
  }
  const re = [
    /\b(?:pinMode|digitalWrite|digitalRead|analogRead|analogWrite|ledcAttachPin|ledcAttach|attachInterrupt|tone|noTone|digitalPinToInterrupt)\s*\(\s*(\w+)/g,
    /\.attach\s*\(\s*(\w+)/g,
    /\b(?:DHT|OneWire|Adafruit_NeoPixel|TM1637Display|HX711|NewPing|MFRC522)\s+\w+\s*\(\s*(\w+)(?:\s*,\s*(\w+))?/g,
    /\b(?:Wire1?|SPI)\.(?:begin|setPins|setSDA|setSCL|setRX|setTX|setSCK)\s*\(\s*(\w+)(?:\s*,\s*(\w+))?(?:\s*,\s*(\w+))?(?:\s*,\s*(\w+))?/g,
    /\.begin\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*;\s*\/\/\s*(?:dt|sck)/gi,
    /\bGPIO_NUM_(\d+)/g,
    /\bPin\s*\(\s*(\d+)/g,
    /\bADC\s*\(\s*(\d+)/g,
    /\bpin:\s*(?:number:\s*)?(GPIO\d+|D\d+|A\d|\d+)/gi,
    /\b(?:sda|scl|clk_pin|mosi_pin|miso_pin|cs_pin|data_pin|clock_pin|trigger_pin|echo_pin|pin_a|pin_b|dout_pin|pd_sck_pin)\s*:\s*(GPIO\d+|D\d+|\d+)/gi,
  ];
  for (const r of re) for (const m of semComentario.matchAll(r)) for (const x of m.slice(1)) valor(x);
  // nas outras linhas, as constantes definidas com nome viram o número (const int LED = 4 já entrou acima)
  return s;
}
