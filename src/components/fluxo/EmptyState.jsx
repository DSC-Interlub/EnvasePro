import React from "react";
import { Inbox } from "lucide-react";

/**
 * Estado vazio.
 *
 * DUAS COISAS QUE ELE TEM DE FAZER, e que as versões espalhadas não faziam:
 *
 *  1. dizer se está vazio **ou ainda carregando**. As telas mostravam
 *     "Nenhum registro encontrado" enquanto a consulta ainda corria, porque
 *     `initialData: []` faz `isLoading` ser falso de imediato. Isso levou uma
 *     medição minha a fechar com zero e a dar a tela como vazia quando não
 *     estava. `carregando` resolve;
 *  2. oferecer o próximo passo. "Nenhuma programação encontrada" sem um botão
 *     deixa o operador parado.
 */
export default function EmptyState({
  titulo = "Nada aqui ainda",
  legenda,
  icone: Icone = Inbox,
  acao,
  carregando = false,
  className = "",
}) {
  if (carregando) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 py-14 ${className}`}>
        <div
          role="status"
          aria-label="Carregando"
          className="w-8 h-8 rounded-full border-[3px] border-trilha border-t-marca animate-spin"
        />
        <p className="text-sm font-semibold text-texto-fraco">Carregando…</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-14 px-6 text-center ${className}`}>
      <span
        aria-hidden="true"
        className="w-14 h-14 rounded-painel bg-fundo text-texto-apagado
                   flex items-center justify-center"
      >
        <Icone className="w-7 h-7" />
      </span>
      <div>
        <p className="text-base font-extrabold text-tinta">{titulo}</p>
        {legenda && <p className="mt-1 text-sm font-semibold text-texto-fraco">{legenda}</p>}
      </div>
      {acao && <div className="mt-1">{acao}</div>}
    </div>
  );
}
