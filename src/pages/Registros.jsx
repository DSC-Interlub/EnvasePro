import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Eye, 
  Edit, 
  Trash2,
  Plus,
  Factory,
  Clock,
  CheckCircle,
  Package
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import RecordDetails from "../components/registros/RecordDetails";
import RecordEdit from "../components/registros/RecordEdit";

export default function Registros() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all"); // "all", "bio", "industrial", "finalizados"
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const queryClient = useQueryClient();

  const { data: records, isLoading } = useQuery({
    queryKey: ['envase-records'],
    queryFn: () => base44.entities.EnvaseRecord.list("-data"),
    initialData: [],
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    staleTime: Infinity,
  });

  const { data: embalagens = [] } = useQuery({
    queryKey: ['embalagens'],
    queryFn: () => base44.entities.Embalagem.list(),
    staleTime: Infinity,
  });

  const { data: operators = [] } = useQuery({
    queryKey: ['operators'],
    queryFn: () => base44.entities.Operator.list(),
    staleTime: Infinity,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.EnvaseRecord.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envase-records'] });
    },
  });

  const marcarRetiradoMutation = useMutation({
    mutationFn: (id) => base44.entities.EnvaseRecord.update(id, { material_retirado: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envase-records'] });
      queryClient.invalidateQueries({ queryKey: ['envase-live'] });
    },
  });

  const filteredRecords = records.filter(record => {
    // Filtro de busca
    const searchMatch = 
      record.op?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.operador?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.descricao_produto?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.codigo_produto?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!searchMatch) return false;

    // Determinar se o registro está finalizado
    const isFinalizado = record.termino && (record.sala !== "Bio" || record.material_retirado);

    // Filtro por status
    if (selectedFilter === "finalizados") {
      return isFinalizado;
    } else {
      // Para as outras abas, mostrar apenas os em andamento
      if (isFinalizado) return false;
      
      // Filtro por sala (apenas para registros em andamento)
      if (selectedFilter === "bio") return record.sala === "Bio";
      if (selectedFilter === "industrial") return record.sala === "Industrial";
      return true; // "all" - todos os em andamento
    }
  });

  const handleDelete = async (id) => {
    if (confirm("Tem certeza que deseja excluir este registro?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleMarcarRetirado = async (record) => {
    if (confirm(`Confirmar que o material do registro ${record.op} foi retirado da sala?`)) {
      marcarRetiradoMutation.mutate(record.id);
    }
  };

  const handleView = (record) => {
    setSelectedRecord(record);
    setEditingRecord(null);
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setSelectedRecord(null);
  };

  const handleCloseModals = () => {
    setSelectedRecord(null);
    setEditingRecord(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Todos os Registros</h1>
            <p className="text-slate-600 mt-1">Visualize e gerencie todos os registros de envase</p>
          </div>
          <Link to={createPageUrl("NovoRegistro")}>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Novo Registro
            </Button>
          </Link>
        </div>

        {/* Filtros */}
        <Card className="border-slate-200 shadow-lg">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Tabs value={selectedFilter} onValueChange={setSelectedFilter}>
                  <TabsList className="bg-white border border-slate-200 w-full grid grid-cols-4">
                    <TabsTrigger value="all">Em Andamento</TabsTrigger>
                    <TabsTrigger value="bio">Sala Bio</TabsTrigger>
                    <TabsTrigger value="industrial">Sala Industrial</TabsTrigger>
                    <TabsTrigger value="finalizados">Finalizados</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    placeholder="Buscar por OP, operador, produto..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-white"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Registros */}
        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-xl font-bold text-slate-900">
              {selectedFilter === "finalizados" ? "Registros Finalizados" : "Registros em Andamento"} ({filteredRecords.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Data</TableHead>
                    <TableHead>OP</TableHead>
                    <TableHead>Sala</TableHead>
                    <TableHead>Operador</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Qtd. Produzida</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                        Carregando registros...
                      </TableCell>
                    </TableRow>
                  ) : filteredRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                        Nenhum registro encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecords.map((record) => (
                      <TableRow key={record.id} className="hover:bg-slate-50">
                        <TableCell className="font-medium">
                          {format(new Date(record.data), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="font-mono">{record.op}</TableCell>
                        <TableCell>
                          <Badge variant={record.sala === "Bio" ? "default" : "secondary"}>
                            <Factory className="w-3 h-3 mr-1" />
                            {record.sala}
                          </Badge>
                        </TableCell>
                        <TableCell>{record.operador}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {record.descricao_produto}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {record.quantidade_produzida?.toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          {record.sala === "Bio" && record.termino && !record.material_retirado ? (
                            <Badge className="bg-yellow-500 text-white">
                              <Package className="w-3 h-3 mr-1" />
                              Pronto
                            </Badge>
                          ) : record.material_retirado || (record.termino && record.sala === "Industrial") ? (
                            <Badge className="bg-green-600 text-white">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Concluído
                            </Badge>
                          ) : record.termino ? (
                            <Badge className="bg-green-600 text-white">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Concluído
                            </Badge>
                          ) : (
                            <Badge className="bg-blue-500 text-white">
                              <Clock className="w-3 h-3 mr-1" />
                              Em Andamento
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {record.sala === "Bio" && record.termino && !record.material_retirado && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleMarcarRetirado(record)}
                                className="bg-green-50 text-green-700 border-green-300 hover:bg-green-100"
                                disabled={marcarRetiradoMutation.isPending}
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Material Retirado
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleView(record)}
                              title="Ver detalhes"
                            >
                              <Eye className="w-4 h-4 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(record)}
                              title="Editar"
                            >
                              <Edit className="w-4 h-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(record.id)}
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      {selectedRecord && (
        <RecordDetails 
          record={selectedRecord} 
          onClose={handleCloseModals}
          onEdit={() => handleEdit(selectedRecord)}
        />
      )}

      {editingRecord && (
        <RecordEdit
          record={editingRecord}
          products={products}
          embalagens={embalagens}
          operators={operators}
          onClose={handleCloseModals}
        />
      )}
    </div>
  );
}