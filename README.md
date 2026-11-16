# BlueScreen-Plugins

Os plugins da loja do [BlueScreen](https://github.com/martindevbr/BlueScreen-IDE). Cada pasta de `plugins/` é um plugin, com o README dele; a loja da IDE (painel **Plugins**, `Alt+7`) lê este repositório direto do branch `main`, então o que entra aqui chega a todo mundo.

## Instalar

Pela IDE: painel **Plugins** (`Alt+7`) › **Loja de plugins** › **Instalar**. O plugin liga na hora, e a IDE avisa quando sair versão nova.

À mão: copie a pasta do plugin para `~/.bluescreen/plugins/<id>` e ligue na aba Plugins. Os que têm servidor (`server.mjs`) precisam do Node.js 18 ou mais novo.

## Colaborar

Plugins novos, correções e ideias são bem-vindos. O caminho completo está em [CONTRIBUTING.md](CONTRIBUTING.md). Em resumo:

```
node ferramentas/plugins.mjs novo meu-plugin --nome "Meu Plugin" --autor "Seu Nome" --categoria produtividade
node ferramentas/plugins.mjs tudo
```

Depois, um pull request para o `main`. O CI confere o padrão (manifesto, README, ícone, nós do Automator, sintaxe, segredos vazados, testes e versão), e o plugin entra na loja quando o PR é aceito.

- Achou um problema num plugin? [Abra uma issue](https://github.com/martindevbr/BlueScreen-Plugins/issues/new/choose).
- Tem a ideia, mas não vai escrever o código? Use o modelo **Ideia de plugin** nas issues.

## Como o repositório é organizado

```
plugins/<id>/          um plugin: plugin.json, README.md, ícone e o código (ui.js, style.css, server.mjs, automator.json)
modelo-de-plugin/      o ponto de partida do comando "novo"
ferramentas/           plugins.mjs: validar, testar, gerar fichas, conferir versões, criar plugin
.github/               CI, modelos de issue e de pull request
```

## Licença

Cada plugin tem a sua licença, no campo `license` do `plugin.json` e na ficha do README dele. Plugins novos nascem MIT. `NOASSERTION` quer dizer que o autor ainda não escolheu: até lá, o código não pode ser reaproveitado. O resto do repositório (ferramentas, modelo, CI) é MIT: veja [LICENSE](LICENSE).
