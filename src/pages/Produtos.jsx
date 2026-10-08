import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Upload, Download, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

import ProductForm from "../components/cadastros/ProductForm";
import AcoesDaLinha from "../components/listas/AcoesDaLinha";
import RodapeDaLista from "../components/listas/RodapeDaLista";
import { useListaPaginada } from "../components/listas/useListaPaginada";
import { useEhCelular } from "../components/listas/useEhCelular";

export default function Produtos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list("codigo"),
    initialData: [],
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const filteredProducts = products.filter(p =>
    p.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const ehCelular = useEhCelular();
  const lista = useListaPaginada(filteredProducts, searchTerm);

  const handleEdit = (product) => {
    setEditingProduct(product);
    setShowForm(true);
  };

  const handleExport = () => {
    const rows = products.map(p => ({
      "Código": p.codigo ?? "",
      "Descrição": p.nome ?? "",
      "Unidade de Medida": p.unidade_medida ?? "",
      "Consistência": p.consistencia ?? "",
      "NSF 3H": p.nsf_3h ? "X" : "",
      "NSF H1": p.nsf_h1 ? "X" : "",
      "HALAL": p.halal ? "X" : "",
      "KOSHER": p.kosher ? "X" : "",
      "Categoria": p.categoria ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produtos");
    XLSX.writeFile(wb, "produtos.xlsx");
  };

  // A confirmação vive no AcoesDaLinha, num diálogo da aplicação que diz qual
  // produto será excluído — o confirm() do navegador só dizia "tem certeza?".
  const handleDelete = (id) => deleteMutation.mutate(id);

  // Funcao, nao componente: definido dentro do corpo, um componente ganha
  // identidade nova a cada render e remonta a subarvore inteira.
  const certificacoes = (p) => (
    <div className="flex gap-1 flex-wrap">
      {p.nsf_3h && <Badge className="bg-blue-100 text-blue-800 text-xs">NSF 3H</Badge>}
      {p.nsf_h1 && <Badge className="bg-green-100 text-green-800 text-xs">NSF H1</Badge>}
      {p.halal && <Badge className="bg-purple-100 text-purple-800 text-xs">HALAL</Badge>}
      {p.kosher && <Badge className="bg-slate-100 text-slate-800 text-xs">KOSHER</Badge>}
      {!p.nsf_3h && !p.nsf_h1 && !p.halal && !p.kosher && (
        <span className="text-xs text-slate-400">-</span>
      )}
    </div>
  );

  const semCategoria = () => (
    <span title="Sem categoria" className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium bg-amber-100 px-1.5 py-0.5 rounded">
      <AlertTriangle className="w-3 h-3" />
      Sem categoria
    </span>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:flex-wrap justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Cadastro de Produtos</h1>
            <p className="text-slate-600 mt-1">Gerencie o catálogo de produtos</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Exportar Excel
            </Button>
            <Link to={createPageUrl("ImportarProdutos")}>
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                Importar Excel
              </Button>
            </Link>
            <Button 
              onClick={() => {
                setEditingProduct(null);
                setShowForm(true);
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Produto
            </Button>
          </div>
        </div>

        {showForm && (
          <ProductForm
            product={editingProduct}
            onClose={() => {
              setShowForm(false);
              setEditingProduct(null);
            }}
          />
        )}

        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <CardTitle className="text-xl font-bold text-slate-900">
                  Lista de Produtos
                </CardTitle>
                {products.filter(p => !p.categoria).length > 0 && (
                  <span className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {products.filter(p => !p.categoria).length} sem categoria
                  </span>
                )}
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Buscar produtos..."
                  aria-label="Buscar produtos"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-12"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Celular: cartão por produto. A tabela de 6 colunas só rolava na
                horizontal, e as ações ficavam fora da tela. */}
            {ehCelular && (
            <div className="divide-y divide-slate-100">
              {lista.pagina.map((product) => (
                <div key={product.id} className={`p-4 space-y-3 ${!product.categoria ? "bg-amber-50/50" : ""}`}>
                  <div>
                    <p className="font-mono font-semibold text-slate-900">{product.codigo}</p>
                    <p className="text-slate-700">{product.nome}</p>
                    {!product.categoria && <div className="mt-1">{semCategoria()}</div>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <span>{product.unidade_medida}</span>
                    {product.consistencia && <Badge variant="secondary">{product.consistencia}</Badge>}
                  </div>
                  {certificacoes(product)}
                  <AcoesDaLinha
                    nomeDoItem={product.codigo || "produto"}
                    descricao={`O produto ${product.codigo} — ${product.nome} — será removido do catálogo. Esta ação não pode ser desfeita.`}
                    onEditar={() => handleEdit(product)}
                    onExcluir={() => handleDelete(product.id)}
                    excluindo={deleteMutation.isPending}
                  />
                </div>
              ))}
            </div>
            )}

            {!ehCelular && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Código</TableHead>
                    <TableHead>Nome do Produto</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Consistência</TableHead>
                    <TableHead>Certificações</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.pagina.map((product) => (
                    <TableRow key={product.id} className={!product.categoria ? "bg-amber-50/50" : ""}>
                      <TableCell className="font-mono font-semibold">{product.codigo}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {product.nome}
                          {!product.categoria && semCategoria()}
                        </div>
                      </TableCell>
                      <TableCell>{product.unidade_medida}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{product.consistencia}</Badge>
                      </TableCell>
                      <TableCell>
                        {certificacoes(product)}
                      </TableCell>
                      <TableCell className="text-right">
                        <AcoesDaLinha
                          nomeDoItem={product.codigo || "produto"}
                          descricao={`O produto ${product.codigo} — ${product.nome} — será removido do catálogo. Esta ação não pode ser desfeita.`}
                          onEditar={() => handleEdit(product)}
                          onExcluir={() => handleDelete(product.id)}
                          excluindo={deleteMutation.isPending}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            )}

            <RodapeDaLista {...lista} substantivo="produtos" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}