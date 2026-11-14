# Bluetego

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Martin Hartfelder |
| **Versão** | 0.1.0 |
| **Licença** | MIT |
| **Categoria** | Outros |
| **Precisa de** | BlueScreen 2.1.33 ou mais novo · Node.js 18+ |
| **Código** | [plugins/bluetego](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/bluetego) |
<!-- ficha:fim -->

Investigação OSINT em grafo dentro do BlueScreen, no estilo do Maltego: você põe uma entidade (um domínio, um IP, um e-mail, um apelido) e puxa o que está ligado a ela, em cadeia, até enxergar a infraestrutura, as pessoas e os pontos fracos. Serve para reconhecimento em pentest autorizado, resposta a incidente, conferir a exposição da própria empresa e due diligence de fornecedores.

O que ele faz diferente do Maltego:

- **Sem conta, sem licença, sem créditos.** As 27 transformações usam fontes públicas e gratuitas. Só o VirusTotal pede a sua chave (a gratuita serve), guardada no Cofre da IDE.
- **Máquinas prontas** que encadeiam transformações como um investigador faria à mão (pegada do domínio, superfície de ataque, quem é este e-mail...).
- **Alertas no grafo**: portas que não deviam estar expostas (RDP, SMB, bancos de dados), CVEs, domínio sem DMARC, endereços arquivados que costumam esconder backups e painéis, reputação ruim no VirusTotal.
- **Extração de texto**: cole um log, um e-mail ou um relatório, ou use um arquivo do projeto, e as entidades viram nós.
- **Tudo local**: as investigações ficam na pasta de dados do plugin, com anotações, cores, histórico e desfazer.

## Como usar

O Bluetego aparece na barra da esquerda (ícone de grafo). Ele abre o grafo numa aba fixa e, na esquerda, a lista de investigações e os tipos de entidade no grafo.

1. Escreva um valor na tela inicial (`exemplo.com.br`, `8.8.8.8`, `ana@empresa.com`, `@usuario`, `CVE-2024-3400`) e clique em **Investigar**. O tipo é adivinhado pelo valor e as transformações rápidas já rodam.
2. **Duplo clique** numa entidade (ou `Enter`) roda as rápidas de novo; **botão direito** mostra todas as transformações e as máquinas do tipo dela.
3. Clique numa entidade para ver as propriedades, as ligações, escrever anotações e marcar com uma cor, no painel da direita.
4. Rode uma **máquina** (botão **Máquinas** na barra, ou na entidade) para fazer várias transformações em sequência.
5. **Exportar** gera o relatório em Markdown, uma planilha CSV, GraphML (abre no Gephi, no yEd ou no Maltego), a imagem do grafo ou a investigação inteira em JSON.

| | |
|---|---|
| **Duplo clique** | na entidade: rodar as rápidas · no fundo: adicionar entidade |
| **Botão direito** | transformações, máquinas, abrir no navegador, marcar, fixar, remover os resultados soltos |
| **Shift + arrastar** no fundo | selecionar várias (as transformações rodam em todas) |
| **Ctrl + clique** | somar ou tirar da seleção |
| **Arrastar** uma entidade | move e fixa a posição |
| `F` · `Ctrl+Z` · `Ctrl+Y` · `Del` · `Ctrl+C` · `Ctrl+A` | ajustar à tela · desfazer · refazer · remover · copiar os valores · selecionar tudo |
| **Procurar no grafo** | apaga o que não combina com o texto (valor, rótulo, anotação, propriedades); `Enter` seleciona o que achou |
| **Legenda** (embaixo) ou **Tipos no grafo** (esquerda) | esconde e mostra um tipo de entidade |
| Duas entidades selecionadas | **Mostrar o caminho entre as duas** |
| **Buscar em tudo** | "Bluetego: abrir", "Bluetego: nova investigação", "Bluetego: extrair entidades da seleção do editor" |
| Botão direito num arquivo do projeto | **Extrair entidades no Bluetego** |

O painel da direita, sem nada selecionado, mostra o resumo: os **pontos de atenção** (entidades com alerta), os **pontos de encontro** (as entidades com mais ligações, que costumam unir a investigação) e o histórico.

## Transformações

As marcadas com ⚡ são as rápidas, que o duplo clique roda.

| De | Transformação | Fonte |
|---|---|---|
| Domínio | ⚡ Resolver IPs (A, AAAA, CNAME) | DNS sobre HTTPS (Google, Cloudflare de reserva) |
| Domínio | ⚡ Servidores de e-mail (MX) | DNS |
| Domínio | ⚡ Servidores de nomes (NS) | DNS |
| Domínio | ⚡ TXT, SPF e DMARC: os serviços que a empresa usa (Microsoft 365, Google, Atlassian...) e quem pode mandar e-mail por ela | DNS |
| Domínio | ⚡ Registro (RDAP/WHOIS): registrante, registrador, contatos, datas | rdap.org |
| Domínio | Subdomínios pelos certificados emitidos | crt.sh |
| Domínio | Ler o site: título, tecnologia, e-mails, telefones, perfis sociais, domínios citados | o próprio site |
| Domínio | Endereços arquivados, primeiro os que interessam (backups, painéis, APIs, `.env`) | Wayback Machine |
| IP | ⚡ DNS reverso (PTR) | DNS |
| IP | ⚡ Sistema autônomo e prefixo | RIPEstat |
| IP | ⚡ Localização e provedor (aproximada) | ipwho.is |
| IP | ⚡ Portas abertas e vulnerabilidades | Shodan InternetDB |
| IP, rede | Dono do bloco (RDAP) | rdap.org |
| Sistema autônomo | ⚡ Quem opera · Prefixos anunciados | RIPEstat |
| URL, conta | ⚡ Domínio da URL | local |
| URL | ⚡ Seguir redirecionamentos e ler cabeçalhos | o próprio site |
| E-mail | ⚡ Domínio do e-mail (e se ele recebe mensagens) | DNS |
| E-mail | ⚡ Perfil no Gravatar: nome, local, empresa, contas verificadas | Gravatar |
| Pessoa | Apelidos prováveis a partir do nome | local |
| Apelido | ⚡ Procurar contas com este nome (GitHub, GitLab, Reddit, Keybase, Hacker News, dev.to, Docker Hub, Chess.com, Lichess) | APIs dos sites |
| Apelido | Perfil e e-mails dos commits públicos no GitHub | GitHub |
| Conta | ⚡ Nome de usuário da conta (para procurar o mesmo nome em outros sites) | local |
| Telefone | ⚡ País e, no Brasil, estado e se é celular | local |
| Vulnerabilidade | ⚡ Resumo, CVSS, fornecedor e EPSS (chance de exploração) | MITRE + FIRST |
| Texto | ⚡ Extrair entidades | local |
| Domínio, IP, hash, URL | Reputação no VirusTotal | VirusTotal (chave no Cofre) |

A procura de contas só usa sites com API que responde "não existe" de forma confiável: nada de adivinhar por página de erro, então não há falso positivo. O npm e o PyPI ficaram de fora por isso.

## Máquinas

| Máquina | Começa em | O que faz |
|---|---|---|
| **Pegada do domínio** | Domínio | DNS, registro, serviços no TXT, subdomínios, os IPs de cada um, quem hospeda e o que está exposto |
| **Superfície de ataque** | Domínio | subdomínios, IPs, portas abertas, CVEs conhecidos e endereços esquecidos na Wayback Machine |
| **Pessoas da empresa** | Domínio | e-mails e perfis no site e no registro; o Gravatar dos e-mails e as contas dos perfis |
| **Raio-x do IP** | IP | DNS reverso, sistema autônomo, dono do bloco, localização, portas e vulnerabilidades |
| **Quem é este e-mail** | E-mail | domínio, Gravatar, contas verificadas e o mesmo nome de usuário em outros sites |
| **Rastro do apelido** | Apelido | contas em 9 sites, perfil e e-mails de commits no GitHub, Gravatar desses e-mails |
| **Pegada da pessoa** | Pessoa | apelidos prováveis e as contas que existem com eles |

Cada passo tem um teto de entidades (uma máquina não transforma 500 subdomínios um a um), e a máquina para sozinha depois de 600 entidades novas. O botão × na barra de progresso para tudo.

## Configurações

Aba Plugins › engrenagem do Bluetego:

| Configuração | O que muda |
|---|---|
| **Entidades novas por transformação** | o máximo que uma transformação acrescenta de uma vez (subdomínios, endereços arquivados, prefixos, portas). Padrão 40, até 500. Quando corta, o histórico diz quantas havia |

**VirusTotal (opcional):** na primeira vez que você rodar "Reputação no VirusTotal", o Cofre abre pedindo a chave `bluetego.virustotal`, já liberada só para `www.virustotal.com`. A chave nunca passa pela página nem pelo servidor do plugin: o núcleo da IDE a põe no pedido.

## Segurança e dados

- **Use em alvos que você pode investigar**: a sua empresa, um cliente com contrato de pentest, um incidente que você está tratando. As transformações só consultam fontes públicas e não atacam nada, mas "Ler o site" e "Seguir redirecionamentos" acessam o próprio site do alvo, que vê o seu IP e o agente `Bluetego/0.1`.
- **Para onde vão os valores:** cada transformação manda o valor da entidade à fonte da tabela acima (o domínio ao crt.sh, o IP ao Shodan InternetDB...). Nada vai para servidores do BlueScreen ou de terceiros além dessas fontes.
- **Onde ficam as investigações:** `~/.bluescreen/plugin-data/bluetego/files/investigacoes/`, uma por arquivo JSON. As exportações vão para `files/exportacoes/`, e o Explorer abre na pasta.
- O servidor do plugin só responde no próprio PC e guarda as respostas por 10 minutos para não repetir consultas.

## Limites conhecidos

- A localização por IP é a do provedor, não a da pessoa.
- O crt.sh e a Wayback Machine às vezes demoram ou caem; a transformação falha com o motivo e dá para rodar de novo depois.
- A API do GitHub sem token aceita 60 consultas por hora; o RIPEstat e o ipwho.is também limitam consultas em rajada.
- Grafos com mais de 2.000 entidades ficam lentos para organizar; esconda tipos pela legenda ou remova os resultados soltos.

## Para desenvolver

```
node tests/logica.test.mjs
```

Os testes não usam a rede: cada fonte responde por um `fetch` falso. A lógica fica em `lib/` (`entidades.mjs`: tipos, detecção, normalização e extração; `transformacoes.mjs`: as transformações; `maquinas.mjs`), o `server.mjs` só liga a rede e as rotas, e o `ui.js` desenha o grafo num canvas, sem bibliotecas de fora.

## Autor e licença

Feito por Martin Hartfelder. Licença MIT (veja o campo `license` do `plugin.json`).

## Histórico de versões

### 0.1.0

- Primeira versão: grafo com física, 16 tipos de entidade, 27 transformações, 7 máquinas, extração de texto e de arquivos do projeto, alertas, anotações, caminho entre entidades, desfazer, e exportação em Markdown, CSV, GraphML, PNG e JSON.
