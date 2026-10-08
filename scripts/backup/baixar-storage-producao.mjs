/**
 * Baixa os BYTES de todos os objetos de storage de producao.
 * A chave de servico e obtida pela Management API, usada em memoria e NUNCA
 * gravada em arquivo nem impressa.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REF = 'xifzjpbkpxislqrowswd';
const TOKEN = process.env.SBP;
const DEST = process.argv[2];
if (!TOKEN || !DEST) { console.error('uso: SBP=... node baixar_storage.mjs <destino>'); process.exit(1); }

// --- chave de servico, só em memória ---------------------------------------
const rk = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});
if (!rk.ok) { console.error('falha ao obter as chaves do projeto:', rk.status); process.exit(1); }
const chaves = await rk.json();
const SERVICE = chaves.find((k) => k.name === 'service_role')?.api_key;
if (!SERVICE) {
  console.error('chave service_role nao encontrada. Nomes disponiveis:', chaves.map((k) => k.name).join(', '));
  process.exit(1);
}
console.log('chave de servico obtida (nao sera gravada nem impressa)');

const BASE = `https://${REF}.supabase.co`;
const cab = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

// --- lista de objetos por bucket --------------------------------------------
async function listar(bucket) {
  const r = await fetch(`${BASE}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: { ...cab, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  });
  if (!r.ok) throw new Error(`list ${bucket}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

const relatorio = {};
let totalArquivos = 0;
let totalBytes = 0;

for (const bucket of ['fotos-operadores', 'notas-fiscais', 'arquivos']) {
  const pasta = path.join(DEST, 'storage', bucket);
  await mkdir(pasta, { recursive: true });

  let objetos;
  try { objetos = await listar(bucket); }
  catch (e) { console.log(`  ${bucket}: ${e.message}`); relatorio[bucket] = { erro: e.message }; continue; }

  const arquivos = objetos.filter((o) => o.name && o.id);
  let ok = 0, bytes = 0;
  const falhas = [];

  for (const obj of arquivos) {
    const r = await fetch(`${BASE}/storage/v1/object/${bucket}/${encodeURIComponent(obj.name)}`, { headers: cab });
    if (!r.ok) { falhas.push(`${obj.name}: HTTP ${r.status}`); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    await writeFile(path.join(pasta, obj.name), buf);
    ok += 1; bytes += buf.length;
  }

  relatorio[bucket] = { listados: arquivos.length, baixados: ok, bytes, falhas };
  totalArquivos += ok; totalBytes += bytes;
  console.log(`  ${bucket.padEnd(18)} listados=${arquivos.length} baixados=${ok} bytes=${bytes}` +
    (falhas.length ? ` FALHAS=${falhas.length}` : ''));
  for (const f of falhas) console.log(`      ${f}`);
}

await writeFile(path.join(DEST, 'storage', 'relatorio.json'), JSON.stringify(relatorio, null, 2));
console.log(`\ntotal: ${totalArquivos} arquivos, ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
