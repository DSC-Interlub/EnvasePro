import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Power, Truck } from "lucide-react";

const EMPTY = { nome: "", tipo: "Nacional", pais_origem: "", observacoes: "", ativo: true };

export default function AbaFornecedoresRecebimento() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const { data: fornecedores = [] } = useQuery({
    queryKey: ["recebimento-fornecedores"],
    queryFn: () => base44.entities.RecebimentoFornecedor.list("nome"),
  });

  const mutation = useMutation({
    mutationFn: (data) => editando
      ? base44.entities.RecebimentoFornecedor.update(editando.id, data)
      : base44.entities.RecebimentoFornecedor.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recebimento-fornecedores"] });
      setModal(false);
    },
  });

  const toggleAtivo = useMutation({
    mutationFn: ({ id, ativo }) => base44.entities.RecebimentoFornecedor.update(id, { ativo }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recebimento-fornecedores"] }),
  });

  const handleAbrirModal = (f = null) => {
    setEditando(f);
    setForm(f ? { nome: f.nome, tipo: f.tipo || "Nacional", pais_origem: f.pais_origem || "", observacoes: f.observacoes || "", ativo: f.ativo !== false } : EMPTY);
    setModal(true);
  };

  return (
    <Card className="border-slate-200 shadow-md">
      <CardHeader className="border-b border-slate-100">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Truck className="w-5 h-5 text-blue-600" /> Fornecedores ({fornecedores.length})
          </CardTitle>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1" onClick={() => handleAbrirModal()}>
            <Plus className="w-4 h-4" /> Novo
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {fornecedores.length === 0 ? (
          <div className="text-center py-8 text-slate-400">Nenhum fornecedor cadastrado</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {fornecedores.map(f => (
              <div key={f.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{f.nome}</span>
                    <Badge className={`text-xs ${f.ativo !== false ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {f.ativo !== false ? "Ativo" : "Inativo"}
                    </Badge>
                    <Badge className="text-xs bg-blue-100 text-blue-700">{f.tipo}</Badge>
                    {f.pais_origem && <span className="text-xs text-slate-400">{f.pais_origem}</span>}
                  </div>
                  {f.observacoes && <p className="text-xs text-slate-400 mt-0.5">{f.observacoes}</p>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => handleAbrirModal(f)}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="outline" className={`h-7 text-xs px-2 ${f.ativo !== false ? "border-red-200 text-red-600" : "border-green-200 text-green-600"}`}
                    onClick={() => toggleAtivo.mutate({ id: f.id, ativo: !(f.ativo !== false) })}>
                    <Power className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do fornecedor" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Nacional", "Internacional", "Ambos"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(form.tipo === "Internacional" || form.tipo === "Ambos") && (
              <div>
                <Label>País de origem</Label>
                <Input value={form.pais_origem} onChange={e => setForm(f => ({ ...f, pais_origem: e.target.value }))} placeholder="Ex: Alemanha, EUA..." />
              </div>
            )}
            <div>
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => mutation.mutate(form)}
              disabled={!form.nome || mutation.isPending}>
              {mutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}