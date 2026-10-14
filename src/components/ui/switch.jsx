import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // 28px de altura (era 20) e area tocavel de 48 pelo ::before.
      "peer relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full",
      "border-2 border-transparent outline-none transition-colors",
      "before:absolute before:-inset-x-0 before:-inset-y-2.5 before:content-['']",
      "focus-visible:shadow-foco",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-marca data-[state=unchecked]:bg-trilha",
      className
    )}
    {...props}
    ref={ref}>
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-6 w-6 rounded-full bg-cartao shadow-leve ring-0",
        "transition-transform duration-200 ease-[cubic-bezier(.2,.7,.2,1)]",
        "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      )} />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
