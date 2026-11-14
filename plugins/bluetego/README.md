# Bluetego

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Martin Hartfelder |
| **Versão** | 0.4.0 |
| **Licença** | MIT |
| **Categoria** | Outros |
| **Precisa de** | BlueScreen 2.1.33 ou mais novo · Node.js 18+ |
| **Código** | [plugins/bluetego](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/bluetego) |
<!-- ficha:fim -->

Investigação OSINT em grafo dentro do BlueScreen, no estilo do Maltego: você põe uma entidade (um domínio, um IP, um e-mail, um apelido, um nome, um CNPJ) e puxa o que está ligado a ela, em cadeia, até enxergar a infraestrutura, as pessoas e os pontos fracos. Serve para reconhecimento em pentest autorizado, resposta a incidente, conferir a exposição da própria empresa, golpes com a marca e due diligence de fornecedores.

O que ele faz diferente do Maltego:

- **Sem conta, sem licença, sem créditos.** As 78 transformações usam fontes públicas e gratuitas. VirusTotal, token do GitHub e API da Anthropic são opcionais, com a chave guardada no Cofre da IDE.
- **O grafo pensa junto.** A aba **Análise** mostra pistas que o Bluetego tira sozinho (ligações que faltam, infraestrutura em comum, próximos passos), e a **IA** (os agentes da IDE, a API da Anthropic ou um Ollama local) analisa, responde perguntas e conduz a investigação no **piloto automático**.
- **O que as ferramentas especializadas fazem, num lugar só:** contas em até 2.434 sites (regras do Maigret), subdomínios de 4 fontes (como o Amass), metadados de documentos (como o FOCA), exploração do site (robots, sitemap, JavaScript, `.git` e `.env` expostos), pivôs por ID de rastreamento e buscas prontas.
- **Máquinas prontas** que encadeiam transformações como um investigador faria à mão.
- **Aprende com o uso:** o Bluetego anota quanto cada transformação rende em cada tipo de entidade neste PC, mostra a média no botão e sugere primeiro o que costuma render.
- **Organização de verdade**: cinco layouts animados (forças, hierárquico, radial, por tipo, círculo), resultados grandes recolhidos num "+N", foco na vizinhança, linha do tempo e minimapa.
- **Alertas no grafo**: portas expostas (RDP, SMB, bancos), CVEs, domínio sem DMARC, certificado vencendo, domínios parecidos registrados, empresa baixada na Receita, relatórios de ameaça.
- **Tudo local**: as investigações ficam na pasta de dados do plugin, com anotações, cores, histórico e desfazer.

## Como usar

O Bluetego aparece na barra da esquerda (ícone de grafo). Ele abre o grafo numa aba fixa e, na esquerda, a lista de investigações e os tipos de entidade no grafo.

1. Escreva no campo **Investigar** (no topo) um domínio, IP, e-mail, `@apelido`, nome, CNPJ, CPF, CEP, telefone ou CVE, e `Enter`. O tipo é adivinhado pelo valor e as transformações rápidas já rodam (a entidade gira enquanto roda). Vários valores de uma vez também servem.
2. Clique numa entidade: aparece uma **barra de ações** em cima dela (rápidas, transformar, máquinas, foco, recolher, abrir, remover) e os detalhes no painel da direita.
3. Rode uma **máquina** (botão **Máquinas**, ou na barra da entidade) para várias transformações em sequência.
4. Abra a aba **Análise** para as pistas e a IA.
5. **Exportar** gera relatório em Markdown, planilha CSV, GraphML (Gephi, yEd, Maltego), SVG, PNG ou a investigação inteira em JSON.

Também dá para **colar** (`Ctrl+V` no grafo: um valor é investigado na hora, um texto maior abre a extração) e **arrastar um arquivo** para o grafo (log, e-mail, relatório, lista ou JSON do Bluetego).

| | |
|---|---|
| **Duplo clique** | na entidade: rodar as rápidas · no fundo: adicionar |
| **Botão direito** | na entidade: transformações, máquinas, ligar, foco, cores · numa ligação: mudar o rótulo, inverter, remover |
| `L` ou **Alt + arrastar** | ligar a entidade escolhida a outra (com sugestões de rótulo); duas selecionadas: ligar as duas |
| `N` | nova entidade já ligada à escolhida |
| `.` | só a vizinhança da escolhida (de novo: mais um salto) |
| `C` | recolher ou abrir os resultados soltos (o "+N") |
| `1` a `5` | forças, hierárquico, radial, por tipo, círculo |
| Setas | andar para a entidade vizinha |
| `F` · `M` · `T` · `P` | ajustar à tela · minimapa · linha do tempo · painel |
| **Shift + arrastar** · **Ctrl + clique** | selecionar várias · somar à seleção |
| `Ctrl+Z` · `Ctrl+Y` · `Del` · `Ctrl+C` · `?` | desfazer · refazer · remover · copiar os valores · todos os atalhos |
| **Buscar em tudo** | "Bluetego: abrir", "Bluetego: nova investigação", "Bluetego: extrair entidades da seleção do editor" |
| Botão direito num arquivo do projeto | **Extrair entidades no Bluetego** |

Ligações feitas à mão (ou aceitas da IA) aparecem tracejadas. Uma transformação que traz mais de 25 resultados soltos guarda todos num "+N" na entidade: um clique no número abre.

## Organizar o grafo

| Layout | Para quê |
|---|---|
| **Forças** | o padrão: as ligações puxam e as entidades se afastam, sem se encostar |
| **Hierárquico** | da entidade de partida (ou da escolhida) para baixo, em níveis; muitos resultados de um pai viram uma grade, e muitos ramos quebram em fileiras |
| **Radial** | anéis em volta da entidade de partida, cada ramo na sua fatia |
| **Agrupado por tipo** | um grupo para cada tipo, com o nome e a quantidade; as ligações entre grupos mostram como os tipos se cruzam |
| **Círculo** | todas num círculo, ordenadas por tipo |

Numa organização fixa, cada resultado novo reorganiza com animação, sem mexer na câmera. Os rótulos têm tamanho fixo e não se sobrepõem nem cobrem entidades: cada um procura um lado livre (embaixo, em cima, à direita, à esquerda), e quando falta espaço ficam os das entidades mais importantes (escolhidas, com alerta, com mais ligações). Contas e URLs aparecem curtas ("GitHub · usuário", "site/…/página"); o valor inteiro fica na dica do mouse. Num grafo com mais de 25 entidades, as folhas só mostram o nome de perto. Passar o mouse acende a entidade e as vizinhas; sobre uma ligação, mostra de onde veio.

## Análise: pistas e IA

**Pistas** são o que o Bluetego conclui sozinho olhando o grafo, cada uma com a ação pronta:

- ligações que faltam: e-mail e o domínio dele, subdomínio e domínio, IP dentro de um bloco, URL e o site, a mesma organização escrita de jeitos diferentes, o valor de uma entidade citado nas propriedades de outra, e-mail ou apelido que combina com o nome de uma pessoa, CPF que combina com o CPF mascarado de um sócio;
- infraestrutura em comum: domínios diferentes no mesmo servidor, com o mesmo e-mail, a mesma organização, o mesmo CNPJ;
- os pontos de atenção e os próximos passos (as transformações que ainda faltam nas entidades centrais).

**IA** (configure o provedor na engrenagem do plugin):

- **Analisar**: resumo, hipóteses com a confiança (alta, média, baixa), ligações que faltam, entidades que vale buscar e próximas transformações, cada uma com um botão para aplicar.
- **Perguntar**: pergunta livre sobre o grafo ("quem está por trás deste domínio?").
- **Piloto automático**: você escreve o objetivo; a IA escolhe as transformações, o Bluetego roda, e ela olha o resultado e escolhe de novo, até chegar ao objetivo ou ao limite de rodadas. No fim, escreve a conclusão.
- **Só a seleção**: a IA olha só as entidades escolhidas e as vizinhas.

A IA trabalha só leitura: ela não mexe em arquivos nem roda comandos, e nada entra no grafo sem o seu clique, exceto as transformações que o piloto automático roda (que só consultam as fontes públicas da tabela abaixo). A resposta é conferida antes de aparecer: ligação para entidade que não existe, tipo inventado ou transformação que não serve para aquele tipo são descartados.

## Transformações

As marcadas com ⚡ são as rápidas, que o duplo clique roda.

| De | Transformação | Fonte |
|---|---|---|
| Domínio | ⚡ Resolver IPs (A, AAAA, CNAME) · ⚡ MX · ⚡ NS | DNS sobre HTTPS (Google, Cloudflare de reserva) |
| Domínio | ⚡ TXT, SPF e DMARC: os serviços que a empresa usa e quem pode mandar e-mail por ela | DNS |
| Domínio | ⚡ Segurança do e-mail: DMARC (política e quem recebe os relatórios), seletores DKIM, MTA-STS, TLS-RPT, BIMI, DNSSEC | DNS |
| Domínio | Credenciais roubadas por infostealer: funcionários e usuários infectados, logins vazados da empresa | Hudson Rock |
| Domínio | ⚡ Popularidade no mundo (ranking e variação) | Tranco |
| Domínio | Endereços no Common Crawl (segunda fonte de URLs antigas, independente da Wayback) | Common Crawl |
| Domínio, IP | Varreduras públicas: páginas, IPs que serviam, capturas de tela (últimos 30 dias) | urlscan.io |
| Domínio | ⚡ Registro (RDAP/WHOIS): registrante, registrador, contatos, datas e o CNPJ do titular (.br) | rdap.org |
| Domínio | ⚡ Tecnologias do site (servidor, CMS, frameworks, CDN, análise), com a versão exposta | o próprio site |
| Domínio | ⚡ Certificado TLS: emissor, validade, outros nomes do certificado | o próprio site |
| Domínio | Subdomínios de 4 fontes, com quem achou cada um | crt.sh, certspotter, HackerTarget, Wayback |
| Domínio | Explorar o site: o que o robots.txt esconde, o sitemap, rotas de API e chaves expostas no JavaScript, `.git`, `.env` e `.DS_Store` expostos, cabeçalhos de segurança que faltam | o próprio site |
| Domínio | Documentos públicos (PDF, Word, Excel, PowerPoint) e os metadados: autores, usuários do Windows, empresa, programa | o próprio site + Wayback |
| Domínio | ⚡ IDs de rastreamento (Google Analytics, AdSense, Tag Manager, Meta Pixel, Hotjar, Clarity) | o próprio site |
| ID de rastreamento | ⚡ Outros sites com o mesmo ID (costumam ser do mesmo dono) | HackerTarget |
| Domínio | Ler o site: título, e-mails, telefones, perfis sociais, domínios citados | o próprio site |
| Domínio | Endereços arquivados, primeiro os que interessam (backups, painéis, APIs, `.env`) | Wayback Machine |
| Domínio | Contatos de segurança: `security.txt` e o responsável no SOA | o próprio site + DNS |
| Domínio | Domínios parecidos registrados (letra trocada, final diferente, palavra a mais, até 260 variações) | DNS |
| IP | ⚡ DNS reverso · ⚡ sistema autônomo e prefixo (Team Cymru de reserva) · ⚡ localização e provedor (aproximada) | DNS, RIPEstat, Team Cymru, ipwho.is |
| IP | ⚡ Reputação: varre a internet? (GreyNoise), em quais listas de ameaça está e quem cuida de abuso (SANS ISC), relay do Tor, spam (StopForumSpam), rede de criminosos (Spamhaus DROP) | GreyNoise, SANS ISC, Tor Onionoo, StopForumSpam, Spamhaus |
| IP | ⚡ Portas abertas e vulnerabilidades | Shodan InternetDB |
| IP | Domínios que apontam ou já apontaram para o IP (DNS passivo e reverso) | AlienVault OTX + HackerTarget |
| IP, rede | Dono do bloco (RDAP) | rdap.org |
| Sistema autônomo | ⚡ Quem opera · prefixos anunciados · vizinhos (quem dá e recebe trânsito) | RIPEstat |
| Sistema autônomo | Perfil da rede: site, pontos de troca, data centers, AS-SET | PeeringDB |
| IP, domínio, hash, URL | ⚡ Relatórios de ameaça · reputação no VirusTotal (chave no Cofre) | AlienVault OTX, VirusTotal |
| Hash | ⚡ Arquivo conhecido? Nome, tamanho, produto, se é malicioso, e os outros hashes do mesmo arquivo | CIRCL hashlookup |
| URL | ⚡ Domínio da URL · ⚡ seguir redirecionamentos e ler cabeçalhos | local, o próprio site |
| URL | Repositório do GitHub: dono, contribuidores, e-mails dos commits, site, tópicos | GitHub |
| E-mail | ⚡ Domínio do e-mail (e se ele recebe) · ⚡ perfil no Gravatar · ⚡ contas do GitHub que fazem commits com ele | DNS, Gravatar, GitHub |
| E-mail | ⚡ Chaves PGP: nome real e os outros e-mails da mesma chave (verificados no keys.openpgp.org, autodeclarados no keyserver.ubuntu.com) | servidores de chaves PGP |
| Apelido | Atividade no Hacker News e os sites que o apelido mais divulga · pacotes, repositórios e o e-mail público no npm · conta global da Wikimedia (todas as wikis) | Algolia HN, npm, Wikimedia |
| Apelido, pessoa | Launchpad (apelidos de IRC e chaves GPG) · fediverso (Mastodon e outras instâncias) · Stack Overflow e as contas da mesma pessoa na rede Stack Exchange | Launchpad, mastodon.social, Stack Exchange |
| Apelido | ⚡ Contas com este nome em 19 sites, com nome, cidade, empresa e site de cada perfil; provas do Keybase | APIs dos sites |
| Apelido | Contas em centenas de sites (até 2.434, os mais conhecidos primeiro), cada achado reconferido | regras do Maigret |
| Apelido | GitHub a fundo: e-mails dos commits e das chaves GPG, chaves SSH, repositórios, linguagens, organizações, quem segue e é seguido | GitHub |
| Conta | ⚡ Nome de usuário da conta (para procurar o mesmo nome em outros sites) | local |
| Pessoa | ⚡ Pessoa pública: cargos, onde trabalha e estudou, contas oficiais | Wikidata |
| Pessoa | ⚡ Quantas pessoas no Brasil têm o primeiro nome (risco de homônimo) e a década mais comum de nascimento | IBGE (Censo) |
| Pessoa | Pesquisador: ORCID, instituição e citações · chaves PGP com o nome · contas no Bluesky com o nome · deputado(a) federal | OpenAlex, keyserver.ubuntu.com, Bluesky, Câmara dos Deputados |
| Conta (ORCID) | Perfil completo do ORCID: empregos com cargo e ano, sites, e-mails públicos, outros nomes | ORCID |
| Pessoa | E-mails prováveis nos domínios ligados à pessoa, confirmados no Gravatar | DNS + Gravatar |
| Pessoa | Pesquisador com o nome e a instituição · contas do GitHub com o nome · artigos da Wikipédia · apelidos prováveis | ORCID, GitHub, Wikipédia, local |
| Organização | ⚡ Site oficial, sede, donos, fundadores · artigos da Wikipédia | Wikidata, Wikipédia |
| CNPJ | ⚡ Razão social, nome fantasia, sócios (empresas sócias viram CNPJ), endereço, CEP, telefone, e-mail, regime (Simples, MEI), atividades, matriz da filial | Receita (BrasilAPI, com a Minha Receita de reserva) |
| CPF | ⚡ Validar e ver a região fiscal de emissão | local |
| CEP | ⚡ Endereço e coordenadas | BrasilAPI |
| Telefone | ⚡ Tipo (celular, fixo, 0800, 4004), estado e região pelo DDD, os jeitos de escrever, links do WhatsApp, Telegram e Signal | local |
| Local | ⚡ Coordenadas e mapa | OpenStreetMap |
| Carteira cripto | ⚡ Saldo e as carteiras que mais mandaram e receberam | Blockstream |
| Vulnerabilidade | ⚡ Resumo, CVSS e EPSS (chance de exploração) | MITRE + FIRST |
| Vulnerabilidade | ⚡ Explorada de fato? (catálogo KEV, inclusive uso em ransomware e o prazo de correção) e avistamentos recentes | CISA + CIRCL |
| Texto | ⚡ Extrair entidades | local |
| Telefone, e-mail, apelido, pessoa, CNPJ, organização, domínio, carteira, hash | Procurar na web (telefone em todos os jeitos de escrever) | DuckDuckGo (Bing de reserva) |
| Domínio, pessoa, e-mail, telefone, apelido, CNPJ, organização | Buscas prontas (dorks) para abrir no navegador: documentos, painéis, listagens, backups, vazamentos em Pastebin e nuvem | local |

**Busca ampla de contas:** usa as regras de detecção do [Maigret](https://github.com/soxoj/maigret) (licença MIT, em `vendor/maigret`): 2.434 sites que dizem com certeza se o perfil existe, sem sites adultos. Cada achado é reconferido com um nome que o próprio site garante não existir; se o site disser "existe" também para ele, o achado sai (o histórico lista os sites descartados). A configuração **Sites na busca ampla** escolhe quantos conferir (500 por padrão, uns 30 a 60 segundos). Para atualizar a base: `node ferramentas/atualizar-maigret.mjs`.

**Contas em 18 sites:** GitHub, GitLab, Reddit, Keybase, Hacker News, dev.to, Docker Hub, Chess.com, Lichess, Bluesky, Mastodon, Duolingo, Wikipédia, Codewars, Speedrun.com, Gravatar, Steam e Telegram. Só entram sites que dizem com certeza se o usuário existe (npm, PyPI, Bitbucket e Codeberg ficaram de fora porque respondem igual para quem existe e para quem não existe). Ter o mesmo nome de usuário em dois sites **não prova** que é a mesma pessoa; as **provas do Keybase** provam, porque o dono assinou que as contas são dele.

**Busca na web:** só entra resultado que cita o que se procurou (no título, no trecho ou no endereço). Buscadores bloqueiam muitas consultas automáticas seguidas; quando isso acontece, o aviso diz, e as propriedades trazem o link para **abrir a mesma busca no navegador**. Nome de uma palavra só ("Josh") não é procurado: traria só homônimos.

## Máquinas

| Máquina | Começa em | O que faz |
|---|---|---|
| **Pegada do domínio** | Domínio | DNS, registro, certificado, tecnologias, subdomínios, os IPs de cada um, quem hospeda e o que está exposto |
| **Superfície de ataque** | Domínio | subdomínios de 4 fontes, exploração do site (robots, JavaScript, `.git`, `.env`), documentos, certificados, tecnologias, contatos de segurança, IPs, portas, CVEs e a Wayback Machine |
| **Pessoas da empresa** | Domínio | autores e usuários nos documentos públicos, e-mails e perfis no site e no registro; Gravatar dos e-mails e contas dos perfis |
| **Golpes com a marca** | Domínio | domínios parecidos registrados; quais recebem e-mail, têm certificado, aparecem em relatórios de ameaça e quem registrou |
| **Raio-x do IP** | IP | DNS reverso, sistema autônomo, dono do bloco, localização, portas e vulnerabilidades |
| **Inteligência de ameaça** | IP | relatórios de ameaça, domínios que já apontaram para o IP e a reputação de cada um |
| **Quem é este e-mail** | E-mail | domínio, Gravatar, contas do GitHub com o e-mail, a web e o mesmo nome de usuário em outros sites |
| **Rastro do apelido** | Apelido | contas em 18 sites com os dados de cada perfil e em centenas de outros, o GitHub a fundo, a web e o Gravatar dos e-mails |
| **Pegada da pessoa** | Pessoa | Wikidata, ORCID, Wikipédia, contas do GitHub com o nome, a web, e os apelidos prováveis com as contas que existem |
| **Empresa brasileira** | CNPJ | Receita, as empresas sócias e a matriz, CEP, Wikidata e o domínio do e-mail |
| **Rastro do telefone** | Telefone | tipo e região, apps de mensagem, onde o número aparece na web e o que essas páginas citam |
| **Rastro da carteira** | Carteira cripto | saldo e as carteiras que mais mandaram e receberam, e o mesmo para cada uma delas |

Cada passo tem um teto de entidades, a máquina para sozinha depois de 600 entidades novas, e o × na barra de progresso para tudo.

## Configurações

Aba Plugins › engrenagem do Bluetego:

| Configuração | O que muda |
|---|---|
| **Sites na busca ampla de contas** | quantos sites a busca ampla confere, os mais conhecidos primeiro (20 a 2.434, padrão 500) |
| **Entidades novas por transformação** | o máximo que uma transformação acrescenta de uma vez (padrão 40, até 500); quando corta, o histórico diz quantas havia |
| **IA** | quem pensa: **Agentes de IA da IDE** (o padrão; precisa do Automator ligado), **API da Anthropic**, **Ollama neste PC** ou **Desligada** |
| **Agente da IDE** | o agente de Agentes de IA: `claude`, `codex` ou um que você cadastrou |
| **Modelo da IA** | vazio: o do agente; `claude-sonnet-5-5` na API da Anthropic; `llama3.1` no Ollama |
| **Endereço do Ollama** | onde o Ollama responde (`http://localhost:11434`) |
| **Rodadas do piloto automático** | quantas vezes a IA escolhe e roda transformações antes da conclusão (1 a 10, padrão 4) |

**No Cofre (todos opcionais):** `bluetego.virustotal` (a chave gratuita serve), `bluetego.github` (um token sem nenhuma permissão sobe a cota do GitHub de 60 para 5.000 consultas por hora; sem ele, o aviso diz quando a cota volta) e `bluetego.anthropic` (só se você escolher a API da Anthropic). As chaves nunca passam pela página nem pelo servidor do plugin: o núcleo da IDE as põe no pedido.

## Segurança, dados e limites legais

- **Use em alvos que você pode investigar**: a sua empresa, um cliente com contrato, um incidente que você está tratando. Pesquisar pessoas tem limites legais (no Brasil, a LGPD): use para fins legítimos e não guarde mais do que precisa.
- **CPF:** o Bluetego valida o CPF e mostra a região fiscal de emissão, e cruza com o CPF mascarado que a Receita publica dos sócios. Ele **não** descobre de quem é um CPF nem procura CPF na web: as fontes que fazem isso usam bases vazadas, e o Bluetego não usa.
- **Checagens ativas:** "Explorar o site" pede ao servidor do alvo o `robots.txt`, o sitemap, os arquivos JavaScript da página e três caminhos que nunca deviam responder (`/.git/HEAD`, `/.env`, `/.DS_Store`). São pedidos comuns de leitura, mas aparecem no log do alvo: use só com autorização. Chaves achadas no JavaScript ficam **mascaradas** no grafo.
- **Atribuição:** conteúdo do Stack Exchange e da Wikipédia é CC BY-SA, e o do SANS ISC é CC BY-NC-SA (uso não comercial); GreyNoise, Hudson Rock, CIRCL e Tranco pedem que a fonte seja citada. O relatório exportado cita as fontes nas propriedades; cite-as também se publicar o resultado.
- **E-mail escondido não é revelado:** o Launchpad acha a conta de um e-mail mesmo quando o dono escolheu escondê-lo, e por isso o Bluetego só consulta o Launchpad por nome e apelido. Nome em chave PGP do keyserver.ubuntu.com é autodeclarado (qualquer um publica uma chave com qualquer nome), e a ligação diz isso.
- **Para onde vão os valores:** cada transformação manda o valor à fonte da tabela acima. "Ler o site", "Tecnologias", "Certificado" e "Seguir redirecionamentos" acessam o próprio site do alvo, que vê o seu IP.
- **IA:** o resumo do grafo (valores, propriedades e anotações) vai para o provedor escolhido. Com os Agentes de IA da IDE ou a API da Anthropic, ele sai do PC; com o Ollama, não sai.
- **Onde ficam as investigações:** `~/.bluescreen/plugin-data/bluetego/files/investigacoes/`, uma por arquivo JSON. As exportações vão para `files/exportacoes/`, e o Explorer abre na pasta.
- O servidor do plugin só responde no próprio PC e guarda as respostas por 10 minutos para não repetir consultas.

## Limites conhecidos

- A localização por IP é a do provedor, não a da pessoa.
- crt.sh, Wayback Machine e os buscadores às vezes demoram, caem ou bloqueiam consultas em sequência; a transformação diz o motivo e dá para rodar de novo depois.
- Sem token, a API do GitHub aceita 60 consultas por hora (o Rastro do apelido gasta cerca de 10).
- O Querido Diário (diários oficiais municipais) ficou de fora por enquanto: a API estava fora do ar.
- A HackerTarget (DNS reverso, subdomínios e IDs de rastreamento) deixa 50 consultas gratuitas por dia; quando acabam, a transformação avisa.
- Outras cotas gratuitas: GreyNoise (25 consultas), Stack Exchange (300 por dia), urlscan (30 por minuto e só os últimos 30 dias), Tranco (1 por segundo).
- Ficaram de fora por não serem confiáveis sem chave: abuse.ch (MalwareBazaar, URLhaus, ThreatFox passaram a exigir chave), ransomware.live (respondia 404 para qualquer busca), BGPView (fora do ar), archive.today (bloqueia robôs), DBLP (desafio anti-robô).
- Documentos no formato antigo (`.doc`, `.xls`) e PDFs criptografados não têm os metadados lidos.
- Grafos com mais de 2.000 entidades ficam lentos para organizar; esconda tipos pela legenda ou recolha os resultados grandes.

## Para desenvolver

```
node tests/logica.test.mjs
node tests/novidades.test.mjs
node tests/avancadas.test.mjs
node tests/fontes.test.mjs
```

Os testes não usam a rede: cada fonte responde por um `fetch` falso. A lógica fica em `lib/`: `entidades.mjs` (tipos, detecção, normalização e extração), `transformacoes.mjs` (as transformações), `maquinas.mjs`, `pistas.mjs` (o raciocínio sem IA), `metadados.mjs` (PDF e Office, sem dependências), `maigret.mjs` (a busca ampla de contas) e `ia.mjs` (o pedido e a conferência da resposta da IA). O `server.mjs` liga a rede, o cache e as rotas; o `ui.js` desenha o grafo num canvas, sem bibliotecas de fora.

## Autor e licença

Feito por Martin Hartfelder. Licença MIT (veja o campo `license` do `plugin.json`).

## Histórico de versões

### 0.4.0

- **22 transformações novas com cerca de 30 fontes**, pesquisadas e testadas ao vivo (cada fonte com um valor que existe e um que não existe) antes de entrar:
  - **Infraestrutura e ameaça:** reputação do IP num clique (GreyNoise, SANS ISC, Tor, StopForumSpam, Spamhaus DROP), CVE explorada de fato (CISA KEV, inclusive uso em ransomware) com os avistamentos do CIRCL, hash conhecido (CIRCL hashlookup), credenciais roubadas por infostealer (Hudson Rock), segurança do e-mail (DMARC, DKIM, MTA-STS, TLS-RPT, BIMI, DNSSEC), varreduras do urlscan, popularidade (Tranco), Common Crawl, PeeringDB, e o Team Cymru de reserva para IP→ASN.
  - **Pessoas:** chaves PGP (nome real e outros e-mails), Launchpad, fediverso, Bluesky e Stack Exchange por nome, Hacker News, npm, conta global da Wikimedia, OpenAlex e o perfil completo do ORCID, quantas pessoas têm o primeiro nome (IBGE), deputados federais (Câmara), as cidades do DDD, Hugging Face nos sites de contas e a Wikipédia em inglês.
- As máquinas de IP, ameaça, superfície de ataque, golpes, pegada do domínio, e-mail, apelido e pessoa usam as fontes novas.
- Correção: o servidor não lia respostas do tipo `application/pgp-keys`.

### 0.3.0

- **Contas em até 2.434 sites** com as regras do Maigret, cada achado reconferido com um nome inexistente (zero falso positivo nos testes).
- **Subdomínios de 4 fontes** (crt.sh, certspotter, HackerTarget, Wayback), ordenados pelas que mais confirmam; uma fonte fora do ar não derruba as outras.
- **Documentos e metadados** (como o FOCA): PDFs e documentos do Office do site e da Wayback viram autores, usuários do Windows, empresa e programa. Lê o dicionário do PDF, o XMP e os fluxos compactados.
- **Explorar o site:** robots.txt, sitemap, rotas de API e chaves expostas no JavaScript (mascaradas), `.git`, `.env` e `.DS_Store` expostos, cabeçalhos de segurança.
- **IDs de rastreamento** como entidade nova e o pivô para os outros sites com o mesmo ID; o DNS reverso do IP soma a HackerTarget ao OTX.
- **E-mails prováveis** de uma pessoa nos domínios ligados a ela, confirmados no Gravatar; **buscas prontas** (dorks) para 7 tipos.
- **Aprendizado:** o rendimento de cada transformação por tipo fica anotado; as pistas sugerem primeiro o que rende, e os botões mostram a média.
- As máquinas Superfície de ataque, Pessoas da empresa, Pegada do domínio e Rastro do apelido usam as novidades.
- **Escopo:** as máquinas de domínio só sondam domínios da mesma empresa; vizinhos de hospedagem que aparecem no caminho (outros clientes do mesmo IP ou CDN) são pulados, e o histórico diz quantos.
- **Disjuntor:** um site fora do ar faz as consultas seguintes a ele falharem na hora por 2 minutos, e o histórico resume numa linha só.
- **Visão mais limpa:** rótulos curtos ("GitHub · usuário" em vez da URL), rótulos que desviam das entidades e dos outros rótulos, folhas menores, ligações e setas mais leves, nomes das folhas só de perto quando o grafo é grande, legenda numa linha e minimapa só a partir de 30 entidades.

### 0.2.0

- **Interface:** campo Investigar sempre à mão, barra de ações flutuante sobre a entidade, colar (`Ctrl+V`) e arrastar arquivos no grafo, painel com abas, minimapa, controles de zoom, ajuda de atalhos (`?`), animações de entrada, de reorganização e de câmera, e as entidades giram enquanto são transformadas.
- **Organização:** cinco layouts animados (forças, hierárquico, radial, por tipo, círculo), rótulos sem sobreposição em tamanho fixo, destaque ao passar o mouse, ligações curvas de ida e volta, resultados grandes recolhidos num "+N", foco na vizinhança e linha do tempo para reproduzir a investigação.
- **Ligar à mão:** `L`, Alt + arrastar ou o menu, com sugestões de rótulo pelos tipos; menu nas ligações para mudar, inverter ou remover; nova entidade já ligada (`N`).
- **Pistas:** o Bluetego aponta sozinho as ligações que faltam, a infraestrutura em comum e os próximos passos.
- **IA:** análise, perguntas e piloto automático pelos Agentes de IA da IDE, pela API da Anthropic ou por um Ollama local, com a resposta conferida contra o grafo.
- **Novos tipos:** CNPJ, CPF, CEP, tecnologia e carteira cripto.
- **22 transformações novas:** tecnologias do site, certificado TLS, contatos de segurança, domínios parecidos, DNS passivo e relatórios de ameaça (OTX), vizinhos do sistema autônomo, Receita (com Minha Receita de reserva), CEP, CPF, Wikidata para organizações e pessoas, ORCID, Wikipédia, GitHub a fundo (commits, chaves, rede, repositório, e-mail para conta, nome para conta), coordenadas, Bitcoin e busca na web.
- **Contas em 18 sites** (antes 9), com os dados de cada perfil e as provas do Keybase; busca na web só com resultados que citam o termo.
- **Telefones:** números brasileiros sem +55, 0800 e 4004, região pelo DDD, os jeitos de escrever e os links do WhatsApp, Telegram e Signal.
- **Cinco máquinas novas:** golpes com a marca, inteligência de ameaça, empresa brasileira, rastro da carteira e rastro do telefone.
- Exportação em SVG.

### 0.1.0

- Primeira versão: grafo com física, 16 tipos de entidade, 27 transformações, 7 máquinas, extração de texto e de arquivos do projeto, alertas, anotações, caminho entre entidades, desfazer, e exportação em Markdown, CSV, GraphML, PNG e JSON.
