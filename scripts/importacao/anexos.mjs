// Anexos da importação: fotos de operador e arquivos de NF.
//
// Baixa da Base44 (ou lê de uma pasta local de anexos), valida pelo CONTEÚDO
// (magic bytes, não pela extensão nem pelo content-type, que a Base44 manda
// como application/octet-stream), confere o tamanho contra o limite do bucket
// e grava em `importacao/<id-do-registro>.<ext>` — nome seguro, derivado do id,
// nunca do nome original. O banco guarda o CAMINHO, não URL.
//
// Envio pela API de Storage com a sessão de um ADMIN (login por e-mail e
// senha): as políticas dos buckets permitem envio a `authenticated` e remoção
// só a admin. Não usa service key.
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

export const BUCKETS = {
  'fotos-operadores': { limite: 10 * 1024 * 1024, tipos: ['image/jpeg', 'image/png', 'image/webp'] },
  'notas-fiscais': { limite: 20 * 1024 * 1024, tipos: ['application/pdf', 'image/jpeg', 'image/png'] },
};
export const PREFIXO = 'importacao';

export function tipoPeloConteudo(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.length >= 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buf.length >= 5 && buf.slice(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

/** Obtém os bytes: URL http(s) ou nome de arquivo dentro de `pastaAnexos`. */
export async function obterBytes(origem, pastaAnexos) {
  if (/^https?:\/\//i.test(origem)) {
    const r = await fetch(origem, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) return { erro: `download falhou (HTTP ${r.status})` };
    return { bytes: Buffer.from(await r.arrayBuffer()) };
  }
  if (!pastaAnexos) return { erro: 'não é URL e não foi informada pasta de anexos' };
  const alvo = path.resolve(pastaAnexos, path.basename(origem));
  if (!fs.existsSync(alvo)) return { erro: 'arquivo faltando na pasta de anexos' };
  return { bytes: fs.readFileSync(alvo) };
}

export function validar(bytes, bucket) {
  const regra = BUCKETS[bucket];
  if (!bytes.length) return { erro: 'arquivo vazio' };
  if (bytes.length > regra.limite) return { erro: `grande demais (${(bytes.length / 1048576).toFixed(1)} MB; limite ${regra.limite / 1048576} MB)` };
  const tipo = tipoPeloConteudo(bytes);
  if (!tipo) return { erro: 'conteúdo não reconhecido (corrompido ou tipo não aceito)' };
  if (!regra.tipos.includes(tipo.mime)) return { erro: `tipo ${tipo.mime} não aceito no bucket ${bucket}` };
  return { tipo };
}

export async function criarEnvio({ url, anonKey, email, senha }) {
  const cli = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await cli.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(`login do admin para enviar anexos falhou: ${error.message}`);
  return {
    async enviar(bucket, caminho, bytes, mime) {
      const { error: e } = await cli.storage.from(bucket).upload(caminho, bytes, { contentType: mime, upsert: true });
      if (e) throw new Error(`envio de ${bucket}/${caminho} falhou: ${e.message}`);
    },
    async listar(bucket, prefixo) {
      const todos = [];
      for (let de = 0; ; de += 1000) {
        const { data, error: e } = await cli.storage.from(bucket).list(prefixo, { limit: 1000, offset: de });
        if (e) throw new Error(`listar ${bucket}/${prefixo}: ${e.message}`);
        todos.push(...data.filter((o) => o.id).map((o) => (prefixo ? `${prefixo}/${o.name}` : o.name)));
        if (data.length < 1000) break;
      }
      return todos;
    },
    async apagar(bucket, caminhos) {
      for (let i = 0; i < caminhos.length; i += 100) {
        const { error: e } = await cli.storage.from(bucket).remove(caminhos.slice(i, i + 100));
        if (e) throw new Error(`apagar em ${bucket}: ${e.message}`);
      }
    },
    async sair() { await cli.auth.signOut({ scope: 'local' }).catch(() => {}); },
  };
}
