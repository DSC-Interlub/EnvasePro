import { useState, useEffect, useMemo } from "react";

export const POR_PAGINA = 50;

/**
 * Mostra a lista de 50 em 50.
 *
 * POR QUE EXISTE
 *
 * O catálogo tem 1599 produtos e as telas montavam uma linha de tabela para
 * cada um — 1599 linhas no DOM de uma vez, no tablet compartilhado do chão de
 * fábrica. A consulta continua trazendo tudo (a busca precisa olhar a lista
 * inteira); o que muda é quanto disso vira DOM.
 *
 * A busca filtra sobre a lista COMPLETA, não sobre a página visível: digitar
 * um código que está na posição 900 precisa encontrá-lo sem o usuário ter de
 * carregar as 18 páginas anteriores. Por isso o `reiniciarQuando` — mudou o
 * filtro, a contagem volta para 50, senão uma busca feita depois de muitos
 * "carregar mais" mostraria um pedaço arbitrário do novo resultado.
 *
 * @param {Array} itens  lista já filtrada
 * @param {any} reiniciarQuando  valor que, ao mudar, volta para a 1ª página
 */
export function useListaPaginada(itens, reiniciarQuando) {
  const [visiveis, setVisiveis] = useState(POR_PAGINA);

  useEffect(() => { setVisiveis(POR_PAGINA); }, [reiniciarQuando]);

  const total = itens.length;
  const pagina = useMemo(() => itens.slice(0, visiveis), [itens, visiveis]);
  const temMais = total > pagina.length;

  return {
    pagina,
    total,
    mostrando: pagina.length,
    temMais,
    carregarMais: () => setVisiveis(v => v + POR_PAGINA),
  };
}
