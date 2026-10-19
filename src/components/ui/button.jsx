import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

/**
 * Botão da direção "Fluxo".
 *
 * O QUE MUDOU
 *
 *  - raio 16 (era `rounded-md`, 6px: um retângulo com cantos lascados);
 *  - o primário leva **sombra colorida** da própria marca, não a sombra
 *    cinza genérica. É o que o protótipo faz e o que separa um botão de ação
 *    de um botão qualquer;
 *  - hover **sobe** 1–2px, press **afunda** para 0.97. O press importa mais
 *    que o hover: no tablet não existe hover, e com luva o único retorno de
 *    "eu acertei" é o visual;
 *  - `transition-colors` virou transição de transform e sombra também, senão
 *    o movimento acontece em salto.
 *
 * As alturas são as do item (g)/(f) da V1 e **não mudaram**: 48px é o alvo
 * mínimo, `sm` fica em 40 porque é o único tamanho pensado para o PC do
 * admin, com mouse.
 */
const buttonVariants = cva(
  // min-w-[48px]: um alvo de toque precisa de 48px nos DOIS lados. Havia
  // botoes com 48px de altura e 25px de largura — so o icone, sem variante
  // `icon` e com padding apertado. A largura minima na base resolve todos de
  // uma vez e nao afeta botao com texto, que ja passa de 48.
  "press inline-flex min-w-[48px] items-center justify-center gap-2 whitespace-nowrap " +
  "rounded-token text-sm font-bold outline-none " +
  "focus-visible:border-marca focus-visible:shadow-foco " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // ação principal: azul da marca com sombra da própria cor
        default:
          "bg-marca text-white shadow-marca hover:bg-marca-forte hover:-translate-y-0.5 " +
          "hover:shadow-marca-alta",
        // destrutiva: mesma gramática, cor de erro
        destructive:
          "bg-erro text-white shadow-leve hover:brightness-95 hover:-translate-y-0.5",
        // secundária: superfície clara sobre o fundo, sem borda dura
        outline:
          "bg-cartao text-tinta shadow-leve hover:bg-marca-suave hover:text-marca " +
          "hover:-translate-y-0.5",
        secondary:
          "bg-fundo text-tinta-media hover:bg-marca-suave hover:text-marca",
        // fantasma: nada até o toque
        ghost: "text-tinta-media hover:bg-marca-suave hover:text-marca",
        link: "min-w-0 text-marca underline-offset-4 hover:underline",
      },
      // ALTURAS: 48px e o minimo de um alvo tocavel.
      //
      // Os padroes eram 36px (default), 32px (sm), 40px (lg) e 36x36 (icon):
      // nenhum chegava a 48. Enquanto o padrao fosse 36, toda tela nova
      // nascia pequena e alguem tinha de lembrar de corrigir — foi o que
      // aconteceu nos itens (f) e (g) da V1, que escreveram h-12 e
      // min-h-[48px] caso a caso. Mudar o padrao inverte isso: a tela nasce
      // certa, e quem quiser menor precisa pedir.
      //
      // `sm` fica em 40px de proposito. Nao chega a 48, mas e o unico
      // tamanho pensado para o PC do admin, com mouse; usar `sm` no tablet e
      // o que esta errado, nao o tamanho em si.
      size: {
        default: "h-12 px-5 py-2",
        sm: "h-10 rounded-token-sm px-3.5 text-xs",
        lg: "h-14 rounded-token px-8 text-base",
        icon: "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
