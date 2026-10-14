import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const alertVariants = cva(
  // Sem borda: o aviso se destaca pelo FUNDO suave do estado, como os
  // selos. Borda mais fundo mais icone e sinal repetido tres vezes.
  "relative w-full rounded-painel px-4 py-3.5 text-sm font-semibold " +
  "[&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "bg-marca-suave text-marca [&>svg]:text-marca",
        ok: "bg-ok-suave text-ok [&>svg]:text-ok",
        atencao: "bg-atencao-suave text-atencao-tinta [&>svg]:text-atencao-tinta",
        destructive:
          "bg-erro-suave text-erro [&>svg]:text-erro",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props} />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props} />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props} />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
