import React from "react";
import { Delete } from "lucide-react";

/**
 * Visor grande + teclado de 12 teclas — o padrão Envase do protótipo.
 *
 * POR QUE EXISTE
 *
 * A quantidade era um `<input type="number">` de 40px de altura. Num tablet com
 * luva, acertar a setinha de incremento de 10px é sorte, e o teclado do sistema
 * cobre metade da tela quando o campo recebe foco. Aqui o número tem 76px e
 * cada tecla tem 64px.
 *
 * O CAMPO DE TEXTO CONTINUA SENDO UM `<input>` DE VERDADE, e isso é de
 * propósito: quem está no desktop digita, o leitor de tela anuncia, o `<label>`
 * aponta para ele e o `id` continua sendo o mesmo que o formulário sempre usou.
 * O teclado na tela é um atalho por cima do campo, não um substituto dele.
 *
 * `inputMode="decimal"` em vez de `type="number"`: o `type="number"` recusa
 * silenciosamente vírgula em alguns navegadores e mostra as setinhas que
 * ninguém consegue acertar.
 */

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "←"];
const ROTULOS = { C: "Limpar", "←": "Apagar o último dígito" };

export default function TecladoNumerico({
  id,
  valor,
  aoMudar,
  unidade = "un",
  rotulo = "Quantidade",
  erro,
  maxDigitos = 7,
  desabilitado = false,
}) {
  const texto = valor == null || valor === "" ? "" : String(valor);

  const teclar = (t) => {
    if (t === "C") return aoMudar("");
    if (t === "←") return aoMudar(texto.slice(0, -1));
    if (texto.replace(/\D/g, "").length >= maxDigitos) return;
    // "0" sozinho não acumula: 0 depois 5 é 5, não 05.
    aoMudar((texto === "0" ? "" : texto) + t);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <label htmlFor={id} className="text-[13px] font-bold text-texto-fraco">
        {rotulo}
      </label>

      <div
        className="foco-fluxo flex h-28 items-center justify-end gap-2.5 rounded-painel
                   border-2 border-transparent bg-fundo px-6
                   transition-[border-color,box-shadow]"
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={texto}
          disabled={desabilitado}
          onChange={(e) => aoMudar(e.target.value.replace(/[^\d.,]/g, ""))}
          placeholder="0"
          aria-describedby={erro ? `${id}-erro` : undefined}
          className={`num min-w-0 flex-1 border-0 bg-transparent text-right text-[56px] font-extrabold
                      leading-none tracking-[-0.04em] outline-none placeholder:text-texto-apagado
                      sm:text-[76px] ${texto ? "text-tinta" : "text-texto-apagado"}`}
        />
        <span className="flex-none pt-7 text-xl font-bold text-texto-fraco">{unidade}</span>
      </div>

      {erro && (
        <p id={`${id}-erro`} className="text-xs font-bold text-erro">
          {erro}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Teclado numérico">
        {TECLAS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => teclar(t)}
            disabled={desabilitado}
            aria-label={ROTULOS[t] || t}
            className="press foco-fluxo num flex h-16 items-center justify-center rounded-painel
                       bg-fundo text-[26px] font-bold text-tinta
                       hover:bg-cartao hover:shadow-cartao disabled:opacity-40"
          >
            {t === "←" ? <Delete className="h-6 w-6" aria-hidden="true" /> : t}
          </button>
        ))}
      </div>
    </div>
  );
}
