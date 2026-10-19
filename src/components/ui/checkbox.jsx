import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      // 22px de desenho dentro de 48px de area tocavel: o quadrado pequeno
      // fica legivel e o dedo tem onde acertar. A marca pinta quando marcado.
      //
      // FUNDO BRANCO COM FIO DE BORDA, e nao `bg-fundo` liso: a caixa precisa
      // aparecer em QUALQUER superficie. Com `bg-fundo` ela some quando o pai
      // tambem e `bg-fundo` — foi o que aconteceu com "Pedido critico" no
      // cartao de check-out, onde sobrava uma pilula vazia sem caixa nenhuma,
      // e quem olhava nao tinha como saber se estava marcado.
      "peer relative h-[22px] w-[22px] shrink-0 rounded-[7px] bg-cartao outline-none",
      "ring-1 ring-inset ring-borda",
      "before:absolute before:-inset-[13px] before:content-['']",
      "transition-[background-color,box-shadow]",
      "focus-visible:shadow-foco",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-marca data-[state=checked]:text-white data-[state=checked]:ring-marca",
      className
    )}
    {...props}>
    <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>
      <Check className="h-4 w-4" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
