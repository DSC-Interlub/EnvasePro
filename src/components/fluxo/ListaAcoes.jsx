import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";

/**
 * "Precisa de você" — a lista de pendências do padrão Painel.
 *
 * O QUE ERA
 *
 * Cinco cartões lado a lado, cada um com um número e um rótulo, TODOS
 * desenhados mesmo quando valiam zero. Com a fábrica em dia o administrador
 * via cinco caixas escritas "0", e com uma pendência real ela ficava do mesmo
 * tamanho das quatro vazias — ou seja, o cartão gritava igual tendo ou não
 * havendo o que fazer.
 *
 * Aqui só entra o que tem contagem maior que zero, em ordem de urgência, e cada
 * linha é um link para o lugar onde se resolve. Nada pendente mostra uma linha
 * só, verde, dizendo isso.
 *
 * A ordem vem de quem chama: a tela sabe o que é mais urgente, este componente
 * não.
 */
export default function ListaAcoes({ itens = [], vazio = "Tudo em dia — nada pendente agora." }) {
  const pendentes = itens.filter((i) => Number(i.contagem) > 0);

  if (pendentes.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-painel bg-ok-suave px-5 py-4">
        <CheckCircle2 className="h-5 w-5 flex-none text-ok" aria-hidden="true" />
        <span className="text-[15px] font-bold text-ok">{vazio}</span>
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {pendentes.map((item) => (
        <li key={item.rotulo}>
          <Link
            to={item.url}
            className="press foco-fluxo flex min-h-[56px] items-center gap-3 rounded-token px-3
                       text-left hover:bg-fundo"
          >
            <span
              aria-hidden="true"
              className={`num flex h-9 min-w-[36px] items-center justify-center rounded-token px-2
                          text-sm font-extrabold
                          ${item.tom === "erro" ? "bg-erro-suave text-erro"
                            : item.tom === "atencao" ? "bg-atencao-suave text-atencao"
                            : "bg-marca-suave text-marca"}`}
            >
              {item.contagem}
            </span>
            <span className="min-w-0 flex-1 text-[15px] font-bold text-tinta">{item.rotulo}</span>
            <ArrowRight className="h-4 w-4 flex-none text-texto-apagado" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
