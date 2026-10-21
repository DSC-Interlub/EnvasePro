import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SelectOperador from "@/components/operadores/SelectOperador";

const TIPOS = ["Avaria", "Divergência de quantidade", "Produto errado", "Atraso", "Problema de documento", "Problema de acesso", "Outro"];

export default function ModalOcorrenciaRecebimento({ open, onClose, recebimentoId, itens, currentUser }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ tipo: "Outro", descricao: "", registrado_por: "", registrado_por_id: "", item_id: "" });

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.RecebimentoOcorrencia.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recebimento-ocorrencias", recebimentoId] });
      onClose();
      setForm({ tipo: "Outro", descricao: "", registrado_por: "", registrado_por_id: "", item_id: "" });
    },
  });

  const handleSalvar = () => {
    mutation.mutate({
      recebimento_id: recebimentoId,
      item_id: form.item_id || undefined,
      tipo: form.tipo,
      descricao: form.descricao,
      registrado_por: form.registrado_por,
      registrado_por_id: form.registrado_por_id || undefined,
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
              <Select value={form.item_id || "__nenhum__"} onValueChange={v => setForm(f => ({ ...f, item_id: v === "__nenhum__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Nenhum item específico" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhum__">Nenhum</SelectItem>
                  {itens.map(i => <SelectItem key={i.id} value={i.id}>{i.produto_descricao}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Descrição *</Label>
            <Textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={3} placeholder="Descreva a ocorrência..." />
          </div>
          <SelectOperador
            id="ocorrencia-recebimento-por"
            rotulo="Registrado por"
            placeholder="Selecione quem registra..."
            obrigatorio
            valor={form.registrado_por_id}
            aoEscolher={(op) => setForm(f => ({ ...f, registrado_por: op?.nome || "", registrado_por_id: op?.id || "" }))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-erro hover:bg-erro" onClick={handleSalvar}
            disabled={!form.descricao || !form.registrado_por || mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}