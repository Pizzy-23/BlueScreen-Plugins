# BlueCircuito

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Martin Hartfelder |
| **Versão** | 0.1.0 |
| **Licença** | MIT |
| **Categoria** | Desenvolvimento |
| **Precisa de** | Node.js 18+ |
| **Código** | [plugins/bluecircuito](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/bluecircuito) |
<!-- ficha:fim -->

Descreva a automação que você quer montar ("quando a terra do vaso secar, ligar a bomba e me avisar no celular") e uma IA que roda no seu PC (Claude Code, Codex, Gemini CLI ou Ollama) projeta o protótipo: placa, peças, ligações pino a pino, o fluxo do programa, o código, o passo a passo de montagem e a lista de compras. Antes de chegar até você, o projeto passa por uma conferência elétrica feita por regras, sem IA, que pega o que queima ou não funciona: 5 V num pino de 3,3 V, LED sem resistor, ADC2 com Wi-Fi ligado, dois sensores no mesmo endereço I2C, servo puxando corrente da placa, GND separado, código usando um pino diferente da ligação. Com erro, o BlueCircuito devolve a lista para a IA corrigir sozinha. Depois dá para simular no Wokwi e compilar e gravar na placa pelo PlatformIO, sem sair da IDE.

Para quem mexe com ESP32, Arduino e Raspberry Pi Pico e quer sair da ideia para a protoboard sem queimar peça.

## Como usar

1. Abra pelo ícone do BlueCircuito na barra da esquerda (ou **Buscar em tudo** › *BlueCircuito: abrir*). A lista de projetos fica no painel da esquerda.
2. Num projeto novo, escreva o que quer montar. Escolha a placa e a linguagem (ou deixe a IA escolher) e clique em **Projetar**.
3. A IA trabalha no seu PC; o tempo aparece embaixo da conversa e **Parar** interrompe. Quando ela termina, a conferência roda. Se achar erro, o BlueCircuito pede a correção sozinho (veja **Correções automáticas** em Configurações).
4. Para mudar alguma coisa, peça na conversa: "troque o DHT11 pelo BME280", "use bateria", "ponha um display". A IA devolve o projeto inteiro já alterado, e a conferência roda de novo. **Desfazer** (`Ctrl+Z`) volta a mudança.

As abas:

- **Ligações**: a placa com os pinos dos dois lados, como na placa de verdade, e as peças ao redor. Fios coloridos por função (GND cinza, 3,3 V laranja, 5 V vermelho, SDA azul, SCL amarelo). Arraste uma peça para reorganizar, arraste de um pino até outro para ligar, clique num fio para tirar, botão direito numa peça para renomear ou tirar. **Peça** acrescenta uma peça do catálogo. Pinos e peças com erro ficam em vermelho. Roda do mouse aproxima; `F` ajusta à tela.
- **Peças e compras**: lista de compras com preço estimado e busca pronta no Mercado Livre, AliExpress e Shopee, mais o que cada peça faz no projeto.
- **Fluxo**: o comportamento do programa em diagrama (início, leituras, decisões com sim e não, ações, esperas, rede).
- **Código**: o código completo, as bibliotecas e o que trocar antes de gravar (nome e senha do Wi-Fi, por exemplo). **Compilar**, **Editor** (abre o arquivo na IDE) e **Serial** (monitor no terminal). Se a compilação falhar, **Corrigir com a IA** manda o erro do compilador para a IA.
- **Montagem**: passo a passo com caixas para marcar, como testar cada parte e os cuidados de segurança.
- **Conferência**: cada erro, aviso e dica, com **Ver** para achar no diagrama, e o consumo de cada alimentação comparado com o que ela aguenta.
- **Pinos**: todos os GPIOs da placa com o que cada um faz (ADC, PWM, toque, só entrada, pino de boot), em que está ligado e quais estão livres.

Na barra de cima:

- **Simular** copia o diagrama do Wokwi e abre o wokwi.com: cole na aba `diagram.json` e o código no `sketch.ino`. Funciona com ESP32 DevKit, Arduino Uno e Raspberry Pi Pico (peças sem equivalente no Wokwi ficam de fora, com aviso).
- **Salvar pasta** grava o projeto em `Documentos\BlueCircuito\<nome>`: `platformio.ini` e `src/main.cpp` (ou `main.py`, ou o YAML do ESPHome), `diagram.json` e `wokwi.toml` (para a extensão Wokwi do VS Code), `LEIA-ME.md` com lista de compras, tabela de ligações e passo a passo, e `bluecircuito.json` com o projeto. Código que você mexeu na pasta não se perde: a versão anterior fica ao lado, com `.antes`.
- **Gravar** salva a pasta, compila e grava na placa pelo USB. Arduino usa o PlatformIO (`pio`, também o da extensão do VS Code); MicroPython usa o `mpremote`; ESPHome abre o `esphome run` no terminal. Se a ferramenta não estiver instalada, o BlueCircuito roda a instalação no terminal.

Placas: ESP32 DevKit V1, ESP32-S3 DevKitC-1, ESP32-C3 SuperMini, NodeMCU ESP8266, Arduino Uno, Arduino Nano, Raspberry Pi Pico e Pico W. São 37 peças no catálogo: sensores (DHT11/22, DS18B20, BME280, BMP280, MPU-6050, ultrassom, presença, umidade do solo, gás, célula de carga, corrente, RFID, luz), displays (OLED, LCD I2C, TM1637), relé, servo, motores com driver, fita de LED, encoder, cartão microSD, conversor de nível, fontes e bateria.

## Configurações

- **IA**: *Agentes de IA da IDE* usa o agente configurado na IDE (precisa do Automator ligado); *Gemini CLI* chama o `gemini`; *Ollama* usa o servidor do Ollama no seu PC. A IA só lê: quem grava arquivos é o BlueCircuito.
- **Agente da IDE**: o id do agente (`claude`, `codex` ou um que você cadastrou em Agentes de IA).
- **Modelo da IA**: vazio usa o do agente; no Ollama, `qwen2.5-coder:7b`.
- **Endereço do Ollama**: onde o Ollama responde (padrão `http://localhost:11434`).
- **Correções automáticas**: quantas vezes os erros da conferência voltam para a IA antes de aparecerem para você (0 a 5; padrão 2).
- **Pedir correção também dos avisos**: ligado, os avisos (funciona, mas com risco) também voltam para a IA.
- **Pasta dos projetos**: onde **Salvar pasta** e **Gravar** criam a pasta de cada projeto. Vazio: `Documentos\BlueCircuito`.

## O que a conferência elétrica confere

Tudo sai do catálogo do plugin (`lib/catalogo.mjs`), não da palavra da IA:

- **Tensão**: cada peça alimentada dentro da faixa dela; sinal de 5 V chegando num pino de 3,3 V (HC-SR04, MQ-2); placa de 5 V mandando sinal para chip de 3,3 V (RC522); módulo I2C de 5 V puxando SDA/SCL numa placa de 3,3 V.
- **Pinos**: só entrada usado como saída (GPIO34 a 39 do ESP32), leitura analógica em pino sem ADC, ADC2 com Wi-Fi, pinos de boot e da serial, pinos ocupados pela memória, I2C fora dos pinos fixos do Uno e do Nano, duas peças no mesmo pino, curto entre alimentações ou com o GND.
- **Corrente**: soma do consumo em cada alimentação contra o que ela dá (o 3,3 V do Uno dá 50 mA; uma fita de 60 LEDs pede 3,6 A), servo e motor na alimentação da placa, peça puxando mais do que o pino aguenta.
- **Montagem**: LED sem resistor ou invertido, DS18B20 sem pull-up, motor DC sem driver, GND da fonte externa sem ligação com o da placa, pino obrigatório solto, endereço I2C repetido (MPU-6050 e DS3231 no 0x68).
- **Código**: o código usa os mesmos GPIOs das ligações (Arduino, MicroPython e ESPHome).

Erro é o que queima, não liga ou não funciona; aviso funciona, mas com risco ou pegadinha; dica é melhoria. A conferência não substitui o multímetro: confira a montagem com a placa desligada antes de energizar.

## Segurança e dados

- A descrição do projeto e o projeto atual vão só para a IA que você escolheu, rodando no seu PC (ou para o serviço que ela usa, como a Anthropic no Claude Code).
- O plugin não manda nada para a internet por conta própria. Os botões das lojas e do Wokwi abrem o navegador.
- Projetos ficam na pasta de dados do plugin; a pasta exportada fica onde você escolheu.
- Tomada (127/220 V) mata. Quando o projeto tem relé com carga de tomada, a aba Montagem traz os cuidados, mas montagem de rede elétrica é com quem sabe.

## Para desenvolver

- `lib/catalogo.mjs`: placas e peças. Peça nova: pinos com papel (`vcc` com faixa, `gnd`, `in`, `out`, `analog`, `io`, `sda`, `scl`, `mosi`, `miso`, `sck`, `cs`, `passivo`, `carga`, `fonte`), consumo, preço e o mapa do Wokwi quando houver.
- `lib/conferir.mjs`: a conferência (redes por união de pontos, depois regras por rede e por peça).
- `lib/ia.mjs`: o pedido para a IA e a leitura da resposta; `lib/exportar.mjs`: PlatformIO, Wokwi e LEIA-ME; `lib/desenho.mjs`: posição de cada coisa no diagrama.
- Testes: `node tests/conferir.test.mjs` e `node tests/ia.test.mjs`.

## Autor e licença

Feito por Martin Hartfelder. Licença MIT.

## Histórico de versões

### 0.1.0

- Primeira versão: projeto por IA local (Agentes de IA da IDE, Gemini CLI ou Ollama), catálogo com 8 placas e 37 peças, conferência elétrica sem IA com correção automática, diagrama de ligações editável, fluxo, código, montagem, lista de compras, pinos, simulação no Wokwi, exportação para PlatformIO, MicroPython e ESPHome, e compilar, gravar e monitor serial.
