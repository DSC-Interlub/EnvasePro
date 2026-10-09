import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Upload } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

import EmbalagemForm from "../components/cadastros/EmbalagemForm";
import AcoesDaLinha from "../components/listas/AcoesDaLinha";
import RodapeDaLista from "../components/listas/RodapeDaLista";
import { useListaPaginada } from "../components/listas/useListaPaginada";
import { useEhCelular } from "../components/listas/useEhCelular";

export default function Embalagens() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingEmbalagem, setEditingEmbalagem] = useState(null);
  const queryClient = useQueryClient();

  const { data: embalagens, isLoading } = useQuery({
    queryKey: ['embalagens'],
    queryFn: () => base44.entities.Embalagem.list("codigo"),
    initialData: [],
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Embalagem.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embalagens'] });
    },
  });

  const filteredEmbalagens = embalagens.filter(e =>
    e.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.codigo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const ehCelular = useEhCelular();
  const lista = useListaPaginada(filteredEmbalagens, searchTerm);

  const handleEdit = (embalagem) => {
    setEditingEmbalagem(embalagem);
    setShowForm(true);
  };

  // A confirmação vive no AcoesDaLinha, num diálogo que diz qual embalagem
  // será excluída — o confirm() do navegador só dizia "tem certeza?".
  const handleDelete = (id) => deleteMutation.mutate(id);

  const acoes = (e) => (
    <AcoesDaLinha
      nomeDoItem={e.codigo || "embalagem"}
      descricao={`A embalagem ${e.codigo} — ${e.descricao} — será removida do catálogo. Esta ação não pode ser desfeita.`}
      onEditar={() => handleEdit(e)}
      onExcluir={() => handleDelete(e.id)}
      excluindo={deleteMutation.isPending}
    />
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:flex-wrap justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Cadastro de Embalagens</h1>
            <p className="text-slate-600 mt-1">Gerencie os tipos de embalagem</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to={createPageUrl("ImportarEmbalagens")}>
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                Importar Excel
              </Button>
            </Link>
            <Button 
              onClick={() => {
                setEditingEmbalagem(null);
                setShowForm(true);
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Embalagem
            </Button>
          </div>
        </div>

        {showForm && (
          <EmbalagemForm
            embalagem={editingEmbalagem}
            onClose={() => {
              setShowForm(false);
              setEditingEmbalagem(null);
            }}
          />
        )}

        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-xl font-bold text-slate-900">
                Lista de Embalagens
              </CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Buscar embalagens..."
                  aria-label="Buscar embalagens"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-12"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Celular: cartão por embalagem. A tabela de 6 colunas só rolava
                na horizontal e deixava as ações fora da tela. */}
            {ehCelular && (
            <div className="divide-y divide-slate-100">
              {lista.pagina.map((embalagem) => (
                <div key={embalagem.id} className="p-4 space-y-3">
                  <div>
                    <p className="font-mono font-semibold text-slate-900">{embalagem.codigo}</p>
                    <p className="text-slate-700">{embalagem.descricao}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    {embalagem.conteudo && <span>{embalagem.conteudo}</span>}
                    {embalagem.tipo && <Badge variant="secondary">{embalagem.tipo}</Badge>}
                    {embalagem.ultimos_4_digitos && (
                      <span className="font-mono">{embalagem.ultimos_4_digitos}</span>
                    )}
                  </div>
                  {acoes(embalagem)}
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
                    <TableHead>Descrição</TableHead>
                    <TableHead>Conteúdo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>4 Dígitos</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.pagina.map((embalagem) => (
                    <TableRow key={embalagem.id}>
                      <TableCell className="font-mono font-semibold">{embalagem.codigo}</TableCell>
                      <TableCell>{embalagem.descricao}</TableCell>
                      <TableCell>{embalagem.conteudo}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{embalagem.tipo}</Badge>
                      </TableCell>
                      <TableCell className="font-mono">{embalagem.ultimos_4_digitos}</TableCell>
                      <TableCell className="text-right">{acoes(embalagem)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            )}

            <RodapeDaLista {...lista} substantivo="embalagens" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}