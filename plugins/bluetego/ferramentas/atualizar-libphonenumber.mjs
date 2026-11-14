#!/usr/bin/env node
// Atualiza vendor/libphonenumber a partir do libphonenumber do Google (https://github.com/google/libphonenumber, licença Apache-2.0):
// a operadora original de cada faixa de números do Brasil e a cidade (ou o estado) de cada prefixo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'libphonenumber');
const BASE = 'https://raw.githubusercontent.com/google/libphonenumber/master/';
const ARQUIVOS = { 'operadoras-55.txt': 'resources/carrier/en/55.txt', 'cidades-55.txt': 'resources/geocoding/pt/55.txt', LICENSE: 'LICENSE' };

fs.mkdirSync(DIR, { recursive: true });
for (const [destino, origem] of Object.entries(ARQUIVOS)) {
  const r = await fetch(BASE + origem);
  if (!r.ok) throw new Error(`${origem}: ${r.status}`);
  const texto = await r.text();
  fs.writeFileSync(path.join(DIR, destino), texto);
  console.log(`${destino}: ${texto.split('\n').filter((l) => l.includes('|')).length || 'licença'} ${destino === 'LICENSE' ? '' : 'prefixos'}`);
}
