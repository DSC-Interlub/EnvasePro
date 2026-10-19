/**
 * src/lib/leitorCodigo.js — leitura de código de barras pela câmera.
 *
 * TRÊS CAMINHOS, nesta ordem de preferência:
 *
 *  1. `BarcodeDetector`, nativo do navegador. Não baixa nada, decodifica no
 *     próprio navegador e é o que existe no Chrome do Android, que é o que a
 *     fábrica usa nos tablets.
 *  2. `@zxing/library`, carregada SOB DEMANDA. Só é baixada quando o operador
 *     abre a câmera num navegador sem `BarcodeDetector` — portanto não entra no
 *     carregamento inicial de ninguém. Vem do pacote npm, empacotada junto:
 *     a CSP do projeto é `script-src 'self'`, então CDN não é opção (e
 *     afrouxar a CSP para isso seria trocar segurança por conveniência).
 *  3. Leitor USB, que não é câmera nem biblioteca: ele se comporta como teclado,
 *     digita o código no campo com foco e manda Enter. É o caminho do
 *     `ModalLeitor` quando a câmera não existe ou foi recusada, e é também o
 *     mais rápido quando a fábrica já tem o aparelho.
 *
 * O que ESTE módulo não faz: decidir o que acontece com o código lido. Ele
 * devolve a string e quem chamou resolve.
 */

/** Formatos que interessam: código de produto industrial e QR. */
export const FORMATOS = [
  'code_128',
  'code_39',
  'ean_13',
  'ean_8',
  'itf',
  'upc_a',
  'upc_e',
  'qr_code',
];

/**
 * `BarcodeDetector` existe E atende os formatos que precisamos.
 *
 * A checagem de `getSupportedFormats()` não é zelo exagerado: há navegador que
 * expõe o objeto e suporta só `qr_code`, e um leitor que só lê QR num chão de
 * fábrica cheio de Code 128 seria pior que nenhum leitor, porque falharia em
 * silêncio.
 */
export async function detectorNativoServe() {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return false;
  try {
    const suportados = await window.BarcodeDetector.getSupportedFormats();
    return FORMATOS.some((f) => f !== 'qr_code' && suportados.includes(f));
  } catch {
    return false;
  }
}

/** A câmera só existe em contexto seguro (https ou localhost). */
export function cameraPossivel() {
  if (typeof navigator === 'undefined') return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  return Boolean(window.isSecureContext);
}

export class ErroDeLeitura extends Error {
  constructor(motivo, mensagem) {
    super(mensagem);
    this.name = 'ErroDeLeitura';
    this.motivo = motivo;        // 'permissao' | 'sem-camera' | 'inseguro' | 'falha'
  }
}

/** Traduz o erro do navegador para algo que o operador entenda. */
export function mensagemDoErro(erro) {
  const nome = erro?.name || '';
  if (nome === 'NotAllowedError' || nome === 'SecurityError') {
    return new ErroDeLeitura('permissao',
      'A câmera foi bloqueada neste navegador. Libere o acesso à câmera nas permissões do site, ou use o leitor de mão.');
  }
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') {
    return new ErroDeLeitura('sem-camera',
      'Nenhuma câmera encontrada neste aparelho. Use o leitor de mão.');
  }
  if (nome === 'NotReadableError') {
    return new ErroDeLeitura('falha',
      'A câmera está em uso por outro programa. Feche o outro programa e tente de novo.');
  }
  return new ErroDeLeitura('falha',
    'Não consegui abrir a câmera. Use o leitor de mão ou digite o código.');
}

/**
 * Liga a câmera e fica procurando um código até achar um ou ser parado.
 *
 * Devolve `{ parar }`. Quem chamou PRECISA chamar `parar()` — sem isso a luz da
 * câmera fica acesa depois que o modal fecha, e no tablet isso drena a bateria
 * e assusta quem está na linha.
 */
export async function iniciarLeitura({ video, aoLer, aoFalhar }) {
  if (!cameraPossivel()) {
    throw new ErroDeLeitura('inseguro',
      'A câmera só funciona em conexão segura (https). Use o leitor de mão.');
  }

  let fluxo;
  try {
    fluxo = await navigator.mediaDevices.getUserMedia({
      // `environment` = câmera traseira, que é a que aponta para a embalagem.
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      audio: false,
    });
  } catch (e) {
    throw mensagemDoErro(e);
  }

  video.srcObject = fluxo;
  video.setAttribute('playsinline', 'true');
  await video.play().catch(() => {});

  let vivo = true;
  let pararMotor = () => {};

  const parar = () => {
    vivo = false;
    try { pararMotor(); } catch { /* o motor pode ja ter caido */ }
    for (const faixa of fluxo.getTracks()) faixa.stop();
    video.srcObject = null;
  };

  const achou = (texto) => {
    if (!vivo || !texto) return;
    parar();
    aoLer(String(texto).trim());
  };

  if (await detectorNativoServe()) {
    const suportados = await window.BarcodeDetector.getSupportedFormats();
    const detector = new window.BarcodeDetector({
      formats: FORMATOS.filter((f) => suportados.includes(f)),
    });
    const varrer = async () => {
      if (!vivo) return;
      try {
        const achados = await detector.detect(video);
        if (achados?.length) return achou(achados[0].rawValue);
      } catch {
        // Quadro ruim (camera ainda ajustando o foco) nao e erro: tenta o proximo.
      }
      if (vivo) requestAnimationFrame(varrer);
    };
    requestAnimationFrame(varrer);
    return { parar, motor: 'nativo' };
  }

  // Sem detector nativo: baixa a biblioteca AGORA, nao antes.
  try {
    const { BrowserMultiFormatReader } = await import('@zxing/library');
    const leitor = new BrowserMultiFormatReader();
    pararMotor = () => leitor.reset();
    leitor.decodeFromStream(fluxo, video, (resultado) => {
      if (resultado) achou(resultado.getText());
    });
    return { parar, motor: 'zxing' };
  } catch (e) {
    parar();
    const erro = new ErroDeLeitura('falha',
      'Não consegui carregar o leitor de código. Use o leitor de mão ou digite o código.');
    if (aoFalhar) aoFalhar(erro);
    throw erro;
  }
}
