import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // h-auto + alvo de 48px na aba: com h-9 fixo na lista, cada aba
      // ficava com 28px de altura. Aba e alvo de toque como qualquer botao.
      // Segmentado: trilha branca com sombra rasa, pilula ativa por dentro.
      // Era `bg-muted` cinza sem relevo, onde a aba ativa se distinguia so
      // pelo texto. O prototipo do painel usa trilha branca com a pilula
      // destacada — o estado fica obvio a distancia.
      "inline-flex h-auto items-center justify-center gap-1 rounded-token bg-cartao p-1.5",
      "shadow-leve text-texto-fraco",
      className
    )}
    {...props} />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // A aba e alvo de toque: 48px, do item (g) da V1.
      "press inline-flex min-h-[48px] items-center justify-center gap-2 whitespace-nowrap",
      "rounded-token-sm px-4 text-sm font-bold outline-none",
      "hover:bg-marca-suave hover:text-marca",
      "focus-visible:border-marca focus-visible:shadow-foco",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:bg-marca data-[state=active]:text-white data-[state=active]:shadow-marca",
      className
    )}
    {...props} />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props} />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
