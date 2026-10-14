import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Cartão — a superfície padrão da direção "Fluxo".
 *
 * O QUE MUDOU, E POR QUE
 *
 * Era `rounded-xl border bg-card shadow`: raio de 12px, **borda dura** e a
 * sombra genérica do shadcn. Num sistema com cartão dentro de cartão, a borda
 * desenha uma grade e a tela vira uma planilha.
 *
 * Agora: raio 24, **sem borda**, e a sombra de duas camadas dos tokens — uma
 * rasa de 1px que assenta o cartão, e uma larga e muito suave que o separa do
 * fundo. É o que faz o cartão parecer um objeto sobre a mesa.
 *
 * `toca` liga o hover do protótipo: sobe 4px e a sombra abre. Só para cartão
 * que É clicável — num cartão que não leva a lugar nenhum, o movimento
 * promete algo que não acontece.
 */
const Card = React.forwardRef(({ className, toca = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-cartao bg-cartao text-tinta shadow-cartao",
      toca && "cartao-toca cursor-pointer",
      className
    )}
    {...props} />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props} />
))
CardHeader.displayName = "CardHeader"

/** Título de cartão: 20px, peso 800, com o aperto de letra da direção. */
const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-xl font-extrabold leading-tight tracking-[-0.02em] text-tinta", className)}
    {...props} />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm font-semibold text-texto-fraco", className)}
    {...props} />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props} />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
