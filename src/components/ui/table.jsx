import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Tabela da direção "Fluxo".
 *
 * O QUE MUDOU
 *
 *  - **sem grade.** Era `border-b` em cada linha E em cada célula: a tela
 *    virava papel quadriculado. Agora só uma linha fina separa os registros,
 *    e o cabeçalho se separa por peso e cor, não por traço;
 *  - **linha de 56px.** Era `h-10` (40px) no cabeçalho e padding solto na
 *    célula. 56px dá espaço para o botão de 48px da linha caber sem apertar,
 *    e é o que torna a lista legível no tablet;
 *  - **cabeçalho pequeno**, em maiúscula fina e cinza: ele rotula, não
 *    compete com o dado;
 *  - o contêiner arredonda e corta o conteúdo, para a primeira e a última
 *    linha acompanharem o raio do cartão.
 */
const Table = React.forwardRef(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto rounded-token">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props} />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-0", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props} />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("bg-fundo font-bold [&>tr]:last:border-b-0", className)}
    {...props} />
))
TableFooter.displayName = "TableFooter"

/** Linha: 56px, separador fino, realce suave sob o mouse. */
const TableRow = React.forwardRef(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-borda transition-colors hover:bg-cartao-fraco",
      "data-[state=selected]:bg-marca-suave",
      className
    )}
    {...props} />
))
TableRow.displayName = "TableRow"

/** Cabeçalho: pequeno, maiúsculo, cinza. Rotula sem competir com o dado. */
const TableHead = React.forwardRef(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-11 px-4 text-left align-middle text-[11px] font-bold uppercase",
      "tracking-[0.04em] text-texto-apagado",
      "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props} />
))
TableHead.displayName = "TableHead"

/** Célula: 56px de altura mínima de linha vem daqui. */
const TableCell = React.forwardRef(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "h-14 px-4 align-middle font-semibold text-tinta",
      "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props} />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm font-semibold text-texto-fraco", className)}
    {...props} />
))
TableCaption.displayName = "TableCaption"

export {
  Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption,
}
