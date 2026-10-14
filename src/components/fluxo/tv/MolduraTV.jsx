import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * A moldura da TV — o protótipo TV-fabrica.html.
 *
 * TRÊS DECISÕES QUE VÊM DO CONTEXTO, não do gosto
 *
 *  1. **Tema escuro sempre.** A TV fica numa sala com luz forte e é lida a
 *     4 metros. A classe `dark` é aplicada aqui, então todos os tokens
 *     (`--fundo`, `--tinta`, `--ok`…) passam a valer os valores escuros sem
 *     nenhuma tela precisar saber disso.
 *  2. **Nada de interação.** Ninguém toca na TV. Não há hover, não há
 *     tooltip, não há nada que dependa de clique.
 *  3. **A hora é grande.** 104px no protótipo. Quem passa quer saber se o
 *     painel está vivo, e a hora é o sinal mais barato disso — junto com o
 *     ponto "ao vivo", que pulsa.
 *
 * As duas manchas de luz ao fundo (`glow`) são radiais, uma azul e uma verde,
 * com deriva de 14s. Elas dão profundidade ao fundo quase preto sem
 * competir com o dado — e param com `prefers-reduced-motion`.
 */
export default function MolduraTV({
  titulo, modulo, turno, children, rodape, acoes,
}) {
  const [agora, setAgora] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="dark relative flex h-screen w-full flex-col overflow-hidden bg-fundo
                 px-8 py-7 text-tinta sm:px-12 xl:px-[72px] xl:py-14"
      style={{ gap: "clamp(16px, 2.2vh, 36px)" }}
    >
      {/* manchas de luz: profundidade sem competir com o dado */}
      <div
        aria-hidden="true"
        className="glow pointer-events-none absolute -left-[200px] -top-[260px] h-[900px] w-[900px] rounded-full"
        style={{ background: "radial-gradient(closest-side, rgb(var(--marca) / .32), rgb(var(--marca) / 0))" }}
      />
      <div
        aria-hidden="true"
        className="glow pointer-events-none absolute -bottom-[320px] -right-[240px] h-[1000px] w-[1000px] rounded-full"
        style={{ background: "radial-gradient(closest-side, rgb(var(--ok) / .16), rgb(var(--ok) / 0))" }}
      />

      <header className="relative flex flex-none items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-4 xl:gap-6">
          <span
            aria-hidden="true"
            className="flex flex-none items-center justify-center rounded-[26px] bg-white
                       font-extrabold text-[#0A0F1F]"
            style={{ width: "clamp(52px, 4.4vw, 84px)", height: "clamp(52px, 4.4vw, 84px)",
                     fontSize: "clamp(20px, 1.7vw, 32px)" }}
          >
            EP
          </span>
          <div className="min-w-0">
            <div
              className="flex items-center gap-3 font-bold text-texto-fraco xl:gap-3.5"
              style={{ fontSize: "clamp(14px, 1.35vw, 26px)" }}
            >
              <span
                aria-hidden="true"
                className="ao-vivo flex-none rounded-full bg-ok"
                style={{ width: "clamp(10px, .85vw, 16px)", height: "clamp(10px, .85vw, 16px)" }}
              />
              <span className="truncate">
                Ao vivo{modulo ? ` · ${modulo}` : ""}{turno ? ` · turno ${turno}` : ""}
              </span>
            </div>
            <h1
              className="num truncate font-extrabold leading-[1.1] text-tinta"
              style={{ fontSize: "clamp(28px, 3.4vw, 66px)" }}
            >
              {titulo}
            </h1>
          </div>
        </div>

        <div className="flex flex-none items-center gap-5">
          {acoes}
          <div className="text-right">
            <div
              className="num font-extrabold leading-none text-tinta"
              style={{ fontSize: "clamp(36px, 5.4vw, 104px)" }}
            >
              {format(agora, "HH:mm")}
            </div>
            <div
              className="font-bold capitalize text-texto-fraco"
              style={{ fontSize: "clamp(13px, 1.35vw, 26px)" }}
            >
              {format(agora, "EEEE", { locale: ptBR })}
            </div>
          </div>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col" style={{ gap: "clamp(14px, 1.8vh, 28px)" }}>
        {children}
      </main>

      {rodape && (
        <footer
          className="relative grid flex-none grid-cols-2 lg:grid-cols-4"
          style={{ gap: "clamp(12px, 1.5vw, 28px)" }}
        >
          {rodape}
        </footer>
      )}
    </div>
  );
}
