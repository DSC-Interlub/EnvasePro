import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    (<textarea
      className={cn(
        // Mesma gramatica do Input: fundo suave, sem borda, halo no foco.
        "flex min-h-[96px] w-full rounded-token border-2 border-transparent bg-fundo px-3.5 py-2.5",
        "text-base font-semibold text-tinta transition-[background-color,border-color,box-shadow]",
        "placeholder:font-medium placeholder:text-texto-apagado",
        "outline-none focus-visible:border-marca focus-visible:bg-cartao focus-visible:shadow-foco",
        "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Textarea.displayName = "Textarea"

export { Textarea }
