import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    (<input
      type={type}
      className={cn(
        // h-12: 48px, o mesmo alvo dos botoes. Era h-9 (36px), e no
        // formulario de envase o campo de hora ficava visivelmente mais
        // baixo que o botao ao lado depois que os botoes subiram.
        // Fundo suave e SEM borda em repouso; a borda da marca com halo
        // aparece no foco. A altura de 48px vem dos alvos de toque.
        "flex h-12 w-full rounded-token border-2 border-transparent bg-fundo px-3.5 py-1",
        "text-base font-semibold text-tinta transition-[background-color,border-color,box-shadow]",
        "file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-tinta",
        "placeholder:font-medium placeholder:text-texto-apagado",
        "outline-none focus-visible:border-marca focus-visible:bg-cartao focus-visible:shadow-foco",
        "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Input.displayName = "Input"

export { Input }
