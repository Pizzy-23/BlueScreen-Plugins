// Testes das fontes novas de IP (sem rede): faixas IPv4 e IPv6, nuvem/CDN/robô, listas de ameaça e DNSBLs,
// histórico de roteamento, DNS passivo, proxy/VPN e certificado servido pelo IP. node tests/ip.test.mjs
import assert from 'node:assert/strict';
import { rodar } from '../lib/transformacoes.mjs';
import { ipNumero, faixa, procurarFaixa } from '../lib/ip.mjs';

let ok = 0;
const pendentes = [];
const caso = (nome, fn) => pendentes.push(Promise.resolve().then(fn).then(() => ok++, (e) => { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }));
function falso(rotas, extra = {}) {
  const achar = (url) => { const k = Object.keys(rotas).filter((p) => url.startsWith(p)).sort((a, b) => b.length - a.length)[0]; return k ? rotas[k] : undefined; };
  const valor = (url) => { const r = achar(url); if (r === undefined) throw new Error('sem rota: ' + url); return typeof r === 'function' ? r(url) : r; };
  return {
    async json(url) { return valor(url); },
    async binario(url) { const v = valor(url); return { status: 200, dados: Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)) }; },
    ...extra,
  };
}

caso('faixas: IPv4, IPv6 (com :: e IPv4 embutido), a mais específica vence', () => {
  assert.equal(ipNumero('10.0.0.1').n, 167772161n);
  assert.equal(ipNumero('::ffff:1.2.3.4').n, ipNumero('0:0:0:0:0:ffff:102:304').n);
  assert.equal(ipNumero('1.2.3'), null); assert.equal(ipNumero('1::2::3'), null); assert.equal(ipNumero('256.1.1.1'), null);
  const fs = [faixa('54.156.0.0/14', 'geral'), faixa('54.156.10.0/24', 'específica'), faixa('2001:4860::/32', 'v6')];
  assert.equal(procurarFaixa(fs, '54.156.10.20').info, 'específica');
  assert.equal(procurarFaixa(fs, '54.157.0.1').info, 'geral');
  assert.equal(procurarFaixa(fs, '2001:4860:4860::8888').info, 'v6');
  assert.equal(procurarFaixa(fs, '8.8.8.8'), null);
});

// todas as listas de nuvem respondem vazias, menos as que o teste preenche
const vazias = {
  'https://ip-ranges.amazonaws.com/': { prefixes: [{ ip_prefix: '54.156.0.0/14', service: 'AMAZON', region: 'us-east-1' }, { ip_prefix: '54.156.0.0/14', service: 'EC2', region: 'us-east-1' }], ipv6_prefixes: [] },
  'https://www.gstatic.com/ipranges/cloud.json': { prefixes: [] },
  'https://www.gstatic.com/ipranges/goog.json': { prefixes: [{ ipv4Prefix: '66.249.64.0/19' }] },
  'https://developers.google.com/': (u) => ({ prefixes: /common-crawlers/.test(u) ? [{ ipv4Prefix: '66.249.66.0/27' }] : [] }),
  'https://www.bing.com/': { prefixes: [] }, 'https://openai.com/': { prefixes: [] },
  'https://www.cloudflare.com/': '', 'https://api.fastly.com/': { addresses: [] }, 'https://docs.oracle.com/': { regions: [] },
  'https://www.microsoft.com/': 'sem link', 'https://www.digitalocean.com/': '', 'https://geoip.linode.com/': '', 'https://geofeed.constant.com/': { subnets: [] },
};
caso('nuvem: serviço específico da AWS vence o "AMAZON" geral; robô verificado; fonte fora do ar não derruba', async () => {
  const ctx = falso(vazias);
  const a = await rodar('nuvem', 'ip', '54.156.10.20', ctx);
  assert.equal(a.props.nuvem, 'AWS'); assert.equal(a.props.serviço, 'EC2'); assert.equal(a.props.região, 'us-east-1');
  const g = await rodar('nuvem', 'ip', '66.249.66.1', ctx);
  assert.match(g.props['robô verificado'], /^Googlebot/);
  assert.ok(g.entidades.some((e) => e.ligacao === 'robô verificado: Googlebot'));
  const n = await rodar('nuvem', 'ip', '187.112.50.10', ctx);
  assert.match(n.props.nuvem, /não está/);
  assert.match(n.props['não responderam'] || '', /Azure/, 'o Azure sem link aparece como fora');
});

caso('listas de ameaça: IPsum, FireHOL, ET, DNSBL com motivo, "127.255" não é listagem, ASN-DROP', async () => {
  const ctx = falso({
    'https://raw.githubusercontent.com/stamparm/': '# comentário\n45.148.10.151\t11\n1.2.3.4\t1\n',
    'https://raw.githubusercontent.com/firehol/': '# x\n45.148.10.0/24\n',
    'https://rules.emergingthreats.net/': '45.148.10.151\n',
    'https://dns.google/resolve': (u) => {
      const q = decodeURIComponent(u);
      if (/151\.10\.148\.45\.dnsbl\.dronebl\.org&type=A/.test(q)) return { Status: 0, Answer: [{ type: 1, data: '127.0.0.13' }] };
      if (/151\.10\.148\.45\.dnsbl\.dronebl\.org&type=TXT/.test(q)) return { Status: 0, Answer: [{ type: 16, data: '"Automated dictionary attacks"' }] };
      if (/bl\.spamcop\.net&type=A/.test(q)) return { Status: 0, Answer: [{ type: 1, data: '127.255.255.254' }] };
      return { Status: 3 };
    },
    'https://stat.ripe.net/data/network-info/': { data: { asns: ['48090'] } },
    'https://www.spamhaus.org/drop/asndrop.json': '{"asn":48090,"asname":"DMZHOST","cc":"SC","domain":"dmzhost.co"}\n{"type":"metadata"}\n',
  });
  const r = await rodar('listas-ameaca', 'ip', '45.148.10.151', ctx);
  assert.equal(r.alerta, true);
  assert.equal(r.props['IPsum (listas que citam o IP)'], 11);
  assert.match(r.props['FireHOL nível 2 (ataques nas últimas 48 h)'], /^sim/);
  assert.equal(r.props['Emerging Threats (comprometidos)'], 'sim');
  assert.equal(r.props['DNSBL DroneBL'], 'listado: Automated dictionary attacks');
  assert.equal(r.props['DNSBL SpamCop'], 'não', 'resolvedor bloqueado não é listagem');
  assert.equal(r.entidades[0].valor, 'AS48090'); assert.equal(r.entidades[0].alerta, true);
  const limpo = await rodar('listas-ameaca', 'ip', '8.8.8.8', falso({ 'https://raw.githubusercontent.com/stamparm/': '45.148.10.151\t11\n', 'https://raw.githubusercontent.com/firehol/': '45.148.10.0/24\n', 'https://rules.emergingthreats.net/': '', 'https://dns.google/resolve': { Status: 3 }, 'https://stat.ripe.net/data/network-info/': { data: { asns: ['15169'] } }, 'https://www.spamhaus.org/drop/asndrop.json': '' }));
  assert.equal(limpo.alerta, false); assert.match(limpo.props['listas de bloqueio'], /nenhuma lista/);
});

caso('histórico: dono atual, outros donos distintos, data de alocação sem hora, RPKI inválido vira alerta', async () => {
  const ctx = falso({
    'https://stat.ripe.net/data/routing-history/': { data: { by_origin: [
      { origin: '18881', prefixes: [{ prefix: '187.112.48.0/21', timelines: [{ starttime: '2010-05-31T00:00:00', endtime: '2026-11-14T00:00:00' }] }] },
      { origin: '10429', prefixes: [{ prefix: '187.112.48.0/21', timelines: [{ starttime: '2020-02-08T00:00:00', endtime: '2020-06-06T00:00:00' }] }, { prefix: '187.112.0.0/14', timelines: [{ starttime: '2019-01-01T00:00:00', endtime: '2019-02-01T00:00:00' }] }] },
      { origin: '1', prefixes: [{ prefix: '0.0.0.0/1', timelines: [{ starttime: '2026-01-01T00:00:00', endtime: '2026-12-01T00:00:00' }] }] },
    ] } },
    'https://stat.ripe.net/data/rir/': { data: { rirs: [{ rir: 'LACNIC', registration: '2009-12-08T00:00:00', resource: '187.112.0.0/14', country: 'BR' }] } },
    'https://stat.ripe.net/data/rpki-validation/': { data: { status: 'invalid' } },
  });
  const r = await rodar('ip-historico', 'ip', '187.112.50.10', ctx);
  assert.equal(r.props['anunciado por'], 'AS18881 em 187.112.48.0/21', 'o /1 é ruído e fica de fora');
  assert.equal(r.props['outros donos do bloco'], 1);
  assert.equal(r.props['bloco alocado em'], '2009-12-08');
  assert.equal(r.alerta, true); assert.match(r.props.RPKI, /INVÁLIDO/);
});

caso('DNS passivo: datas do Mnemonic, domínios de agora do ip.thc.org, sem reverso', async () => {
  const ctx = falso({ 'https://api.mnemonic.no/': { count: 2, data: [{ query: 'somado.me.', firstSeenTimestamp: Date.UTC(2022, 0, 2), lastSeenTimestamp: Date.UTC(2022, 5, 1), times: 7 }, { query: '151.10.148.45.in-addr.arpa' }] } }, { async post() { return { matching_records: 1, domains: [{ domain: 'agora.com.br' }] }; } });
  const r = await rodar('dns-passivo', 'ip', '45.148.10.151', ctx);
  const por = Object.fromEntries(r.entidades.map((e) => [e.valor, e]));
  assert.equal(por['somado.me'].props['visto de'], '2022-01-02');
  assert.equal(por['agora.com.br'].ligacao, 'aponta para este IP');
  assert.equal(r.entidades.length, 2);
});

caso('proxy/VPN e certificado servido pelo IP', async () => {
  const p = await rodar('proxy-vpn', 'ip', '185.220.101.4', falso({ 'https://proxycheck.io/': { '185.220.101.4': { detections: { proxy: true, anonymous: true, risk: 100 }, network: { type: 'Business', provider: 'X' }, attack_history: { login_attempt: 2 } } } }));
  assert.equal(p.alerta, true); assert.equal(p.props['proxy/VPN'], 'proxy, anônimo'); assert.equal(p.props['ataques vistos'], 'login attempt: 2');
  const c = await rodar('certificado-ip', 'ip', '1.1.1.1', { async tlsIp() { return { cn: 'cloudflare-dns.com', org: 'Cloudflare, Inc.', emissor: 'SSL Corp', ate: 'Dec 21 23:59:59 2026 GMT', san: ['cloudflare-dns.com', '*.cloudflare-dns.com', 'one.one.one.one'], sha256: 'AA', auto: false }; } });
  assert.deepEqual(c.entidades.map((e) => e.valor).sort(), ['Cloudflare, Inc.', 'cloudflare-dns.com', 'one.one.one.one']);
  assert.equal(c.props['válido até'], '2026-12-21');
});

await Promise.all(pendentes);
console.log(`testes das fontes novas de IP do Bluetego: ${ok} de ${pendentes.length} passaram`);
