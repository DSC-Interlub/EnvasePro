import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * A lista suspensa de operadores — o ÚNICO jeito de dizer quem fez uma tarefa.
 *
 * Todos os colaboradores usam a mesma conta compartilhada e se identificam
 * escolhendo o nome aqui, dentro de cada tarefa (decisão do dono, 20/10/2026,
 * como era na Base44). Por isso:
 *   - só operadores ATIVOS do cadastro;
 *   - filtro por sala: numa tarefa de sala Bio entram os operadores de Bio e
 *     os de "Ambas"; idem Industrial. Sem sala, todos;
 *   - o valor é o ID (o nome é só o rótulo): dois operadores com o mesmo nome
 *     não se confundem, e o operator_id gravado é o da opção escolhida;
 *   - NUNCA pré-preenchido, e nada fica lembrado entre uma tarefa e outra;
 *   - com o cadastro vazio, diz onde cadastrar em vez de mostrar lista vazia.
 *
 * `aoEscolher(op)` recebe o operador inteiro ({ id, nome, sala, ... }) ou null.
 * `opcaoNenhum` (texto) acrescenta uma primeira opção que escolhe "ninguém"
 * (ex.: "Sem ajudante"): `aoEscolher` recebe a string "nenhum", e `valor`
 * "nenhum" mostra essa opção. Não escolher nada continua sendo "" (vazio).
 */

const NENHUM = "__nenhum__";

export function operadoresDaSala(operadores, sala) {
  return (operadores || [])
    .filter((o) => o.ativo !== false)
    .filter((o) => !sala || !o.sala || o.sala === sala || o.sala === "Ambas")
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
}

export function useOperadoresAtivos() {
  return useQuery({
    queryKey: ["operators"],
    queryFn: () => base44.entities.Operator.list("nome"),
    staleTime: 60000,
  });
}

export default function SelectOperador({
  id, rotulo = "Operador", valor, aoEscolher, sala, excluir = [], obrigatorio = false,
  placeholder = "Selecione o operador", desabilitado = false, erro, mostrarRotulo = true, className = "",
  opcaoNenhum,
}) {
  const { data: todos = [], isLoading } = useOperadoresAtivos();
  const opcoes = operadoresDaSala(todos, sala).filter((o) => !excluir.includes(o.id));
  const vazio = !isLoading && opcoes.length === 0;

  return (
    <div className={`min-w-0 space-y-2 ${className}`}>
      {mostrarRotulo && (
        <Label htmlFor={id}>{rotulo}{obrigatorio ? " *" : ""}</Label>
      )}
      <Select
        value={opcaoNenhum && valor === "nenhum" ? NENHUM : valor || ""}
        onValueChange={(v) => aoEscolher(v === NENHUM ? "nenhum" : opcoes.find((o) => o.id === v) || null)}
        disabled={desabilitado || isLoading || vazio}
      >
        <SelectTrigger id={id} aria-label={mostrarRotulo ? undefined : rotulo} aria-invalid={erro ? "true" : undefined} aria-required={obrigatorio || undefined}>
          <SelectValue placeholder={isLoading ? "Carregando operadores…" : vazio ? "Nenhum operador cadastrado" : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {opcaoNenhum && <SelectItem value={NENHUM}>{opcaoNenhum}</SelectItem>}
          {opcoes.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.nome}{sala ? "" : o.sala && o.sala !== "Ambas" ? ` · ${o.sala}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {vazio && (
        <p className="text-xs font-bold text-atencao">
          {sala ? `Nenhum operador ativo da sala ${sala}.` : "Nenhum operador ativo."} Cadastre em Configurações → Operadores.
        </p>
      )}
      {erro && <p className="text-xs font-bold text-erro">{erro}</p>}
    </div>
  );
}
