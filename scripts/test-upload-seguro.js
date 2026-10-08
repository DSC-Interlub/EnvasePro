/**
 * scripts/test-upload-seguro.js
 *
 * Verifica as regras de upload sem subir nada: monta arquivos em memoria com
 * assinaturas de bytes reais e confere o que validarUpload aceita e recusa.
 *
 * O caso que importa e o do arquivo RENOMEADO: `file.type` e a extensao sao
 * informados pelo cliente e qualquer um troca. So a leitura dos primeiros
 * bytes diz o que o arquivo e de fato.
 *
 * Uso: node scripts/test-upload-seguro.js
 */

import { validarUpload, tipoRealDoArquivo, BUCKETS_PERMITIDOS } from '../src/lib/uploadSeguro.js';

let ok = 0;
let falhou = 0;
const falhas = [];

function checar(nome, condicao, detalhe = '') {
  if (condicao) { ok += 1; console.log(`  OK    ${nome}`); }
  else { falhou += 1; falhas.push(nome); console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); }
}

/** Monta um File em memoria com os bytes de assinatura pedidos. */
function arquivo(nome, tipoDeclarado, assinatura, tamanho = 2048) {
  const bytes = new Uint8Array(tamanho);
  assinatura.forEach((b, i) => { bytes[i] = b; });
  return new File([bytes], nome, { type: tipoDeclarado });
}

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const EXE = [0x4d, 0x5a, 0x90, 0x00]; // "MZ" — executavel do Windows

async function recusa(rotulo, file, bucket, trechoEsperado) {
  try {
    await validarUpload(file, bucket);
    checar(rotulo, false, 'ACEITOU (deveria recusar)');
  } catch (e) {
    const bate = !trechoEsperado || e.message.toLowerCase().includes(trechoEsperado.toLowerCase());
    checar(rotulo, bate, `mensagem: "${e.message}"`);
  }
}

async function aceita(rotulo, file, bucket) {
  try {
    const nome = await validarUpload(file, bucket);
    checar(rotulo, /^\d+_[a-z0-9]+\.[a-z]+$/.test(nome), `nome gerado: ${nome}`);
  } catch (e) {
    checar(rotulo, false, `RECUSOU: ${e.message}`);
  }
}

async function main() {
  console.log('='.repeat(72));
  console.log('REGRAS DE UPLOAD');
  console.log('='.repeat(72));

  console.log('\n[1] deteccao do tipo REAL pelos bytes');
  checar('JPEG reconhecido', await tipoRealDoArquivo(arquivo('a.jpg', '', JPEG)) === 'image/jpeg');
  checar('PNG reconhecido', await tipoRealDoArquivo(arquivo('a.png', '', PNG)) === 'image/png');
  checar('WebP reconhecido', await tipoRealDoArquivo(arquivo('a.webp', '', WEBP)) === 'image/webp');
  checar('PDF reconhecido', await tipoRealDoArquivo(arquivo('a.pdf', '', PDF)) === 'application/pdf');
  checar('executavel NAO reconhecido', await tipoRealDoArquivo(arquivo('a.png', '', EXE)) === null);

  console.log('\n[2] lista permitida de buckets');
  checar('so existem 2 buckets permitidos', Object.keys(BUCKETS_PERMITIDOS).length === 2,
    Object.keys(BUCKETS_PERMITIDOS).join(', '));
  await recusa('bucket "arquivos" recusado', arquivo('a.png', 'image/png', PNG), 'arquivos', 'não permitido');
  await recusa('bucket inventado recusado', arquivo('a.png', 'image/png', PNG), 'qualquer-coisa', 'não permitido');
  await recusa('bucket vazio recusado', arquivo('a.png', 'image/png', PNG), '', 'não permitido');

  console.log('\n[3] caminho feliz');
  await aceita('JPEG em fotos-operadores', arquivo('foto.jpg', 'image/jpeg', JPEG), 'fotos-operadores');
  await aceita('PNG em fotos-operadores', arquivo('foto.png', 'image/png', PNG), 'fotos-operadores');
  await aceita('PDF em notas-fiscais', arquivo('nf.pdf', 'application/pdf', PDF), 'notas-fiscais');

  console.log('\n[4] arquivo RENOMEADO (o caso que o tipo declarado nao pega)');
  await recusa('executavel renomeado para .png',
    arquivo('virus.png', 'image/png', EXE), 'fotos-operadores', 'não parece ser');
  // Em fotos-operadores o PDF ja cai antes, por nao ser tipo aceito ali. Para
  // exercitar a regra de extensao x conteudo e preciso um bucket onde AMBOS os
  // tipos sao aceitos: notas-fiscais aceita PDF e PNG.
  await recusa('PDF renomeado para .png (bucket que aceita os dois)',
    arquivo('doc.png', 'image/png', PDF), 'notas-fiscais', 'não corresponde');
  await recusa('PDF renomeado para .png em fotos-operadores',
    arquivo('doc.png', 'image/png', PDF), 'fotos-operadores', 'aceit');
  await recusa('JPEG com extensao .pdf em notas-fiscais',
    arquivo('nf.pdf', 'application/pdf', JPEG), 'notas-fiscais', 'não corresponde');

  console.log('\n[5] tipo fora das regras do bucket');
  await recusa('PDF em fotos-operadores', arquivo('a.pdf', 'application/pdf', PDF), 'fotos-operadores', 'aceit');
  await recusa('WebP em notas-fiscais', arquivo('a.webp', 'image/webp', WEBP), 'notas-fiscais', 'aceit');

  console.log('\n[6] tamanho');
  await recusa('acima de 10 MB em fotos-operadores',
    arquivo('g.jpg', 'image/jpeg', JPEG, 11 * 1024 * 1024), 'fotos-operadores', 'muito grande');
  await recusa('acima de 20 MB em notas-fiscais',
    arquivo('g.pdf', 'application/pdf', PDF, 21 * 1024 * 1024), 'notas-fiscais', 'muito grande');
  await recusa('arquivo vazio', arquivo('v.jpg', 'image/jpeg', JPEG, 0), 'fotos-operadores', 'vazio');

  console.log('\n[7] mensagens nao vazam detalhe');
  try {
    await validarUpload(arquivo('a.png', 'image/png', PNG), 'tabela_secreta');
  } catch (e) {
    const vaza = /tabela_secreta|select |insert |postgres|supabase|storage\.|stack/i.test(e.message);
    checar('mensagem nao cita o destino recusado nem SQL', !vaza, `"${e.message}"`);
  }

  console.log('\n' + '='.repeat(72));
  console.log(`RESULTADO: ${ok} OK, ${falhou} FALHA`);
  if (falhou) console.log('Falhas:\n  - ' + falhas.join('\n  - '));
  console.log('='.repeat(72));
  process.exit(falhou ? 1 : 0);
}

main().catch((e) => { console.error('ERRO NA SUITE:', e); process.exit(2); });
