import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Edit, Trash2, Upload } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import EmbalagemForm from "@/components/cadastros/EmbalagemForm";

export default function AbaEmbalagens() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingEmbalagem, setEditingEmbalagem] = useState(null);
  const queryClient = useQueryClient();

  const { data: embalagens = [] } = useQuery({
    queryKey: ["embalagens"],
    queryFn: () => base44.entities.Embalagem.list("codigo"),
    staleTime: Infinity,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Embalagem.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["embalagens"] }),
  });

  const filteredEmbalagens = embalagens.filter(e =>
    e.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.codigo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Link to={createPageUrl("ImportarEmbalagens")}><Button variant="outline"><Upload className="w-4 h-4 mr-2" /> Importar Excel</Button></Link>
        <Button onClick={() => { setEditingEmbalagem(null); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" /> Nova Embalagem
        </Button>
      </div>

      {showForm && (
        <EmbalagemForm embalagem={editingEmbalagem} onClose={() => { setShowForm(false); setEditingEmbalagem(null); }} />
      )}

      <Card className="border-slate-200 shadow-md">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Embalagens ({embalagens.length})</CardTitle>
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
                  <TableHead>Código</TableHead><TableHead>Descrição</TableHead>
                  <TableHead>Conteúdo</TableHead><TableHead>Tipo</TableHead>
                  <TableHead>4 Dígitos</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmbalagens.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono font-semibold">{e.codigo}</TableCell>
                    <TableCell>{e.descricao}</TableCell>
                    <TableCell>{e.conteudo}</TableCell>
                    <TableCell><Badge variant="secondary">{e.tipo}</Badge></TableCell>
                    <TableCell className="font-mono">{e.ultimos_4_digitos}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => { setEditingEmbalagem(e); setShowForm(true); }}><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => confirm("Excluir embalagem?") && deleteMutation.mutate(e.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
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