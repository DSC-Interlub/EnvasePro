import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

import OperatorForm from "../components/cadastros/OperatorForm";
import AcoesDaLinha from "../components/listas/AcoesDaLinha";
import RodapeDaLista from "../components/listas/RodapeDaLista";
import { useListaPaginada } from "../components/listas/useListaPaginada";
import { useEhCelular } from "../components/listas/useEhCelular";

export default function Operadores() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingOperator, setEditingOperator] = useState(null);
  const queryClient = useQueryClient();

  const { data: operators, isLoading } = useQuery({
    queryKey: ['operators'],
    queryFn: () => base44.entities.Operator.list("nome"),
    initialData: [],
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Operator.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operators'] });
    },
  });

  const filteredOperators = operators.filter(o =>
    o.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.matricula?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const ehCelular = useEhCelular();
  const lista = useListaPaginada(filteredOperators, searchTerm);

  const handleEdit = (operator) => {
    setEditingOperator(operator);
    setShowForm(true);
  };

  // A confirmação vive no AcoesDaLinha, num diálogo que diz qual operador
  // será excluído — o confirm() do navegador só dizia "tem certeza?".
  const handleDelete = (id) => deleteMutation.mutate(id);

  const acoes = (o) => (
    <AcoesDaLinha
      nomeDoItem={o.nome || "operador"}
      descricao={`O operador ${o.nome} — matrícula ${o.matricula} — será removido do cadastro. Esta ação não pode ser desfeita.`}
      onEditar={() => handleEdit(o)}
      onExcluir={() => handleDelete(o.id)}
      excluindo={deleteMutation.isPending}
    />
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:flex-wrap justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Cadastro de Operadores</h1>
            <p className="text-slate-600 mt-1">Gerencie a equipe de produção</p>
          </div>
          <Button 
            onClick={() => {
              setEditingOperator(null);
              setShowForm(true);
            }}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Operador
          </Button>
        </div>

        {showForm && (
          <OperatorForm
            operator={editingOperator}
            onClose={() => {
              setShowForm(false);
              setEditingOperator(null);
            }}
          />
        )}

        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-xl font-bold text-slate-900">
                Lista de Operadores
              </CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Buscar operadores..."
                  aria-label="Buscar operadores"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-12"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Celular: cartão por operador, para as ações não ficarem fora da
                tela como ficavam com a tabela rolando na horizontal. */}
            {ehCelular && (
            <div className="divide-y divide-slate-100">
              {lista.pagina.map((operator) => (
                <div key={operator.id} className="p-4 space-y-3">
                  <div>
                    <p className="font-semibold text-slate-900">{operator.nome}</p>
                    <p className="font-mono text-sm text-slate-600">{operator.matricula}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {operator.sala && <Badge variant="secondary">{operator.sala}</Badge>}
                    <Badge variant={operator.ativo ? "default" : "outline"}>
                      {operator.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  {acoes(operator)}
                </div>
              ))}
            </div>
            )}

            {!ehCelular && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Nome</TableHead>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Sala</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.pagina.map((operator) => (
                    <TableRow key={operator.id}>
                      <TableCell className="font-semibold">{operator.nome}</TableCell>
                      <TableCell className="font-mono">{operator.matricula}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{operator.sala}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={operator.ativo ? "default" : "outline"}>
                          {operator.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{acoes(operator)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            )}

            <RodapeDaLista {...lista} substantivo="operadores" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}