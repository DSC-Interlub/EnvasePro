import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, Trash2 } from "lucide-react";

function parseLinhas(texto, tipoLinha) {
  const rows = texto.trim().split("\n").filter(r => r.trim());
  return rows.map(row => {
    const parts = row.split("\t");
    return {
      numero_item: parts[1]?.trim() || "",
      descricao_produto: parts[2]?.trim() || "",
      lote: parts[3]?.trim() || "",
      deposito: parts[4]?.trim() || "",
      rua_torre: parts[5]?.trim() || "",
      quantidade: parseFloat(parts[6]?.trim()) || 0,
      tipo_linha: tipoLinha,
      status: "Pendente",
    };
  }).filter(l => l.numero_item || l.descricao_produto);
}

const emptyForm = { tipo_linha: "Crítico", descricao_produto: "", deposito: "", rua_torre: "", quantidade: 0, lote: "", numero_item: "", observacoes: "" };

export default function ModalAdicionarLinha({ open, onClose, programacaoId }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [rawText, setRawText] = useState("");
  const [importTipo, setImportTipo] = useState("Crítico");
  const [importPreview, setImportPreview] = useState([]);

  const addMutation = useMutation({
    mutationFn: (linhas) => base44.entities.EmpilhaLinha.bulkCreate(
      linhas.map(l => ({ ...l, programacao_id: programacaoId }))
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empilha-linhas", programacaoId] });
      queryClient.invalidateQueries({ queryKey: ["empilha-programacao", programacaoId] });
      setForm(emptyForm);
      setRawText("");
      setImportPreview([]);
      onClose();
    },
  });

  const handleManual = () => {
    if (!form.descricao_produto && !form.numero_item) return;
    addMutation.mutate([{ ...form, status: "Pendente" }]);
  };

  const handleProcessar = () => {
    setImportPreview(parseLinhas(rawText, importTipo));
  };

  const handleImportar = () => {
    if (importPreview.length === 0) return;
    addMutation.mutate(importPreview);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar Linha à Programação</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="manual">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="excel">Importar Excel</TabsTrigger>
          </TabsList>

          {/* Aba Manual */}
          <TabsContent value="manual" className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Tipo da Linha *</Label>
                <Select value={form.tipo_linha} onValueChange={v => setForm(p => ({ ...p, tipo_linha: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Crítico">🔴 Crítico — pedido urgente</SelectItem>
                    <SelectItem value="Avulso">🟡 Avulso — demanda fora da prog.</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nº Item</Label>
                <Input value={form.numero_item} onChange={e => setForm(p => ({ ...p, numero_item: e.target.value }))} placeholder="IVP..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Depósito</Label>
                <Input value={form.deposito} onChange={e => setForm(p => ({ ...p, deposito: e.target.value }))} placeholder="ERM, EPB..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rua/Torre</Label>
                <Input value={form.rua_torre} onChange={e => setForm(p => ({ ...p, rua_torre: e.target.value }))} placeholder="R02-T01" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantidade</Label>
                <Input type="number" value={form.quantidade} onChange={e => setForm(p => ({ ...p, quantidade: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Descrição do Produto *</Label>
                <Input value={form.descricao_produto} onChange={e => setForm(p => ({ ...p, descricao_produto: e.target.value }))} placeholder="Nome do produto ou tarefa" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Observações</Label>
                <Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button
                className={form.tipo_linha === "Crítico" ? "bg-red-600 hover:bg-red-700" : "bg-amber-500 hover:bg-amber-600"}
                onClick={handleManual}
                disabled={(!form.descricao_produto && !form.numero_item) || addMutation.isPending}
              >
                {addMutation.isPending ? "Adicionando..." : `Adicionar ${form.tipo_linha}`}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Aba Excel */}
          <TabsContent value="excel" className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs">Tipo das linhas importadas</Label>
              <Select value={importTipo} onValueChange={setImportTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Crítico">🔴 Crítico</SelectItem>
                  <SelectItem value="Avulso">🟡 Avulso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-slate-500">
              Colunas: <code className="bg-slate-100 px-1 rounded">Data | Nº Item | Descrição | Lote | Depósito | Rua/Torre | Quantidade | Operador | Líder</code>
            </p>
            <Textarea
              value={rawText}
              onChange={e => { setRawText(e.target.value); setImportPreview([]); }}
              placeholder={"Cole os dados copiados da planilha aqui..."}
              rows={5}
              className="font-mono text-xs"
            />
            <Button variant="outline" onClick={handleProcessar} disabled={!rawText.trim()}>
              <Search className="w-4 h-4 mr-2" /> Processar
            </Button>

            {importPreview.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  {importPreview.length} linhas encontradas
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {importPreview.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-t text-xs">
                      <Badge className={l.tipo_linha === "Crítico" ? "bg-red-600 text-white" : "bg-amber-500 text-white"}>
                        {l.tipo_linha}
                      </Badge>
                      <span className="font-medium">{l.descricao_produto || l.numero_item}</span>
                      <span className="text-slate-400">{l.rua_torre}</span>
                      <span className="ml-auto text-slate-500">{l.quantidade} un.</span>
                      <Button variant="ghost" size="icon" className="w-5 h-5" onClick={() => setImportPreview(p => p.filter((_, j) => j !== i))}>
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700"
                onClick={handleImportar}
                disabled={importPreview.length === 0 || addMutation.isPending}
              >
                {addMutation.isPending ? "Importando..." : `Importar ${importPreview.length} linhas`}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}