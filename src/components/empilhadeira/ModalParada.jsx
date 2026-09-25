import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

function calcDiffMinutes(h1, h2) {
  if (!h1 || !h2) return 0;
  const [ah, am] = h1.split(":").map(Number);
  const [bh, bm] = h2.split(":").map(Number);
  return (bh * 60 + bm) - (ah * 60 + am);
}

export default function ModalParada({ open, onClose, empilhadeiraId, programacaoId, operators }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    tipo: "Quebra",
    descricao: "",
    registrado_por: "",
    hora_inicio: format(new Date(), "HH:mm"),
    hora_fim: "",
  });

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        empilhadeira_id: empilhadeiraId,
        programacao_id: programacaoId || "",
        data: format(new Date(), "yyyy-MM-dd"),
        tempo_total: data.hora_fim
          ? `${calcDiffMinutes(data.hora_inicio, data.hora_fim)} min`
          : "",
      };
      return base44.entities.EmpilhadeiraParada.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empilha-paradas"] });
      queryClient.invalidateQueries({ queryKey: ["empilha-paradas-prog", programacaoId] });
      onClose();
      setForm({ tipo: "Quebra", descricao: "", registrado_por: "", hora_inicio: format(new Date(), "HH:mm"), hora_fim: "" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Parada da Empilhadeira</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Quebra", "Manutenção", "Aguardando operador", "Falta de material", "Outro"].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Registrado por *</Label>
            <Select value={form.registrado_por} onValueChange={v => setForm(p => ({ ...p, registrado_por: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(operators || []).filter(o => o.ativo).map(o => (
                  <SelectItem key={o.id} value={o.nome}>{o.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Hora Início *</Label>
              <Input type="time" value={form.hora_inicio} onChange={e => setForm(p => ({ ...p, hora_inicio: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Hora Fim (opcional)</Label>
              <Input type="time" value={form.hora_fim} onChange={e => setForm(p => ({ ...p, hora_fim: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Descreva a parada..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-orange-600 hover:bg-orange-700"
            onClick={() => mutation.mutate(form)}
            disabled={!form.registrado_por || !form.hora_inicio || mutation.isPending}
          >
            {mutation.isPending ? "Registrando..." : "Registrar Parada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}