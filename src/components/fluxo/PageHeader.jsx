import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

/**
 * Cabeçalho de tela.
 *
 * POR QUE EXISTE
 *
 * Cada tela escrevia o próprio: `<h1 className="text-3xl font-bold
 * text-slate-900">` mais um `<p>` mais uma `<div className="flex gap-3">` de
 * botões, com variações em 31 arquivos. O resultado é que o título tinha três
 * tamanhos diferentes pelo sistema e as ações caíam em lugares diferentes.
 *
 * Aqui é um só: migalha opcional, título de 30–38px (responsivo), legenda, e
 * as ações à direita — embaixo no celular, porque ao lado elas não caberiam e
 * empurrariam o título.
 */
export default function PageHeader({
  titulo, legenda, migalha = [], acoes, aoVivo = false, className = "",
}) {
  return (
    <header className={`entra flex flex-col gap-3 ${className}`}>
      {migalha.length > 0 && (
        <nav aria-label="Você está em" className="flex items-center gap-1 flex-wrap">
          {migalha.map((passo, i) => (
            <React.Fragment key={`${passo.rotulo}-${i}`}>
              {i > 0 && (
                <ChevronRight className="w-3.5 h-3.5 text-texto-apagado flex-shrink-0" aria-hidden="true" />
              )}
              {passo.url ? (
                <Link
                  to={passo.url}
                  className="press foco-fluxo rounded-token-sm px-1 text-[13px] font-bold
                             text-texto-fraco hover:text-marca"
                >
                  {passo.rotulo}
                </Link>
              ) : (
                <span className="px-1 text-[13px] font-bold text-texto-apagado">{passo.rotulo}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {aoVivo && (
            <div className="flex items-center gap-2 text-[13px] font-bold text-texto-fraco">
              <span className="ao-vivo w-2 h-2 rounded-full bg-ok flex-shrink-0" aria-hidden="true" />
              Ao vivo
            </div>
          )}
          <h1 className="num text-[30px] sm:text-[34px] lg:text-[38px] font-extrabold
                         leading-[1.1] text-tinta">
            {titulo}
          </h1>
          {legenda && (
            <p className="mt-1 text-sm font-semibold text-texto-fraco">{legenda}</p>
          )}
        </div>

        {acoes && <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">{acoes}</div>}
      </div>
    </header>
  );
}
