import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Box, Edit, Trash2, Upload } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

import EmbalagemForm from "../components/cadastros/EmbalagemForm";

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

  const handleEdit = (embalagem) => {
    setEditingEmbalagem(embalagem);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (confirm("Tem certeza que deseja excluir esta embalagem?")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Cadastro de Embalagens</h1>
            <p className="text-slate-600 mt-1">Gerencie os tipos de embalagem</p>
          </div>
          <div className="flex gap-3">
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-bold text-slate-900">
                Lista de Embalagens
              </CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Buscar embalagens..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
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
                  {filteredEmbalagens.map((embalagem) => (
                    <TableRow key={embalagem.id}>
                      <TableCell className="font-mono font-semibold">{embalagem.codigo}</TableCell>
                      <TableCell>{embalagem.descricao}</TableCell>
                      <TableCell>{embalagem.conteudo}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{embalagem.tipo}</Badge>
                      </TableCell>
                      <TableCell className="font-mono">{embalagem.ultimos_4_digitos}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(embalagem)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(embalagem.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
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
    </div>
  );
}