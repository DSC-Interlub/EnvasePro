import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, X, Plus } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function ModalLimpezaProgramacao({ open, onClose, programacao, locais, operadores, programacoes, currentUser }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    local_id: "", local_nome: "",
    data_prevista: format(new Date(), "yyyy-MM-dd"), hora_prevista: "",
    tipo_limpeza: "Limpeza geral", observacoes: "", status: "Pendente",
    criado_por: currentUser?.full_name || "",
    responsaveis: [],
  });
  const [aviso, setAviso] = useState(false);
  const [responsavelSelecionado, setResponsavelSelecionado] = useState("");

  useEffect(() => {
    if (programacao) {
      // Suporte a registros antigos com campo único
      let responsaveis = programacao.responsaveis || [];
      if (responsaveis.length === 0 && programacao.responsavel_id) {
        responsaveis = [{ id: programacao.responsavel_id, nome: programacao.responsavel_nome || "" }];
      }
      setForm({
        local_id: programacao.local_id || "",
        local_nome: programacao.local_nome || "",
        data_prevista: programacao.data_prevista || format(new Date(), "yyyy-MM-dd"),
        hora_prevista: programacao.hora_prevista || "",
        tipo_limpeza: programacao.tipo_limpeza || "Limpeza geral",
        observacoes: programacao.observacoes || "",
        status: programacao.status || "Pendente",
        criado_por: programacao.criado_por || currentUser?.full_name || "",
        responsaveis,
      });
    } else {
      setForm({
        local_id: "", local_nome: "",
        data_prevista: format(new Date(), "yyyy-MM-dd"), hora_prevista: "",
        tipo_limpeza: "Limpeza geral", observacoes: "", status: "Pendente",
        criado_por: currentUser?.full_name || "",
        responsaveis: [],
      });
    }
    setAviso(false);
    setResponsavelSelecionado("");
  }, [programacao, open]);

  const mutation = useMutation({
    mutationFn: (data) => programacao
      ? base44.entities.LimpezaProgramacao.update(programacao.id, data)
      : base44.entities.LimpezaProgramacao.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["limpeza-programacoes"] });
      onClose();
    },
  });

  const handleAddResponsavel = () => {
    if (!responsavelSelecionado) return;
    const op = operadores.find(o => o.id === responsavelSelecionado);
    if (!op) return;
    if (form.responsaveis.some(r => r.id === op.id)) return;
    setForm(f => ({ ...f, responsaveis: [...f.responsaveis, { id: op.id, nome: op.nome }] }));
    setResponsavelSelecionado("");
  };

  const handleRemoveResponsavel = (id) => {
    setForm(f => ({ ...f, responsaveis: f.responsaveis.filter(r => r.id !== id) }));
  };

  const handleSalvar = () => {
    const duplicado = !programacao && programacoes?.some(p =>
      p.local_id === form.local_id && p.data_prevista === form.data_prevista && p.id !== programacao?.id
    );
    if (duplicado && !aviso) { setAviso(true); return; }

    // Desnormalizar: primeiro responsável como campo principal (compatibilidade)
    const primeiroResp = form.responsaveis[0];
    const payload = {
      ...form,
      responsavel_id: primeiroResp?.id || "",
      responsavel_nome: primeiroResp ? form.responsaveis.map(r => r.nome).join(", ") : "",
    };
    mutation.mutate(payload);
  };

  const handleLocalChange = (id) => {
    const local = locais.find(l => l.id === id);
    setForm(f => ({ ...f, local_id: id, local_nome: local?.nome || "" }));
    setAviso(false);
  };

  const disponiveisParaAdd = operadores.filter(o =>
    o.ativo !== false && !form.responsaveis.some(r => r.id === o.id)
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{programacao ? "Editar Programação" : "Nova Programação de Limpeza"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
          {aviso && (
            <Alert className="border-amber-300 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700 text-sm">
                Já existe uma programação para este local nesta data. Clique em "Salvar" novamente para confirmar.
              </AlertDescription>
            </Alert>
          )}
          <div>
            <Label>Local *</Label>
            <Select value={form.local_id} onValueChange={handleLocalChange}>
              <SelectTrigger><SelectValue placeholder="Selecione o local" /></SelectTrigger>
              <SelectContent>
                {locais.filter(l => l.ativo !== false).map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Responsáveis múltiplos */}
          <div>
            <Label>Responsáveis *</Label>
            {form.responsaveis.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2 mt-1">
                {form.responsaveis.map(r => (
                  <Badge key={r.id} className="bg-blue-100 text-blue-800 border border-blue-200 gap-1 pr-1">
                    {r.nome}
                    <button onClick={() => handleRemoveResponsavel(r.id)} className="ml-0.5 hover:text-red-600">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {disponiveisParaAdd.length > 0 && (
              <div className="flex gap-2">
                <Select value={responsavelSelecionado} onValueChange={setResponsavelSelecionado}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Adicionar responsável..." />
                  </SelectTrigger>
                  <SelectContent>
                    {disponiveisParaAdd.map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" size="sm" variant="outline" onClick={handleAddResponsavel} disabled={!responsavelSelecionado}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            )}
            {form.responsaveis.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">Adicione ao menos um responsável.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data prevista *</Label>
              <Input type="date" value={form.data_prevista} onChange={e => { setForm(f => ({ ...f, data_prevista: e.target.value })); setAviso(false); }} />
            </div>
            <div>
              <Label>Hora (opcional)</Label>
              <Input type="time" value={form.hora_prevista} onChange={e => setForm(f => ({ ...f, hora_prevista: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Tipo de limpeza</Label>
            <Select value={form.tipo_limpeza} onValueChange={v => setForm(f => ({ ...f, tipo_limpeza: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Varrição", "Lavagem", "Desinfecção", "Limpeza geral", "Outro"].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} placeholder="Instruções específicas..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSalvar}
            disabled={!form.local_id || form.responsaveis.length === 0 || !form.data_prevista || mutation.isPending}>
            {mutation.isPending ? "Salvando..." : aviso ? "Confirmar mesmo assim" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}