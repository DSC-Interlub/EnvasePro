import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";

const TIPOS = ["Avaria", "Divergência de quantidade", "Produto errado", "Atraso", "Problema de documento", "Problema de acesso", "Outro"];

export default function ModalOcorrenciaRecebimento({ open, onClose, recebimentoId, itens, currentUser }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ tipo: "Outro", descricao: "", registrado_por: "", item_id: "" });

  const { data: operadores = [] } = useQuery({
    queryKey: ["operadores"],
    queryFn: () => base44.entities.Operator.list(),
  });

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.RecebimentoOcorrencia.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recebimento-ocorrencias", recebimentoId] });
      onClose();
      setForm({ tipo: "Outro", descricao: "", registrado_por: "", item_id: "" });
    },
  });

  const handleSalvar = () => {
    mutation.mutate({
      recebimento_id: recebimentoId,
      item_id: form.item_id || undefined,
      tipo: form.tipo,
      descricao: form.descricao,
      registrado_por: form.registrado_por,
      datetime_registro: new Date().toISOString(),
      resolvido: false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Ocorrência</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Tipo</Label>
            <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {itens?.length > 0 && (
            <div>
              <Label>Item vinculado (opcional)</Label>
              <Select value={form.item_id} onValueChange={v => setForm(f => ({ ...f, item_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Nenhum item específico" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Nenhum</SelectItem>
                  {itens.map(i => <SelectItem key={i.id} value={i.id}>{i.produto_descricao}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Descrição *</Label>
            <Textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={3} placeholder="Descreva a ocorrência..." />
          </div>
          <div>
            <Label>Registrado por *</Label>
            <Select value={form.registrado_por} onValueChange={v => setForm(f => ({ ...f, registrado_por: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione quem registra..." /></SelectTrigger>
              <SelectContent>
                {operadores.filter(o => o.ativo !== false).map(o => (
                  <SelectItem key={o.id} value={o.nome}>{o.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-red-600 hover:bg-red-700" onClick={handleSalvar}
            disabled={!form.descricao || !form.registrado_por || mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}