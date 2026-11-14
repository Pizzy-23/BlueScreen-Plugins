// Bluetego: o "primeiro olhar". Ao inserir um valor, roda um roteiro curto, escolhido por tipo, com as fontes que mais
// dizem e menos sujam o grafo, e poda o resultado de cada passo: fica o que importa (alertas primeiro), o resto vira só
// uma contagem na entidade ("rode de novo para ver todos"). As buscas que trazem homônimos ou dezenas de itens soltos
// (web, apelidos adivinhados, centenas de sites, subdomínios) ficam para as máquinas e para o uso à mão.
// Cada passo: t (transformação), max (em quantas entidades roda; 1 = só a inserida), tipos (só nestes tipos),
// lim (quantas entidades do resultado ficam), so (só entidades destes tipos; [] = só as propriedades).
export const INICIO = {
  pessoa: [
    { t: 'ibge-nome', max: 1 }, { t: 'pessoa-wikidata', max: 1, lim: 8 }, { t: 'parlamentar', max: 1, lim: 6 },
    { t: 'sancoes', max: 1 }, { t: 'tcu', max: 1 }, { t: 'stf', max: 1, lim: 3 }, { t: 'dou', max: 1, lim: 3, so: ['url'] },
    { t: 'offshore', max: 1, lim: 3 }, { t: 'autor', max: 1, lim: 2 },
  ],
  telefone: [
    { t: 'telefone', max: 1, so: ['local', 'organizacao'] }, { t: 'telefone-wikidata', max: 1, lim: 3 },
    { t: 'web', max: 1, tipos: ['telefone'], lim: 5 }, { t: 'telefone-osm', max: 1, lim: 3 },
  ],
  dominio: [
    // do registro, só quem é o dono (os servidores de nomes são ruído aqui); do DNS, quem atende a empresa (TXT)
    { t: 'dns-ip', max: 1, lim: 4 }, { t: 'rdap-dominio', max: 1, lim: 6, so: ['pessoa', 'organizacao', 'email', 'telefone', 'cnpj', 'local'] }, { t: 'contatos-site', max: 1, lim: 15 },
    { t: 'cnpj', max: 2, lim: 8 }, { t: 'tecnologias', max: 1, lim: 6 }, { t: 'dns-mx', max: 1, so: [] }, { t: 'dns-txt', max: 1, lim: 6, so: ['organizacao'] },
    { t: 'seguranca-email', max: 1, so: [] }, { t: 'popularidade', max: 1, so: [] }, { t: 'ip-asn', max: 2, lim: 1, so: ['asn'] }, { t: 'otx', max: 1, tipos: ['dominio'], so: [] },
  ],
  url: [
    { t: 'url-seguir', max: 1, lim: 3 }, { t: 'url-dominio', max: 1 }, { t: 'contatos-site', max: 1, tipos: ['url'], lim: 12 }, { t: 'otx', max: 1, tipos: ['url'], so: [] },
  ],
  email: [
    { t: 'email-dominio', max: 1, lim: 2 }, { t: 'gravatar', max: 1, lim: 6 }, { t: 'pgp-email', max: 1, lim: 5 },
    { t: 'email-github', max: 1, lim: 3 }, { t: 'github-commits', max: 1, tipos: ['conta'], lim: 6 },
  ],
  apelido: [
    { t: 'contas', max: 1, lim: 12 }, { t: 'github', max: 1, tipos: ['apelido'], lim: 8 }, { t: 'github-commits', max: 1, tipos: ['apelido'], lim: 6 },
  ],
  ip: [
    { t: 'ptr', max: 1, lim: 2 }, { t: 'ip-asn', max: 1, lim: 2 }, { t: 'geo', max: 1, lim: 2 }, { t: 'ip-reputacao', max: 1, lim: 3 },
    { t: 'internetdb', max: 1, lim: 8 }, { t: 'otx', max: 1, tipos: ['ip'], so: [] },
  ],
  cnpj: [{ t: 'cnpj', max: 1, lim: 12 }],
  // CPF: só o que é público por lei (validade, região fiscal, condenação no TCU); nunca o dono
  cpf: [{ t: 'cpf', max: 1 }, { t: 'cpf-tcu', max: 1 }],
  organizacao: [{ t: 'wikidata', max: 1, lim: 8 }, { t: 'sancoes', max: 1, tipos: ['organizacao'] }],
};

// fica o que importa: alertas primeiro, só os tipos pedidos, no máximo "lim"; entidade que pendia de outra podada
// (o AS pendurado na faixa de rede) passa a se ligar direto à origem, senão a página recriaria a podada
export function podar(r, poda) {
  if (!r || !poda || !Array.isArray(r.entidades)) return r;
  const { lim, so } = poda;
  const ordem = r.entidades.map((e, i) => [e, i]).sort((a, b) => Number(!!b[0].alerta) - Number(!!a[0].alerta) || a[1] - b[1]).map(([e]) => e);
  let fica = ordem.filter((e) => e.alerta || !Array.isArray(so) || so.includes(e.tipo));
  // os alertas ficam sempre e não ocupam vaga do limite
  if (Number.isFinite(lim) && lim >= 0) { let n = 0; fica = fica.filter((e) => e.alerta || n++ < lim); }
  const ids = new Set(fica.map((e) => e.id)), podadas = new Set(r.entidades.filter((e) => !ids.has(e.id)).map((e) => e.id));
  // na ordem original, para a página desenhar como sempre
  const entidades = r.entidades.filter((e) => ids.has(e.id)).map((e) => (e.de && podadas.has(e.de.id) ? { ...e, de: undefined } : e));
  return { ...r, entidades, podados: r.entidades.length - entidades.length };
}
