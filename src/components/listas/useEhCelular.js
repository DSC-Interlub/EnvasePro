import { useState, useEffect } from "react";

/** O mesmo ponto de corte do `md:` do Tailwind. */
const CELULAR = "(max-width: 767px)";

/**
 * Diz se a tela está na faixa de celular.
 *
 * POR QUE NÃO BASTA `hidden md:block`
 *
 * A primeira versão destas listas renderizava as duas formas — cartões e
 * tabela — e escondia uma com CSS. Esconder com CSS não deixa de renderizar:
 * medindo com Playwright, 50 produtos produziam 200 botões de ação em vez de
 * 100, porque as duas árvores estavam no DOM. Isso desfaz metade do ganho de
 * cortar a lista em 50.
 *
 * Com isto, só uma das duas é montada.
 */
export function useEhCelular() {
  const [ehCelular, setEhCelular] = useState(
    () => typeof window !== "undefined" && window.matchMedia(CELULAR).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(CELULAR);
    const aoMudar = (e) => setEhCelular(e.matches);
    mq.addEventListener("change", aoMudar);
    setEhCelular(mq.matches);
    return () => mq.removeEventListener("change", aoMudar);
  }, []);

  return ehCelular;
}
