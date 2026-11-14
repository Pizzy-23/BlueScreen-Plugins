// Testes do localizador de empresa pelo nome e a cidade (sem rede): a cidade no fim do texto, o filtro das páginas,
// a ficha schema.org dos diretórios, a conferência do CNPJ na Receita e o buscador bloqueado. node tests/localizar.test.mjs
import assert from 'node:assert/strict';
import { rodar } from '../lib/transformacoes.mjs';
import { detectar } from '../lib/entidades.mjs';
import { separarCidade, citaNome, citaCidade, palavras } from '../lib/localizar.mjs';

let ok = 0;
const pendentes = [];
const caso = (nome, fn) => pendentes.push(Promise.resolve().then(fn).then(() => ok++, (e) => { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }));
const MUN = [['Tramandaí', 'RS'], ['Osório', 'RS'], ['Pedro Osório', 'RS'], ['Capão da Canoa', 'RS'], ['Canoas', 'RS'], ['São José', 'SC'], ['Bom Jesus', 'RS'], ['Bom Jesus', 'PI']].map(([n, uf]) => ({ 'municipio-nome': n, 'UF-sigla': uf }));
const mapa = new Map();
for (const x of MUN) { const k = x['municipio-nome'].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); (mapa.get(k) || mapa.set(k, []).get(k)).push({ nome: x['municipio-nome'], uf: x['UF-sigla'] }); }

caso('nome de negócio vira organização; nome de gente continua pessoa', () => {
  assert.equal(detectar('Oficina de Costura Neca tramandai'), 'organizacao');
  assert.equal(detectar('Neca Costuras ME'), 'organizacao');
  assert.equal(detectar('Maria Me Ajuda'), 'pessoa', '"me" minúsculo é palavra, não microempresa');
  assert.equal(detectar('Ana Maria Souza'), 'pessoa');
});
caso('cidade no fim: sem acento, com UF, a mais longa, homônimas', () => {
  assert.deepEqual(separarCidade('Oficina de Costura Neca tramandai', mapa), { nome: 'Oficina de Costura Neca', cidade: 'Tramandaí', uf: 'RS', outras: [] });
  assert.equal(separarCidade('Salão Bela Capão da Canoa RS', mapa).cidade, 'Capão da Canoa');
  assert.equal(separarCidade('Padaria Pão Quente Pedro Osório', mapa).cidade, 'Pedro Osório');
  const b = separarCidade('Farmácia Central Bom Jesus', mapa);
  assert.equal(b.cidade, 'Bom Jesus'); assert.deepEqual(b.outras, ['PI'], 'avisa que há outra Bom Jesus');
  assert.equal(separarCidade('Farmácia Central Bom Jesus - PI', mapa).uf, 'PI');
  assert.deepEqual(separarCidade('Oficina de Costura Neca', mapa), { nome: 'Oficina de Costura Neca', cidade: '', uf: '', outras: [] });
});
caso('página: o nome inteiro em qualquer ordem (também no endereço); a cidade fora de um município maior', () => {
  const r = { url: 'https://www.cylex.com.br/tramandai/oficina-de-costura-neca-1.html', titulo: 'Costureiras', trecho: '' };
  assert.ok(citaNome(r, 'Oficina de Costura Neca'));
  assert.ok(!citaNome({ url: 'https://x.com', titulo: 'Oficina de Costura Maria', trecho: '' }, 'Oficina de Costura Neca'));
  assert.deepEqual(palavras('Oficina de Costura da Neca'), ['oficina', 'costura', 'neca']);
  const pedro = { url: 'https://a.com', titulo: 'Padaria Pão Quente em Pedro Osório, RS', trecho: '' };
  assert.ok(!citaCidade(pedro, 'Osório', ['pedroosorio']), 'Pedro Osório não é Osório');
  assert.ok(citaCidade(pedro, 'Pedro Osório', []));
  assert.ok(citaCidade({ url: 'https://a.com', titulo: 'Neca, Tramanda í', trecho: '' }, 'Tramandaí'), 'o trecho com a letra separada também conta');
});

// o DuckDuckGo devolve HTML; cada resultado é um bloco "result__body"
const ddg = (itens) => itens.map(([url, titulo, trecho]) => `<div class="result__body"><a class="result__a" href="${url}">${titulo}</a><a class="result__snippet">${trecho}</a></div>`).join('');
const ibge = MUN;
function contexto({ resultados, paginas = {}, receita = {}, bloqueado = false } = {}) {
  const pedidos = [];
  return {
    pedidos,
    async json(url) { pedidos.push(url); if (url.includes('ibge.gov.br')) return ibge; const c = url.match(/cnpj\/v1\/(\d+)/); if (c) return receita[c[1]] || null; throw new Error('sem rota ' + url); },
    async pagina(url) {
      pedidos.push(url);
      if (url.includes('duckduckgo.com')) return bloqueado ? { status: 202, texto: 'anomaly' } : { status: 200, texto: ddg(resultados) };
      if (url.includes('bing.com')) return { status: 200, texto: '<li class="b_algo"><h2><a href="https://word.cloud.microsoft/">Microsoft Word</a></h2><p>Escreva e edite</p></li>' };
      if (paginas[url]) return { status: 200, url, texto: paginas[url] };
      return { status: 404, texto: '' };
    },
    async cofre() { throw new Error('sem chave do Brave'); },
  };
}
caso('acha endereço e telefone pela ficha schema.org, perfil sem o /about, CNPJ só quando a Receita confere', async () => {
  const ficha = '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Oficina de Costura Neca","telephone":["(51) 3684-2819"],"address":{"streetAddress":"Madalena da Conceição 365","addressLocality":"Tramandaí","postalCode":"95590-000"},"geo":{"latitude":"-29.99","longitude":"-50.14"}}</script>';
  const ctx = contexto({
    resultados: [
      ['https://www.cylex.com.br/tramandai/oficina-de-costura-neca-1.html', 'Oficina de Costura Neca | Costureiras, Tramandaí, RS', 'R . Madalena da Conceição, 365 em Tramanda<b>í</b>'],
      ['https://www.facebook.com/oficinacosturaneca/about/', 'Oficina de Costura NECA , Tramandaí', '49 likes'],
      ['https://cnpj.biz/11222333000181', 'Oficina de Costura Neca Tramandaí - CNPJ 11.222.333/0001-81', ''],
      ['https://cnpj.biz/45723174000110', 'Oficina de Costura Neca Tramandaí - outra', ''],
      ['https://www.tiktok.com/tag/oficinadecosturaneca', '#oficinadecosturaneca Tramandaí', ''],
      ['https://outra.com/recife', 'Oficina de Costura Neca | Recife', 'Recife - PE'],
    ],
    paginas: { 'https://www.cylex.com.br/tramandai/oficina-de-costura-neca-1.html': ficha },
    receita: {
      11222333000181: { municipio: 'TRAMANDAI', razao_social: 'MARIA DA SILVA', nome_fantasia: 'OFICINA DE COSTURA NECA', descricao_situacao_cadastral: 'ATIVA' },
      45723174000110: { municipio: 'RECIFE', razao_social: 'OFICINA DE COSTURA NECA LTDA', nome_fantasia: '' },
    },
  });
  const r = await rodar('localizar-empresa', 'organizacao', 'Oficina de Costura Neca tramandai', ctx);
  const por = (t) => r.entidades.filter((e) => e.tipo === t);
  assert.equal(por('telefone')[0].valor, '+555136842819');
  assert.match(por('local')[0].valor, /Madalena da Conceição 365, Tramandaí, 95590-000/, 'o endereço com CEP da ficha vence');
  assert.ok(por('local')[0].props.mapa.includes('-29.99'));
  assert.deepEqual(por('conta').map((e) => e.valor), ['https://www.facebook.com/oficinacosturaneca']);
  assert.deepEqual(por('cnpj').map((e) => e.valor), ['11.222.333/0001-81'], 'o de Recife não confere');
  assert.equal(por('cnpj')[0].props['nome fantasia'], 'OFICINA DE COSTURA NECA');
  assert.ok(!por('url').some((e) => /tiktok|recife/.test(e.valor)), 'hashtag e outra cidade fora');
  assert.match(r.props['citam o nome sem citar a cidade'], /Recife/);
});
caso('buscador bloqueado: o aviso diz isso (e sugere o Brave), não "nenhuma página"', async () => {
  const r = await rodar('localizar-empresa', 'organizacao', 'Hexor Tecnologia Tramandaí', contexto({ bloqueado: true }));
  assert.equal(r.entidades.length, 0);
  assert.match(r.aviso, /verificação de robô.*Brave/);
});

await Promise.all(pendentes);
console.log(`testes do localizador de empresa do Bluetego: ${ok} de ${pendentes.length} passaram`);
