// Bluetego: máquinas são roteiros de transformações. Cada passo roda uma transformação em todas as entidades do tipo
// dele que a máquina já tem (a de partida e as que ela mesma achou), na ordem, como um investigador faria à mão.
// "max" limita quantas entidades um passo visita, para um domínio com 500 subdomínios não virar 2.000 consultas.
export const MAQUINAS = [
  {
    id: 'pegada-dominio', de: 'dominio', nome: 'Pegada do domínio',
    descricao: 'DNS, registro, serviços no TXT, subdomínios, IPs de cada um, quem hospeda e o que está exposto.',
    passos: [
      { t: 'dns-ip' }, { t: 'dns-mx' }, { t: 'dns-ns' }, { t: 'dns-txt' }, { t: 'rdap-dominio' }, { t: 'subdominios' },
      { t: 'dns-ip', max: 30 }, { t: 'ip-asn', max: 20 }, { t: 'geo', max: 20 }, { t: 'internetdb', max: 20 }, { t: 'asn-dono' },
    ],
  },
  {
    id: 'superficie', de: 'dominio', nome: 'Superfície de ataque',
    descricao: 'Subdomínios, IPs, portas abertas, CVEs conhecidos e endereços esquecidos na Wayback Machine.',
    passos: [{ t: 'subdominios' }, { t: 'dns-ip', max: 40 }, { t: 'internetdb', max: 40 }, { t: 'cve', max: 25 }, { t: 'wayback' }],
  },
  {
    id: 'pessoas-dominio', de: 'dominio', nome: 'Pessoas da empresa',
    descricao: 'E-mails e perfis no site e no registro; depois Gravatar dos e-mails e contas dos perfis.',
    passos: [{ t: 'rdap-dominio' }, { t: 'site' }, { t: 'gravatar', max: 15 }, { t: 'conta-apelido', max: 15 }, { t: 'contas', max: 8 }],
  },
  {
    id: 'ip', de: 'ip', nome: 'Raio-x do IP',
    descricao: 'DNS reverso, sistema autônomo, dono do bloco, localização, portas e vulnerabilidades.',
    passos: [{ t: 'ptr' }, { t: 'ip-asn' }, { t: 'rdap-ip' }, { t: 'geo' }, { t: 'internetdb' }, { t: 'asn-dono' }, { t: 'cve', max: 15 }],
  },
  {
    id: 'email', de: 'email', nome: 'Quem é este e-mail',
    descricao: 'Domínio, Gravatar, contas verificadas e o mesmo nome de usuário em outros sites.',
    passos: [{ t: 'email-dominio' }, { t: 'gravatar' }, { t: 'dns-mx' }, { t: 'conta-apelido', max: 10 }, { t: 'contas', max: 5 }],
  },
  {
    id: 'apelido', de: 'apelido', nome: 'Rastro do apelido',
    descricao: 'Contas em 9 sites, perfil e e-mails de commits no GitHub, e o Gravatar desses e-mails.',
    passos: [{ t: 'contas' }, { t: 'github' }, { t: 'gravatar', max: 10 }, { t: 'email-dominio', max: 10 }],
  },
  {
    id: 'pessoa', de: 'pessoa', nome: 'Pegada da pessoa',
    descricao: 'Apelidos prováveis a partir do nome e as contas que existem com eles.',
    passos: [{ t: 'nome-apelidos' }, { t: 'contas', max: 10 }, { t: 'github', max: 5 }, { t: 'gravatar', max: 10 }],
  },
];
