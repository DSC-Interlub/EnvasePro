import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Upload, Search, Pencil, Trash2, Plus } from "lucide-react";
import ModalImportarSAP from "./ModalImportarSAP";
import { format } from "date-fns";

const PER_PAGE = 50;
const EMPTY = { numero_documento: "", nome_fornecedor: "", codigo_fornecedor: "", data_chegada: "", codigo_item: "", produto: "", quantidade: 0, item_para_recebimento: "", ativo: true };

export default function AbaBaseSAP() {
  const queryClient = useQueryClient();
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editItem, setEditItem] = useState(null); // null = fechado, {} = novo, {id,...} = editar
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ["sap-pedidos"],
    queryFn: () => base44.entities.SapPedido.list("-created_date", 2000),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => data.id
      ? base44.entities.SapPedido.update(data.id, data)
      : base44.entities.SapPedido.create({ ...data, ativo: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sap-pedidos"] });
      setEditItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.SapPedido.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sap-pedidos"] });
      setConfirmDelete(null);
    },
  });

  const filtered = pedidos.filter(p =>
    !search ||
    p.nome_fornecedor?.toLowerCase().includes(search.toLowerCase()) ||
    p.numero_documento?.includes(search) ||
    p.codigo_fornecedor?.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleSave = () => {
    if (!editItem.numero_documento || !editItem.nome_fornecedor) return;
    saveMutation.mutate(editItem);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            placeholder="Buscar por fornecedor, cód. ou Nº doc..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditItem({ ...EMPTY })}>
            <Plus className="w-4 h-4 mr-1" /> Novo registro
          </Button>
          <Button onClick={() => setShowImport(true)} className="bg-blue-600 hover:bg-blue-700">
            <Upload className="w-4 h-4 mr-2" /> Importar base SAP
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="text-base">
            Base SAP — {isLoading ? "carregando..." : `${filtered.length} registros`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Nº doc.</th>
                <th className="px-3 py-2 text-left">Fornecedor</th>
                <th className="px-3 py-2 text-left">Cód. fornec.</th>
                <th className="px-3 py-2 text-left">Data chegada</th>
                <th className="px-3 py-2 text-left">Cód. Item</th>
                <th className="px-3 py-2 text-left">Produto</th>
                <th className="px-3 py-2 text-right">Qtd</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-center w-20">Ações</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(p => (
                <tr key={p.id} className={`border-t hover:bg-slate-50 ${!p.ativo ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2 font-mono font-semibold">{p.numero_documento}</td>
                  <td className="px-3 py-2 max-w-[180px] truncate">{p.nome_fornecedor}</td>
                  <td className="px-3 py-2 font-mono text-[10px]">{p.codigo_fornecedor || "—"}</td>
                  <td className="px-3 py-2">
                    {(p.data_chegada || p.data_vencimento) ? format(new Date((p.data_chegada || p.data_vencimento) + "T00:00:00"), "dd/MM/yyyy") : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px]">{p.codigo_item || "—"}</td>
                  <td className="px-3 py-2 max-w-[180px] truncate">{p.produto || "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">{p.quantidade > 0 ? p.quantidade.toLocaleString('pt-BR') : "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <Badge
                      className={`cursor-pointer text-[10px] ${p.ativo ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}
                      onClick={() => saveMutation.mutate({ ...p, ativo: !p.ativo })}
                    >
                      {p.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex gap-1 justify-center">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={() => setEditItem({ ...p })}>
                        <Pencil className="w-3 h-3 text-blue-600" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={() => setConfirmDelete(p)}>
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400">
                    {search ? "Nenhum resultado para a busca" : "Base SAP vazia — importe ou adicione registros"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 items-center">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <span className="text-xs text-slate-500">{page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
        </div>
      )}

      {/* Modal de edição/criação */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem?.id ? "Editar registro SAP" : "Novo registro SAP"}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Nº doc. *</label>
                <Input value={editItem.numero_documento || ""} placeholder="Ex: 25980"
                  onChange={e => setEditItem(v => ({ ...v, numero_documento: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Fornecedor *</label>
                <Input value={editItem.nome_fornecedor || ""} placeholder="Nome do fornecedor"
                  onChange={e => setEditItem(v => ({ ...v, nome_fornecedor: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Código do fornecedor</label>
                <Input value={editItem.codigo_fornecedor || ""} placeholder="Ex: FOR000002"
                  onChange={e => setEditItem(v => ({ ...v, codigo_fornecedor: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Data de chegada</label>
                <Input type="date" value={editItem.data_chegada || editItem.data_vencimento || ""}
                  onChange={e => setEditItem(v => ({ ...v, data_chegada: e.target.value, data_vencimento: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Código do Item</label>
                <Input value={editItem.codigo_item || ""} placeholder="Ex: IVP072696220"
                  onChange={e => setEditItem(v => ({ ...v, codigo_item: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Produto</label>
                <Input value={editItem.produto || ""} placeholder="Nome do produto"
                  onChange={e => setEditItem(v => ({ ...v, produto: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Quantidade</label>
                <Input type="number" value={editItem.quantidade || 0}
                  onChange={e => setEditItem(v => ({ ...v, quantidade: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || !editItem?.numero_documento || !editItem?.nome_fornecedor}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de confirmação de exclusão */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 py-2">
            Deseja remover o registro <strong>{confirmDelete?.numero_documento}</strong> — {confirmDelete?.nome_fornecedor}?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate(confirmDelete.id)}
              disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ModalImportarSAP open={showImport} onClose={() => setShowImport(false)} />
    </div>
  );
}