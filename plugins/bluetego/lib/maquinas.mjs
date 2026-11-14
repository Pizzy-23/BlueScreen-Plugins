// Bluetego: máquinas são roteiros de transformações. Cada passo roda uma transformação em todas as entidades do tipo
// dele que a máquina já tem (a de partida e as que ela mesma achou), na ordem, como um investigador faria à mão.
// "escopo": numa máquina de domínio, os passos só tocam domínios da mesma empresa (o mesmo domínio registrável):
// um vizinho de hospedagem que apareceu no caminho não é sondado.
// "max" limita quantas entidades um passo visita, para um domínio com 500 subdomínios não virar 2.000 consultas.
export const MAQUINAS = [
  {
    id: 'pegada-dominio', de: 'dominio', escopo: true, nome: 'Pegada do domínio',
    descricao: 'DNS, registro, serviços no TXT, subdomínios, IPs de cada um, quem hospeda e o que está exposto.',
    passos: [
      { t: 'dns-ip' }, { t: 'dns-mx' }, { t: 'dns-ns' }, { t: 'dns-txt' }, { t: 'rdap-dominio' }, { t: 'certificado' }, { t: 'tecnologias' }, { t: 'rastreadores' }, { t: 'rastreador-sites', max: 4 }, { t: 'subdominios' },
      { t: 'dns-ip', max: 30 }, { t: 'ip-asn', max: 20 }, { t: 'geo', max: 20 }, { t: 'internetdb', max: 20 }, { t: 'asn-dono' },
    ],
  },
  {
    id: 'superficie', de: 'dominio', escopo: true, nome: 'Superfície de ataque',
    descricao: 'Subdomínios de 4 fontes, robots, sitemap e JavaScript (rotas de API, chaves expostas), .git e .env expostos, metadados de documentos, tecnologias com versão, certificados, IPs, portas, CVEs e a Wayback Machine.',
    passos: [{ t: 'subdominios' }, { t: 'explorar-site' }, { t: 'documentos' }, { t: 'certificado' }, { t: 'tecnologias' }, { t: 'contatos-seguranca' }, { t: 'dns-ip', max: 40 }, { t: 'internetdb', max: 40 }, { t: 'cve', max: 25 }, { t: 'wayback' }],
  },
  {
    id: 'pessoas-dominio', de: 'dominio', escopo: true, nome: 'Pessoas da empresa',
    descricao: 'E-mails e perfis no site e no registro, autores e usuários nos documentos públicos; depois Gravatar dos e-mails, contas dos perfis e dos usuários achados.',
    passos: [{ t: 'documentos' }, { t: 'rdap-dominio' }, { t: 'site' }, { t: 'gravatar', max: 15 }, { t: 'conta-apelido', max: 15 }, { t: 'contas', max: 8 }],
  },
  {
    id: 'ip', de: 'ip', nome: 'Raio-x do IP',
    descricao: 'DNS reverso, sistema autônomo, dono do bloco, localização, portas e vulnerabilidades.',
    passos: [{ t: 'ptr' }, { t: 'ip-asn' }, { t: 'rdap-ip' }, { t: 'geo' }, { t: 'internetdb' }, { t: 'asn-dono' }, { t: 'cve', max: 15 }],
  },
  {
    id: 'email', de: 'email', nome: 'Quem é este e-mail',
    descricao: 'Domínio, Gravatar, contas do GitHub com o e-mail, onde ele aparece na web e o mesmo nome de usuário em outros sites.',
    passos: [{ t: 'email-dominio' }, { t: 'gravatar' }, { t: 'email-github' }, { t: 'web' }, { t: 'dns-mx' }, { t: 'conta-apelido', max: 10 }, { t: 'contas', max: 5 }],
  },
  {
    id: 'apelido', de: 'apelido', nome: 'Rastro do apelido',
    descricao: 'Contas em 18 sites (com nome, cidade e site de cada perfil) e em centenas de outros (regras do Maigret), GitHub a fundo (e-mails dos commits, chaves, repositórios), a web e o Gravatar dos e-mails.',
    passos: [{ t: 'contas' }, { t: 'contas-amplo' }, { t: 'github' }, { t: 'github-repos' }, { t: 'web', tipos: ['apelido'] }, { t: 'gravatar', max: 10 }, { t: 'email-dominio', max: 10 }],
  },
  {
    id: 'pessoa', de: 'pessoa', nome: 'Pegada da pessoa',
    descricao: 'Wikidata (se for pessoa pública), ORCID, Wikipédia, contas do GitHub com o nome, a web, e os apelidos prováveis com as contas que existem para eles.',
    passos: [{ t: 'pessoa-wikidata' }, { t: 'orcid' }, { t: 'wikipedia', tipos: ['pessoa'] }, { t: 'github-nome' }, { t: 'web', tipos: ['pessoa'] }, { t: 'nome-apelidos' }, { t: 'contas', max: 10 }, { t: 'github', max: 5 }, { t: 'gravatar', max: 10 }],
  },
  {
    id: 'golpes-marca', de: 'dominio', nome: 'Golpes com a marca',
    descricao: 'Domínios parecidos registrados; quais recebem e-mail (prontos para phishing), têm certificado, aparecem em relatórios de ameaça e quem os registrou.',
    passos: [{ t: 'parecidos' }, { t: 'dns-mx', max: 40 }, { t: 'certificado', max: 20 }, { t: 'otx', max: 20 }, { t: 'rdap-dominio', max: 15 }],
  },
  {
    id: 'ameaca-ip', de: 'ip', nome: 'Inteligência de ameaça',
    descricao: 'Relatórios de ameaça, domínios que já apontaram para o IP e a reputação de cada um.',
    passos: [{ t: 'otx' }, { t: 'mesmo-ip' }, { t: 'internetdb' }, { t: 'ip-asn' }, { t: 'otx', max: 15 }],
  },
  {
    id: 'empresa-br', de: 'cnpj', nome: 'Empresa brasileira',
    descricao: 'Razão social, sócios, endereço, telefone e e-mail na Receita; as empresas sócias (holdings) e a matriz; CEP com coordenadas; site e dados no Wikidata; domínio do e-mail.',
    passos: [{ t: 'cnpj' }, { t: 'cnpj', max: 6 }, { t: 'cep', max: 3 }, { t: 'wikidata', max: 2 }, { t: 'email-dominio' }, { t: 'telefone' }, { t: 'coordenadas', max: 1 }, { t: 'gravatar' }, { t: 'rdap-dominio', max: 3 }],
  },
  {
    id: 'carteira', de: 'cripto', nome: 'Rastro da carteira',
    descricao: 'Saldo e as carteiras que mais mandaram e receberam; depois o mesmo para cada uma delas.',
    passos: [{ t: 'bitcoin' }, { t: 'bitcoin', max: 10 }],
  },
  {
    id: 'telefone', de: 'telefone', nome: 'Rastro do telefone',
    descricao: 'Tipo e região do número, links do WhatsApp, Telegram e Signal, onde ele aparece na web (em todos os jeitos de escrever) e o que as páginas achadas citam.',
    passos: [{ t: 'telefone' }, { t: 'web', tipos: ['telefone'] }, { t: 'url-dominio', max: 10 }, { t: 'email-dominio', max: 5 }],
  },
];
