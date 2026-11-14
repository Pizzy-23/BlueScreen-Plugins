// Bluetego: operadora original e cidade de um número do Brasil pela numeração do libphonenumber (Google, licença Apache-2.0),
// guardada em vendor/libphonenumber e consultada sem rede. A operadora é a dona original da faixa: a portabilidade não aparece.
// Para atualizar: node ferramentas/atualizar-libphonenumber.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'libphonenumber');
const tabelas = {};
function tabela(nome) {
  if (tabelas[nome]) return tabelas[nome];
  const m = new Map();
  try {
    for (const l of fs.readFileSync(path.join(DIR, nome), 'utf8').split('\n')) {
      const i = l.indexOf('|');
      if (i > 0 && !l.startsWith('#')) m.set(l.slice(0, i).trim(), l.slice(i + 1).trim());
    }
  } catch {}
  return (tabelas[nome] = m);
}
// o maior prefixo que casa ("5551999" vence "555199")
function procurar(m, digitos) {
  for (let k = Math.min(digitos.length, 12); k >= 4; k--) { const v = m.get(digitos.slice(0, k)); if (v) return v; }
  return '';
}
// digitos: o número com o 55 na frente, sem +
export function numeracao(digitos) {
  const d = String(digitos || '').replace(/\D/g, '');
  if (!d.startsWith('55')) return { operadora: '', cidade: '' };
  return { operadora: procurar(tabela('operadoras-55.txt'), d), cidade: procurar(tabela('cidades-55.txt'), d) };
}
