import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Edit, Trash2, Upload, Download, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ProductForm from "@/components/cadastros/ProductForm";

export default function AbaProdutos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const queryClient = useQueryClient();

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => base44.entities.Product.list("codigo"),
    staleTime: Infinity,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const filteredProducts = products.filter(p =>
    p.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExport = () => {
    const rows = products.map(p => ({
      "Código": p.codigo ?? "", "Descrição": p.nome ?? "",
      "Unidade de Medida": p.unidade_medida ?? "", "Consistência": p.consistencia ?? "",
      "NSF 3H": p.nsf_3h ? "X" : "", "NSF H1": p.nsf_h1 ? "X" : "",
      "HALAL": p.halal ? "X" : "", "KOSHER": p.kosher ? "X" : "", "Categoria": p.categoria ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produtos");
    XLSX.writeFile(wb, "produtos.xlsx");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleExport}><Download className="w-4 h-4 mr-2" /> Exportar Excel</Button>
        <Link to={createPageUrl("ImportarProdutos")}><Button variant="outline"><Upload className="w-4 h-4 mr-2" /> Importar Excel</Button></Link>
        <Button onClick={() => { setEditingProduct(null); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" /> Novo Produto
        </Button>
      </div>

      {showForm && (
        <ProductForm product={editingProduct} onClose={() => { setShowForm(false); setEditingProduct(null); }} />
      )}

      <Card className="border-slate-200 shadow-md">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">Produtos ({products.length})</CardTitle>
              {products.filter(p => !p.categoria).length > 0 && (
                <span className="flex items-center gap-1 bg-amber-50 border border-amber-300 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" /> {products.filter(p => !p.categoria).length} sem categoria
                </span>
              )}
            </div>
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Código</TableHead><TableHead>Nome</TableHead>
                  <TableHead>Unidade</TableHead><TableHead>Consistência</TableHead>
                  <TableHead>Certificações</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map(p => (
                  <TableRow key={p.id} className={!p.categoria ? "bg-amber-50/50" : ""}>
                    <TableCell className="font-mono font-semibold">{p.codigo}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {p.nome}
                        {!p.categoria && <span className="text-amber-600 text-xs bg-amber-100 px-1.5 py-0.5 rounded flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Sem categoria</span>}
                      </div>
                    </TableCell>
                    <TableCell>{p.unidade_medida}</TableCell>
                    <TableCell><Badge variant="secondary">{p.consistencia}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {p.nsf_3h && <Badge className="bg-blue-100 text-blue-800 text-xs">NSF 3H</Badge>}
                        {p.nsf_h1 && <Badge className="bg-green-100 text-green-800 text-xs">NSF H1</Badge>}
                        {p.halal && <Badge className="bg-purple-100 text-purple-800 text-xs">HALAL</Badge>}
                        {p.kosher && <Badge className="bg-slate-100 text-slate-800 text-xs">KOSHER</Badge>}
                        {!p.nsf_3h && !p.nsf_h1 && !p.halal && !p.kosher && <span className="text-xs text-slate-400">-</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => { setEditingProduct(p); setShowForm(true); }}><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => confirm("Excluir produto?") && deleteMutation.mutate(p.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}