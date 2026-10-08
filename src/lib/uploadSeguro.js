/**
 * src/lib/uploadSeguro.js — regras de upload em um lugar só.
 *
 * Três coisas que este arquivo resolve:
 *
 * 1. BUCKET VINDO DO CHAMADOR. `UploadFile({ file, bucket })` aceitava
 *    qualquer bucket que a tela passasse. Agora só os dois que o sistema
 *    realmente usa são aceitos.
 *
 * 2. TIPO DECLARADO PELO CLIENTE. `file.type` é informado pelo navegador a
 *    partir da extensão e é trivial de forjar: basta renomear `x.exe` para
 *    `x.png`. Aqui o tipo REAL é conferido lendo os primeiros bytes do
 *    arquivo (assinatura), e precisa bater com a extensão e com o tipo
 *    declarado.
 *
 * 3. LIMITES FORA DE SINCRONIA. Os limites de tamanho e de tipo repetem
 *    exatamente o que a migration `20261006150002` gravou em
 *    `storage.buckets`. Divergir faria o upload passar aqui e ser recusado
 *    pelo Storage, com erro difícil de entender para quem está na tela.
 */

/** Buckets que o sistema usa. Qualquer outro é recusado. */
export const BUCKETS_PERMITIDOS = Object.freeze({
  'fotos-operadores': {
    rotulo: 'foto de operador',
    tipos: ['image/jpeg', 'image/png', 'image/webp'],
    extensoes: ['jpg', 'jpeg', 'png', 'webp'],
    limiteBytes: 10 * 1024 * 1024, // 10 MB — igual ao storage.buckets
  },
  'notas-fiscais': {
    rotulo: 'nota fiscal',
    tipos: ['application/pdf', 'image/jpeg', 'image/png'],
    extensoes: ['pdf', 'jpg', 'jpeg', 'png'],
    limiteBytes: 20 * 1024 * 1024, // 20 MB — igual ao storage.buckets
  },
});

/** Erro de upload com mensagem já apropriada para mostrar na tela. */
export class ErroDeUpload extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroDeUpload';
    this.paraUsuario = true;
  }
}

const ASSINATURAS = [
  { tipo: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { tipo: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { tipo: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // "%PDF-"
];

/** WebP é "RIFF" nos bytes 0-3 e "WEBP" nos bytes 8-11. */
function ehWebp(b) {
  return (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  );
}

/**
 * Lê os primeiros bytes e devolve o tipo REAL, ou null se não reconhecer.
 */
export async function tipoRealDoArquivo(file) {
  const fatia = file.slice(0, 16);
  const buffer = await fatia.arrayBuffer();
  const b = new Uint8Array(buffer);

  if (ehWebp(b)) return 'image/webp';
  for (const a of ASSINATURAS) {
    if (a.bytes.every((valor, i) => b[i] === valor)) return a.tipo;
  }
  return null;
}

/** Extensão em minúsculas, sem ponto. */
export function extensaoDe(nome) {
  const partes = String(nome || '').split('.');
  return partes.length > 1 ? partes.pop().toLowerCase() : '';
}

/**
 * Valida o arquivo contra as regras do bucket. Lança ErroDeUpload com
 * mensagem pronta para a tela — sem nome de tabela, SQL ou stack.
 * Devolve o nome do arquivo a ser gravado.
 */
export async function validarUpload(file, bucket) {
  if (!file) throw new ErroDeUpload('Nenhum arquivo foi selecionado.');

  const regras = BUCKETS_PERMITIDOS[bucket];
  if (!regras) {
    // O nome do bucket recusado NÃO entra na mensagem: destino de
    // armazenamento é detalhe interno.
    throw new ErroDeUpload('Destino de upload não permitido.');
  }

  const limiteMb = Math.round(regras.limiteBytes / (1024 * 1024));
  if (file.size > regras.limiteBytes) {
    throw new ErroDeUpload(
      `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). ` +
      `O limite para ${regras.rotulo} é ${limiteMb} MB.`
    );
  }
  if (file.size === 0) throw new ErroDeUpload('O arquivo está vazio.');

  const permitidos = regras.extensoes.join(', ').toUpperCase();
  const ext = extensaoDe(file.name);
  if (!regras.extensoes.includes(ext)) {
    throw new ErroDeUpload(`Extensão não aceita para ${regras.rotulo}. Use: ${permitidos}.`);
  }

  const declarado = file.type || '';
  if (declarado && !regras.tipos.includes(declarado)) {
    throw new ErroDeUpload(`Tipo de arquivo não aceito para ${regras.rotulo}. Use: ${permitidos}.`);
  }

  const real = await tipoRealDoArquivo(file);
  if (!real) {
    throw new ErroDeUpload(
      `O arquivo não parece ser ${permitidos}. Verifique se não está corrompido.`
    );
  }
  if (!regras.tipos.includes(real)) {
    throw new ErroDeUpload(`Tipo de arquivo não aceito para ${regras.rotulo}. Use: ${permitidos}.`);
  }

  // Conteúdo real tem de bater com a extensão: impede o .exe renomeado e
  // também o PDF salvo como .png, que confundiria quem for abrir depois.
  const esperadoPelaExtensao = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', pdf: 'application/pdf',
  }[ext];
  if (esperadoPelaExtensao && esperadoPelaExtensao !== real) {
    throw new ErroDeUpload(
      'O conteúdo do arquivo não corresponde à sua extensão. ' +
      'Renomear o arquivo não muda o formato; exporte-o no formato correto.'
    );
  }

  // Nome sem nada vindo do nome original: evita caractere estranho, caminho
  // relativo e o próprio nome do arquivo virar informação exposta na URL.
  const aleatorio = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}_${aleatorio}.${ext}`;
}

/**
 * Converte um erro técnico em mensagem para a tela, sem vazar detalhe.
 *
 * Erro de Storage e de Postgres carrega nome de tabela, de coluna, trecho de
 * SQL e às vezes a própria consulta. Nada disso ajuda quem está na fábrica e
 * tudo isso ajuda quem estiver sondando o sistema.
 */
export function mensagemDeErroSegura(erro, acao = 'concluir a operação') {
  if (erro?.paraUsuario) return erro.message;

  const codigo = erro?.statusCode || erro?.status || erro?.code;
  const conhecidos = {
    '413': 'Arquivo maior do que o servidor aceita.',
    '415': 'Formato de arquivo não aceito pelo servidor.',
    '401': 'Sua sessão expirou. Entre novamente.',
    '403': 'Você não tem permissão para esta ação.',
    '409': 'Já existe um registro com esses dados.',
    '23505': 'Já existe um registro com esses dados.',
    '23503': 'Este registro depende de outro que não foi encontrado.',
    '42501': 'Você não tem permissão para esta ação.',
  };
  if (codigo && conhecidos[String(codigo)]) return conhecidos[String(codigo)];

  return `Não foi possível ${acao}. Tente novamente; se continuar, avise o suporte.`;
}

/**
 * Registra o erro no console sem dado sensível: só o essencial para depurar.
 * Não imprime o objeto inteiro, que costuma trazer a consulta e os valores.
 */
export function registrarErro(contexto, erro) {
  console.error('[EnvasePro]', contexto, {
    codigo: erro?.statusCode || erro?.status || erro?.code || 'desconhecido',
    tipo: erro?.name || 'Error',
  });
}
