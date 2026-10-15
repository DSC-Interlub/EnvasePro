import React from "react";
import { Link } from "react-router-dom";
import { User, ArrowRight } from "lucide-react";

/**
 * Cartão "acontecendo agora" — um módulo da operação, ao vivo.
 *
 * O MESMO CARTÃO QUATRO VEZES
 *
 * Envase, check-out, empilhadeira e recebimento tinham, cada um, a sua própria
 * função de ~45 linhas desenhando exatamente a mesma coisa: ícone, título em
 * maiúsculas, pílula de contagem, e uma lista de linhas com foto do operador,
 * texto principal, texto secundário e um tempo à direita. Mudava a cor
 * (`purple`, `amber`, `teal`) e o nome dos campos.
 *
 * Quatro cópias significam quatro lugares para corrigir quando algo muda — e de
 * fato já divergiam: uma mostrava "Nenhuma operação em andamento", outra
 * "Empilhadeira disponível", outra "Sem recebimento em andamento", cada uma com
 * um itálico diferente.
 *
 * Aqui a diferença entre os quatro é só o `itens` que chega. A cor saiu: a
 * identidade do módulo vem do ícone e do título, não de uma faixa roxa — e
 * `purple`/`amber`/`teal` não eram tokens do sistema.
 */
export default function CartaoAoVivo({
  titulo,
  icone: Icone,
  url,
  itens = [],
  vazio = "Nada em andamento",
  aviso,
  pilula,
  atraso = 0,
}) {
  return (
    <section
      style={atraso ? { animationDelay: `${atraso}s` } : undefined}
      className="entra cartao-fluxo flex min-w-0 flex-col"
    >
      <div className="flex items-center gap-2.5 px-5 pb-3 pt-4">
        {Icone && (
          <span
            aria-hidden="true"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-token
                       bg-marca-suave text-marca"
          >
            <Icone className="h-[18px] w-[18px]" />
          </span>
        )}
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-tinta">{titulo}</h3>

        {pilula && (
          <span
            className={`num flex-none rounded-full px-3 py-1 text-xs font-extrabold
                        ${pilula.tom === "erro" ? "bg-erro-suave text-erro"
                          : pilula.tom === "atencao" ? "bg-atencao-suave text-atencao"
                          : "bg-fundo text-texto-fraco"}`}
          >
            {pilula.texto}
          </span>
        )}

        {url && (
          <Link
            to={url}
            aria-label={`Abrir ${titulo}`}
            className="press foco-fluxo flex h-12 w-12 flex-none items-center justify-center
                       rounded-token text-texto-apagado hover:bg-fundo hover:text-marca"
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>

      {aviso && (
        <p
          role="alert"
          className="mx-5 mb-3 rounded-token bg-erro-suave px-4 py-2.5 text-sm font-bold text-erro"
        >
          {aviso}
        </p>
      )}

      <div className="min-w-0 flex-1 px-5 pb-4">
        {itens.length === 0 && !aviso ? (
          <p className="py-3 text-sm font-semibold text-texto-apagado">{vazio}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {itens.map((item) => (
              <li
                key={item.id}
                className={`flex min-h-[56px] items-center gap-3 rounded-token px-3 py-2
                            ${item.tom === "erro" ? "bg-erro-suave" : "bg-fundo"}`}
              >
                <Foto nome={item.operador} foto={item.foto} />

                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-extrabold text-tinta">{item.principal}</span>
                    {(item.marcas || []).map((m) => (
                      <span
                        key={m.texto}
                        className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-extrabold
                                    ${m.tom === "erro" ? "bg-erro text-white"
                                      : m.tom === "atencao" ? "bg-atencao-suave text-atencao"
                                      : "bg-cartao text-texto-fraco"}`}
                      >
                        {m.texto}
                      </span>
                    ))}
                  </div>
                  {item.secundario && (
                    <p className="truncate text-xs font-semibold text-texto-fraco">{item.secundario}</p>
                  )}
                </div>

                {item.direita && (
                  <div className="flex-none text-right">
                    <p className={`num text-sm font-extrabold
                                   ${item.tom === "erro" ? "text-erro" : "text-marca"}`}>
                      {item.direita}
                    </p>
                    {item.direitaLegenda && (
                      <p className="text-[11px] font-semibold text-texto-apagado">{item.direitaLegenda}</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * Foto do operador, com recuo para iniciais.
 *
 * O `onError` escondia a imagem e deixava um buraco de 36px na linha. Agora a
 * falha troca pela inicial — a foto vem de URL assinada que expira em 24h, e
 * numa tela de parede que fica dias aberta isso acontece.
 */
function Foto({ nome, foto }) {
  const [falhou, setFalhou] = React.useState(false);
  const inicial = (nome || "?").trim().charAt(0).toUpperCase();

  if (foto && !falhou) {
    return (
      <img
        src={foto}
        alt=""
        onError={() => setFalhou(true)}
        className="h-9 w-9 flex-none rounded-full border-2 border-marca-suave-2 object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 flex-none items-center justify-center rounded-full
                 bg-marca-suave text-xs font-extrabold text-marca"
    >
      {inicial === "?" ? <User className="h-4 w-4" /> : inicial}
    </span>
  );
}
