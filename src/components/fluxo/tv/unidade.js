/**
 * A unidade da TV.
 *
 * `--u` é definido na MolduraTV como `min(1vw, 1.7778vh)`: um centésimo da
 * largura do MAIOR quadro 16:9 que cabe na tela. Em 1920×1080 vale 19,2px; em
 * 1366×768, 13,66px; em 800×395 — a tela do dono — vale 7,02px, porque ali
 * quem limita é a ALTURA.
 *
 * POR QUE UMA UNIDADE SÓ
 *
 * A primeira versão media tudo em `vw` (`clamp(56px, 12.5vw, 240px)`). Largura
 * não diz nada sobre quanto cabe na altura: numa tela larga e baixa os números
 * cresciam pela largura, transbordavam a altura e cobriam a lista de
 * operações. E os pisos em px (`56px`, `110px`) somavam mais que os 395px da
 * tela do dono antes mesmo de qualquer dado aparecer.
 *
 * Com tudo em múltiplos de `--u`, a TV é a MESMA composição em qualquer tela,
 * só que em escala. Se cabe em 1920×1080, cabe em 800×395. A legibilidade
 * (texto ≥ 14px) é conferida em 1080p, que é onde a TV da fábrica roda; numa
 * tela menor o texto encolhe na mesma proporção que todo o resto.
 *
 * Não use px nem vw/vh direto em nada da TV. Use `u(k)`.
 */
export const u = (k) => `calc(var(--u) * ${k})`;

/**
 * Tamanho de fonte para um NÚMERO que precisa caber na largura do contêiner.
 *
 * "7" e "12.345" não cabem no mesmo corpo de letra. Os dígitos da Manrope em
 * `tabular-nums` medem ~0,62em; com isso dá para calcular, pelo comprimento do
 * texto, o maior corpo que cabe em `largura` por cento do contêiner (cqw).
 * `teto` limita o tamanho em cartão grande, e `alturaMax` (cqh) impede que o
 * número passe da altura.
 */
export function fonteQueCabe(texto, { teto, largura = 92, alturaMax = 48 } = {}) {
  const n = Math.max(1, String(texto ?? '').length);
  const porLargura = largura / (n * 0.62);
  return `min(${teto ? `${u(teto)}, ` : ''}${porLargura.toFixed(2)}cqw, ${alturaMax}cqh)`;
}
