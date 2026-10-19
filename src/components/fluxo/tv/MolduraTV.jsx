import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { u } from "./unidade";

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
 * `atualizacao` ({ em: Date, falhou: bool }, de usePainelTV): a linha "Ao
 * vivo" passa a dizer "atualizado às HH:MM" — e, se a última busca falhou,
 * troca o ponto verde por vermelho e diz desde quando o dado está parado.
 *
 * As duas manchas de luz ao fundo (`glow`) são radiais, uma azul e uma verde,
 * com deriva de 14s. Elas dão profundidade ao fundo quase preto sem
 * competir com o dado — e param com `prefers-reduced-motion`.
 */
export default function MolduraTV({
  titulo, modulo, turno, children, rodape, acoes, atualizacao,
}) {
  const [agora, setAgora] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="dark relative flex h-screen w-full flex-col overflow-hidden bg-fundo text-tinta"
      style={{
        // A unidade de tudo na TV — ver `unidade.js`. É o lado do maior quadro
        // 16:9 que cabe na tela: quem manda é a dimensão que FALTA, não a
        // largura.
        "--u": "min(1vw, 1.7778vh)",
        padding: `${u(2.4)} ${u(3.4)}`,
        gap: u(1.3),
      }}
    >
      {/* manchas de luz: profundidade sem competir com o dado */}
      <div
        aria-hidden="true"
        className="glow pointer-events-none absolute rounded-full"
        style={{
          left: u(-10), top: u(-13), width: u(47), height: u(47),
          background: "radial-gradient(closest-side, rgb(var(--marca) / .32), rgb(var(--marca) / 0))",
        }}
      />
      <div
        aria-hidden="true"
        className="glow pointer-events-none absolute rounded-full"
        style={{
          right: u(-12), bottom: u(-16), width: u(52), height: u(52),
          background: "radial-gradient(closest-side, rgb(var(--ok) / .16), rgb(var(--ok) / 0))",
        }}
      />

      <header className="relative flex flex-none items-center justify-between" style={{ gap: u(2) }}>
        <div className="flex min-w-0 items-center" style={{ gap: u(1.1) }}>
          <span
            aria-hidden="true"
            className="flex flex-none items-center justify-center bg-white font-extrabold text-[rgb(var(--fundo))]"
            style={{ width: u(4.2), height: u(4.2), borderRadius: u(1.3), fontSize: u(1.6) }}
          >
            EP
          </span>
          <div className="min-w-0">
            <div
              className="flex items-center font-bold text-texto-fraco"
              style={{ gap: u(0.6), fontSize: u(1.2) }}
            >
              <span
                aria-hidden="true"
                className={`flex-none rounded-full ${atualizacao?.falhou ? "bg-erro" : "ao-vivo bg-ok"}`}
                style={{ width: u(0.8), height: u(0.8) }}
              />
              {atualizacao?.falhou ? (
                <span role="status" data-tv-atualizacao="falhou" className="text-erro">
                  Sem atualizar{atualizacao.em ? ` desde ${format(atualizacao.em, "HH:mm")}` : ""}
                  {" · "}verifique a rede{modulo ? ` · ${modulo}` : ""}
                </span>
              ) : (
                <span data-tv-atualizacao={atualizacao?.em ? "ok" : undefined}>
                  Ao vivo{modulo ? ` · ${modulo}` : ""}{turno ? ` · turno ${turno}` : ""}
                  {atualizacao?.em ? ` · atualizado às ${format(atualizacao.em, "HH:mm")}` : ""}
                </span>
              )}
            </div>
            <h1
              className="num font-extrabold leading-[1.1] text-tinta"
              style={{ fontSize: u(2.9) }}
            >
              {titulo}
            </h1>
          </div>
        </div>

        <div className="flex flex-none items-center" style={{ gap: u(1.4) }}>
          {acoes}
          <div className="text-right">
            <div className="num font-extrabold leading-none text-tinta" style={{ fontSize: u(4.6) }}>
              {format(agora, "HH:mm")}
            </div>
            <div className="font-bold capitalize text-texto-fraco" style={{ fontSize: u(1.15), marginTop: u(0.25) }}>
              {format(agora, "EEEE", { locale: ptBR })}
            </div>
          </div>
        </div>
      </header>

      {/* `overflow-hidden` + `min-h-0`: o miolo nunca empurra o rodapé para
          fora da tela. Se algo não couber, o portão test-tv-layout acusa —
          em vez de a TV esconder a falha rolando. */}
      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden" style={{ gap: u(1.3) }}>
        {children}
      </main>

      {rodape && (
        // SEMPRE quatro colunas. A versão anterior caía para duas abaixo de
        // 1024px de largura (`lg:grid-cols-4`), o rodapé ganhava uma segunda
        // linha e roubava a altura do miolo.
        <footer className="relative grid flex-none grid-cols-4" style={{ gap: u(1.3) }}>
          {rodape}
        </footer>
      )}
    </div>
  );
}
