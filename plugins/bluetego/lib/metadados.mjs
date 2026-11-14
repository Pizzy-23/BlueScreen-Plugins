// Bluetego: metadados de documentos, como o FOCA. Um PDF ou um docx público costuma levar o nome de quem escreveu,
// o usuário do Windows (no caminho do arquivo), a empresa, o programa e a versão. Sem dependências: o PDF é lido
// como texto (e os fluxos compactados são abertos com o zlib); o Office moderno (docx, xlsx, pptx) é um ZIP.
import zlib from 'node:zlib';

// ---------- PDF ----------
function strPdf(bruto) {
  // literal: (texto com \( \) \\ \n \ddd) · hexadecimal: <FEFF0041...> · UTF-16 quando começa com o BOM FE FF
  let bytes;
  if (bruto.startsWith('<')) {
    const h = bruto.slice(1, -1).replace(/\s+/g, '');
    bytes = Buffer.from(h.length % 2 ? h + '0' : h, 'hex');
  } else {
    const s = bruto.slice(1, -1), out = [];
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c !== '\\') { out.push(s.charCodeAt(i) & 0xff); continue; }
      const n = s[++i];
      if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(s[i + 1])) o += s[++i]; out.push(parseInt(o, 8) & 0xff); }
      else out.push({ n: 10, r: 13, t: 9, b: 8, f: 12 }[n] ?? n.charCodeAt(0));
    }
    bytes = Buffer.from(out);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) { const t = Buffer.from(bytes.subarray(2)); t.swap16(); return t.toString('utf16le').replace(/\0/g, '').trim(); }
  return bytes.toString('latin1').replace(/\0/g, '').trim();
}
const dataPdf = (s) => { const m = String(s || '').match(/(\d{4})(\d{2})(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };
function camposPdf(texto, out) {
  // valor de uma chave do dicionário Info: (literal com parênteses balanceados) ou <hex>
  const pega = (chave) => {
    const i = texto.search(new RegExp(`/${chave}\\s*[(<]`));
    if (i < 0) return '';
    const j = i + texto.slice(i).search(/[(<]/);
    if (texto[j] === '<') { const f = texto.indexOf('>', j); return f > j ? strPdf(texto.slice(j, f + 1)) : ''; }
    let prof = 0, k = j;
    for (; k < texto.length && k < j + 4000; k++) { if (texto[k] === '\\') { k++; continue; } if (texto[k] === '(') prof++; else if (texto[k] === ')' && --prof === 0) break; }
    return strPdf(texto.slice(j, k + 1));
  };
  for (const [k, v] of [['Author', 'autor'], ['Creator', 'programa'], ['Producer', 'produtor'], ['Title', 'titulo'], ['Company', 'empresa'], ['LastModifiedBy', 'ultimoAutor']]) if (!out[v]) out[v] = pega(k);
  if (!out.criado) out.criado = dataPdf(pega('CreationDate'));
  if (!out.modificado) out.modificado = dataPdf(pega('ModDate'));
  // XMP (o mesmo em XML, às vezes com mais coisa)
  const xmp = (re) => tirarXml((texto.match(re) || [])[1] || '');
  if (!out.autor) out.autor = xmp(/<dc:creator>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/);
  if (!out.programa) out.programa = xmp(/<xmp:CreatorTool>([\s\S]*?)<\/xmp:CreatorTool>/);
  if (!out.produtor) out.produtor = xmp(/<pdf:Producer>([\s\S]*?)<\/pdf:Producer>/);
  if (!out.titulo) out.titulo = xmp(/<dc:title>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/);
}
export function metadadosPdf(buf) {
  const out = {};
  let texto = buf.toString('latin1');
  camposPdf(texto, out);
  // PDF 1.5+: o dicionário Info e o XMP podem estar em fluxos compactados; abre até 300 deles
  const abertos = [];
  if (!out.autor || !out.programa) {
    let n = 0;
    for (const m of texto.matchAll(/\/FlateDecode[\s\S]{0,300}?stream\r?\n/g)) {
      if (++n > 300) break;
      const ini = m.index + m[0].length, fim = texto.indexOf('endstream', ini);
      if (fim < 0 || fim - ini > 4_000_000) continue;
      try { abertos.push(zlib.inflateSync(buf.subarray(ini, fim), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString('latin1')); } catch {}
    }
    camposPdf(abertos.join('\n'), out);
  }
  out.tipo = 'PDF';
  out.versao = (texto.match(/^%PDF-(\d\.\d)/) || [])[1] || '';
  // PDF criptografado: os textos do dicionário Info estão cifrados (sairia lixo); fica só o que veio do XMP legível
  if (/\/Encrypt\s/.test(texto)) out.cifrado = 'sim: os metadados do dicionário estão cifrados';
  return achados(out, texto + '\n' + abertos.join('\n'));
}

// ---------- Office moderno (ZIP) ----------
export function lerZip(buf) {
  const arquivos = new Map();
  // o diretório central fica no fim: acha o "fim do diretório" (PK\5\6)
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) return arquivos;
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  for (let k = 0; k < total && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; k++) {
    const metodo = buf.readUInt16LE(p + 10), comp = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + nl);
    arquivos.set(nome, () => {
      const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), dados = buf.subarray(ini, ini + comp);
      return (metodo === 8 ? zlib.inflateRawSync(dados) : dados).toString('utf8');
    });
    p += 46 + nl + el + cl;
  }
  return arquivos;
}
const tirarXml = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
export function metadadosOffice(buf) {
  const z = lerZip(buf), out = {};
  const ler = (n) => { try { return z.has(n) ? z.get(n)() : ''; } catch { return ''; } };
  const core = ler('docProps/core.xml'), app = ler('docProps/app.xml');
  const tag = (x, t) => tirarXml((x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]);
  Object.assign(out, {
    autor: tag(core, 'dc:creator'), ultimoAutor: tag(core, 'cp:lastModifiedBy'), titulo: tag(core, 'dc:title'), assunto: tag(core, 'dc:subject'), palavras: tag(core, 'cp:keywords'),
    criado: tag(core, 'dcterms:created').slice(0, 10), modificado: tag(core, 'dcterms:modified').slice(0, 10),
    programa: [tag(app, 'Application'), tag(app, 'AppVersion')].filter(Boolean).join(' '), empresa: tag(app, 'Company'), gerente: tag(app, 'Manager'), modelo: tag(app, 'Template'),
    tipo: z.has('word/document.xml') ? 'Word' : z.has('xl/workbook.xml') ? 'Excel' : z.has('ppt/presentation.xml') ? 'PowerPoint' : 'Office',
  });
  // caminhos e e-mails ficam nos XML internos (modelo anexado, links, fontes de dados, comentários)
  const internos = [...z.keys()].filter((n) => /\.(xml|rels)$/.test(n) && !/^(word|xl|ppt)\/media\//.test(n)).slice(0, 80).map(ler).join('\n');
  return achados(out, internos);
}

// ---------- o que interessa em qualquer documento ----------
function achados(out, texto) {
  const usuarios = new Set(), caminhos = new Set();
  for (const m of String(texto).matchAll(/([A-Za-z]:\\(?:\\)?(?:Users|Documents and Settings|Usuários)\\(?:\\)?([^\\/:*?"<>|\r\n\0]{2,40})\\[^\r\n"<>()\0]{0,120})/g)) { usuarios.add(m[2]); caminhos.add(m[1].replace(/\\\\/g, '\\').slice(0, 160)); }
  for (const m of String(texto).matchAll(/(\/(?:Users|home)\/([a-z0-9._-]{2,32})\/[^\s"<>()\0]{0,120})/g)) { usuarios.add(m[2]); caminhos.add(m[1].slice(0, 160)); }
  for (const m of String(texto).matchAll(/\\\\([A-Za-z0-9._-]{2,40})\\([^\\\s"<>()\0]{1,60})/g)) caminhos.add(`\\\\${m[1]}\\${m[2]}`);
  const emails = new Set([...String(texto).matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,12}\b/g)].map((m) => m[0].toLowerCase()).filter((e) => !/(adobe|w3\.org|purl\.org|microsoft\.com|openxmlformats|example\.)/i.test(e)));
  // valor com muito caractere estranho é lixo (texto cifrado ou codificação desconhecida): sai
  const legivel = (v) => { const s = String(v); const ruins = (s.match(/[\u0000-\u001f\u007f-\u009f�]/g) || []).length + (s.match(/[^\x20-\x7e -ɏ‘-‟–—•]/g) || []).length; return s.length && ruins / s.length < 0.15; };
  const limpo = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 200) : v]).filter(([, v]) => v && legivel(v)));
  usuarios.delete('Public'); usuarios.delete('Default'); usuarios.delete('All Users');
  return { ...limpo, usuarios: [...usuarios].slice(0, 10), caminhos: [...caminhos].slice(0, 10), emails: [...emails].slice(0, 20) };
}
export function metadados(buf, nome = '') {
  if (!buf || !buf.length) return null;
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return metadadosPdf(buf);
  if (buf.readUInt32LE(0) === 0x04034b50 && /\.(docx|xlsx|pptx|odt|ods|odp)$/i.test(nome || '.docx')) return metadadosOffice(buf);
  return null;
}
