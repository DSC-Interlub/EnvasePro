import { useQuery } from "@tanstack/react-query";

/**
 * O intervalo de recarga de TODAS as telas de TV (docs/ETAPA2-INDICADORES.md
 * §4.3). Antes eram oito intervalos diferentes, de 10 s a 300 s, acumulados
 * sem desenho. Com o painel numa chamada leve, um intervalo só basta.
 */
export const INTERVALO_TV = 30000;

/**
 * Busca o painel de uma TV e diz QUANDO o dado é (§4.4).
 *
 * `atualizacao.em` é a hora do último dado bom; `atualizacao.falhou` fica
 * verdadeiro quando a última tentativa falhou. Nesse caso o React Query
 * mantém o dado anterior — a TV continua mostrando o último painel, mas a
 * moldura avisa que ele está parado. Número velho apresentado como atual é
 * o defeito que isto existe para impedir.
 */
export function usePainelTV(chave, buscar, { pausarOculto = false } = {}) {
  const q = useQuery({
    queryKey: ["painel-tv", chave],
    queryFn: buscar,
    refetchInterval: INTERVALO_TV,
    // A TV fica sempre visível. O /Painel, aberto também em computador,
    // para de buscar com a aba oculta — como já fazia antes.
    refetchIntervalInBackground: !pausarOculto,
    staleTime: INTERVALO_TV / 2,
    retry: 1,
  });
  return {
    painel: q.data,
    carregando: q.isLoading,
    atualizacao: {
      em: q.dataUpdatedAt ? new Date(q.dataUpdatedAt) : null,
      falhou: q.isError,
    },
  };
}
