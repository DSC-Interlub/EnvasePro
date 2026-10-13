import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
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
        default: "h-12 px-4 py-2",
        sm: "h-10 rounded-md px-3 text-xs",
        lg: "h-14 rounded-md px-8",
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
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
