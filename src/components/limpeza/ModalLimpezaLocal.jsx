import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function ModalLimpezaLocal({ open, onClose, local }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ nome: "", tipo: "Sala", descricao: "", ativo: true });

  useEffect(() => {
    if (local) setForm({ nome: local.nome || "", tipo: local.tipo || "Sala", descricao: local.descricao || "", ativo: local.ativo !== false });
    else setForm({ nome: "", tipo: "Sala", descricao: "", ativo: true });
  }, [local, open]);

  const mutation = useMutation({
    mutationFn: (data) => local
      ? base44.entities.LimpezaLocal.update(local.id, data)
      : base44.entities.LimpezaLocal.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["limpeza-locais"] });
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{local ? "Editar Local" : "Novo Local de Limpeza"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Sala de Envase" />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Sala", "Galpão", "Banheiro", "Área externa", "Corredor", "Outro"].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={2} placeholder="Observações sobre o local..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => mutation.mutate(form)} disabled={!form.nome || mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}