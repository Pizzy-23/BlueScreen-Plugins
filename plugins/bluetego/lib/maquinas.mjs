// Bluetego: máquinas são roteiros de transformações. Cada passo roda uma transformação em todas as entidades do tipo
// dele que a máquina já tem (a de partida e as que ela mesma achou), na ordem, como um investigador faria à mão.
// "escopo": numa máquina de domínio, os passos só tocam domínios da mesma empresa (o mesmo domínio registrável):
// um vizinho de hospedagem que apareceu no caminho não é sondado.
// "max" limita quantas entidades um passo visita, para um domínio com 500 subdomínios não virar 2.000 consultas.
// A página visita na ordem em que a máquina achou, e a de partida vem primeiro: "max: 1" quer dizer "só a de partida"
// (ou, num tipo que ela não é, a primeira achada). Todo passo que pode pegar entidades achadas no caminho tem "max".
// "tipos" restringe a transformação que serve para vários tipos (a busca na web não sai procurando cada nome achado).
// Fora de máquina, de propósito: tellows (cada consulta aumenta um contador público), imprensa (o GDELT bloqueia
// rajadas) e as que pedem chave no Cofre. tests/raciocinio.test.mjs confere tudo isso contra o catálogo.
export const MAQUINAS = [
  {
    id: 'pegada-dominio', de: 'dominio', escopo: true, nome: 'Pegada do domínio',
    descricao: 'DNS, registro, contatos do site (telefones, WhatsApp, CNPJ com a razão social, endereço, redes sociais), serviços no TXT, subdomínios, IPs de cada um, quem hospeda e o que está exposto.',
    // o que é do domínio em si roda só nele: os servidores de nomes, de e-mail e os nomes do certificado do mesmo
    // domínio não passam de novo por registro, site e rastreadores. O TXT fica para depois dos IPs: os IPs do SPF são
    // do provedor de e-mail, não da empresa
    passos: [
      { t: 'dns-ip', max: 1 }, { t: 'rdap-dominio', max: 1 }, { t: 'dns-mx', max: 1 }, { t: 'dns-ns', max: 1 }, { t: 'seguranca-email', max: 1 }, { t: 'popularidade', max: 1 }, { t: 'certificado', max: 1 }, { t: 'tecnologias', max: 1 },
      { t: 'contatos-site', tipos: ['dominio'], max: 1 }, { t: 'cnpj', max: 3 }, { t: 'rastreadores', max: 1 }, { t: 'rastreador-sites', max: 4 }, { t: 'subdominios', max: 1 },
      { t: 'dns-ip', max: 30 }, { t: 'ip-asn', max: 20 }, { t: 'geo', max: 20 }, { t: 'internetdb', max: 20 }, { t: 'asn-dono', max: 10 }, { t: 'dns-txt', max: 1 },
    ],
  },
  {
    id: 'superficie', de: 'dominio', escopo: true, nome: 'Superfície de ataque',
    descricao: 'Subdomínios de 4 fontes, robots, sitemap e JavaScript (rotas de API, chaves expostas), .git e .env expostos, metadados de documentos, tecnologias com versão, certificados, IPs, portas, CVEs e a Wayback Machine.',
    // o que lê o site inteiro (explorar, documentos, Wayback) roda só no domínio; certificado e tecnologias, nos
    // primeiros subdomínios achados
    passos: [{ t: 'subdominios', max: 1 }, { t: 'infostealer', max: 1 }, { t: 'seguranca-email', max: 1 }, { t: 'explorar-site', max: 1 }, { t: 'documentos', max: 1 }, { t: 'certificado', max: 15 }, { t: 'tecnologias', max: 15 }, { t: 'contatos-seguranca', max: 1 }, { t: 'dns-ip', max: 40 }, { t: 'internetdb', max: 40 }, { t: 'cve', max: 25 }, { t: 'cve-exploracao', max: 25 }, { t: 'wayback', max: 1 }],
  },
  {
    id: 'pessoas-dominio', de: 'dominio', escopo: true, nome: 'Pessoas da empresa',
    descricao: 'E-mails e perfis no site e no registro, autores e usuários nos documentos públicos; depois Gravatar dos e-mails, contas dos perfis e dos usuários achados.',
    passos: [{ t: 'documentos', max: 1 }, { t: 'rdap-dominio', max: 1 }, { t: 'site', max: 1 }, { t: 'gravatar', max: 15 }, { t: 'conta-apelido', max: 15 }, { t: 'contas', max: 8 }],
  },
  {
    id: 'ip', de: 'ip', nome: 'Raio-x do IP',
    descricao: 'DNS reverso, sistema autônomo, dono do bloco, localização, portas e vulnerabilidades.',
    passos: [{ t: 'ptr' }, { t: 'ip-asn' }, { t: 'rdap-ip', tipos: ['ip'] }, { t: 'geo' }, { t: 'internetdb' }, { t: 'ip-reputacao' }, { t: 'cve-exploracao', max: 15 }, { t: 'asn-dono', max: 3 }, { t: 'cve', max: 15 }],
  },
  {
    id: 'email', de: 'email', nome: 'Quem é este e-mail',
    descricao: 'Chaves PGP (nome real e outros e-mails), domínio, Gravatar e contas do GitHub de cada e-mail achado, onde ele aparece na web e o mesmo nome de usuário em outros sites.',
    // PGP primeiro: os outros e-mails da chave também passam por domínio, Gravatar e GitHub. O "recebe e-mail?" já vem
    // no domínio do e-mail (sem um MX à parte)
    passos: [{ t: 'pgp-email', max: 1 }, { t: 'email-dominio', max: 6 }, { t: 'gravatar', max: 6 }, { t: 'email-github', max: 4 }, { t: 'web', tipos: ['email'], max: 1 }, { t: 'conta-apelido', max: 10 }, { t: 'contas', max: 5 }],
  },
  {
    id: 'apelido', de: 'apelido', nome: 'Rastro do apelido',
    descricao: 'Contas em 18 sites (com nome, cidade e site de cada perfil) e em centenas de outros (regras do Maigret), GitHub a fundo (e-mails dos commits, chaves, repositórios, fuso real e horários dos commits), a web e o Gravatar dos e-mails.',
    // os apelidos de IRC que o Launchpad devolve não disparam de novo cada fonte: o rastro é do apelido de partida
    passos: [{ t: 'contas', max: 1 }, { t: 'contas-amplo', max: 1 }, { t: 'github', max: 1 }, { t: 'github-repos', max: 1 }, { t: 'github-commits', tipos: ['apelido'], max: 1 }, { t: 'hacker-news', max: 1 }, { t: 'npm', max: 1 }, { t: 'wikimedia', max: 1 }, { t: 'launchpad', tipos: ['apelido'], max: 1 }, { t: 'fediverso', tipos: ['apelido'], max: 1 }, { t: 'stackexchange', tipos: ['apelido'], max: 1 }, { t: 'web', tipos: ['apelido'], max: 1 }, { t: 'gravatar', max: 10 }, { t: 'email-dominio', max: 10 }],
  },
  {
    id: 'pessoa', de: 'pessoa', nome: 'Pegada da pessoa',
    descricao: 'Quantas pessoas têm o nome (IBGE), Wikidata, mandatos na Câmara e no Senado, sanções (OFAC, ONU, UE), TCU, processos no STF, Diário Oficial da União, Offshore Leaks, livros, Nobel, ORCID e OpenAlex, chaves PGP, Launchpad, Bluesky, fediverso, Stack Overflow, Wikipédia, contas do GitHub com o nome, a web, e os apelidos prováveis com as contas que existem para eles.',
    // toda busca por nome roda só na pessoa de partida: os nomes achados no caminho (chave PGP, Launchpad, commits)
    // costumam ser homônimos, e cada um viraria mais 20 consultas
    passos: [
      { t: 'ibge-nome', max: 1 }, { t: 'pessoa-wikidata', max: 1 }, { t: 'parlamentar', max: 1 }, { t: 'sancoes', tipos: ['pessoa'], max: 1 }, { t: 'tcu', max: 1 }, { t: 'stf', max: 1 }, { t: 'dou', max: 1 }, { t: 'offshore', max: 1 }, { t: 'autor', max: 1 }, { t: 'nobel', max: 1 },
      { t: 'orcid', max: 1 }, { t: 'openalex', max: 1 }, { t: 'orcid-perfil', max: 3 }, { t: 'pgp-nome', max: 1 }, { t: 'launchpad', tipos: ['pessoa'], max: 1 }, { t: 'bluesky-busca', max: 1 }, { t: 'fediverso', tipos: ['pessoa'], max: 1 }, { t: 'stackexchange', tipos: ['pessoa'], max: 1 }, { t: 'wikipedia', tipos: ['pessoa'], max: 1 },
      // o GitHub a fundo só nas contas que têm o nome (antes dos apelidos adivinhados, que trariam desconhecidos)
      { t: 'github-nome', max: 1 }, { t: 'github', max: 3 }, { t: 'web', tipos: ['pessoa'], max: 1 }, { t: 'nome-apelidos', max: 1 }, { t: 'contas', max: 10 }, { t: 'gravatar', max: 10 },
    ],
  },
  {
    id: 'golpes-marca', de: 'dominio', nome: 'Golpes com a marca',
    descricao: 'Domínios parecidos registrados; quais recebem e-mail (prontos para phishing), têm certificado, aparecem em relatórios de ameaça, quem os registrou e as varreduras públicas deles.',
    // as varreduras do urlscan trazem domínios de terceiros: vêm por último, para MX, certificado e registro ficarem
    // com os parecidos
    passos: [{ t: 'parecidos', max: 1 }, { t: 'dns-mx', max: 40 }, { t: 'certificado', max: 20 }, { t: 'otx', tipos: ['dominio'], max: 20 }, { t: 'rdap-dominio', max: 15 }, { t: 'urlscan', tipos: ['dominio'], max: 10 }],
  },
  {
    id: 'ameaca-ip', de: 'ip', nome: 'Inteligência de ameaça',
    descricao: 'Relatórios de ameaça, domínios que já apontaram para o IP e a reputação de cada um.',
    // os IPs que o urlscan traz não passam pelo HackerTarget (50 consultas por dia)
    passos: [{ t: 'otx', max: 1 }, { t: 'ip-reputacao', max: 1 }, { t: 'internetdb', max: 1 }, { t: 'ip-asn', max: 1 }, { t: 'mesmo-ip', max: 1 }, { t: 'urlscan', tipos: ['ip'], max: 1 }, { t: 'otx', tipos: ['dominio'], max: 15 }],
  },
  {
    id: 'empresa-br', de: 'cnpj', nome: 'Empresa brasileira',
    descricao: 'Razão social, sócios, endereço, telefone e e-mail na Receita; as empresas sócias (holdings) e a matriz; CEP com coordenadas; site e dados no Wikidata; domínio do e-mail.',
    passos: [{ t: 'cnpj', max: 1 }, { t: 'cnpj', max: 6 }, { t: 'cep', max: 3 }, { t: 'wikidata', max: 2 }, { t: 'email-dominio', max: 7 }, { t: 'telefone', max: 7 }, { t: 'coordenadas', max: 1 }, { t: 'gravatar', max: 7 }, { t: 'rdap-dominio', max: 3 }],
  },
  {
    id: 'carteira', de: 'cripto', nome: 'Rastro da carteira',
    descricao: 'Saldo e as carteiras que mais mandaram e receberam; depois o mesmo para cada uma delas.',
    passos: [{ t: 'bitcoin', max: 1 }, { t: 'bitcoin', max: 10 }],
  },
  {
    id: 'telefone', de: 'telefone', nome: 'Rastro do telefone',
    descricao: 'Tipo, operadora original e região do número, organizações e estabelecimentos com este telefone (Wikidata, OpenStreetMap), links do WhatsApp, Telegram e Signal, onde ele aparece na web (em todos os jeitos de escrever) e o que as páginas achadas citam.',
    passos: [{ t: 'telefone', max: 1 }, { t: 'telefone-wikidata', max: 1 }, { t: 'telefone-osm', max: 1 }, { t: 'web', tipos: ['telefone'], max: 1 }, { t: 'url-dominio', max: 10 }, { t: 'email-dominio', max: 5 }],
  },
];
