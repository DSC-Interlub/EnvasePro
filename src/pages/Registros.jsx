import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Factory, Clock, CheckCircle, Package } from "lucide-react";
import { formatarData } from "@/lib/datas";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import RecordDetails from "../components/registros/RecordDetails";
import RecordEdit from "../components/registros/RecordEdit";
import AcoesDaLinha from "../components/listas/AcoesDaLinha";
import RodapeDaLista from "../components/listas/RodapeDaLista";
import { useListaPaginada } from "../components/listas/useListaPaginada";
import { useEhCelular } from "../components/listas/useEhCelular";

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

  // A paginacao reinicia quando muda a busca OU a aba: as duas trocam o
  // conjunto, e manter a contagem mostraria um pedaco arbitrario do novo.
  const ehCelular = useEhCelular();
  const lista = useListaPaginada(filteredRecords, `${searchTerm}|${selectedFilter}`);

  // A confirmacao vive no AcoesDaLinha, num dialogo que diz qual registro
  // sera excluido - o confirm() do navegador so dizia "tem certeza?".
  const handleDelete = (id) => deleteMutation.mutate(id);

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

  // Funcao, nao componente: definido dentro do corpo, um componente ganha
  // identidade nova a cada render e remonta a subarvore inteira.
  const status = (record) => {
    if (record.sala === "Bio" && record.termino && !record.material_retirado) {
      return (
        <Badge className="bg-yellow-500 text-white">
          <Package className="w-3 h-3 mr-1" />
          Pronto
        </Badge>
      );
    }
    if (record.termino || record.material_retirado) {
      return (
        <Badge className="bg-green-600 text-white">
          <CheckCircle className="w-3 h-3 mr-1" />
          Concluído
        </Badge>
      );
    }
    return (
      <Badge className="bg-blue-500 text-white">
        <Clock className="w-3 h-3 mr-1" />
        Em Andamento
      </Badge>
    );
  };

  const acoes = (record) => (
    <AcoesDaLinha
      nomeDoItem={record.op || "registro"}
      descricao={`O registro da OP ${record.op} — ${record.descricao_produto} — será excluído. Esta ação não pode ser desfeita.`}
      onVer={() => handleView(record)}
      onEditar={() => handleEdit(record)}
      onExcluir={() => handleDelete(record.id)}
      excluindo={deleteMutation.isPending}
      extras={record.sala === "Bio" && record.termino && !record.material_retirado && (
        <Button
          variant="outline"
          onClick={() => handleMarcarRetirado(record)}
          className="h-12 bg-green-50 text-green-700 border-green-300 hover:bg-green-100"
          disabled={marcarRetiradoMutation.isPending}
        >
          <CheckCircle className="w-4 h-4 mr-1" />
          Material Retirado
        </Button>
      )}
    />
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:flex-wrap justify-between items-start md:items-center gap-4">
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
              <div className="flex-1 min-w-0">
                <Tabs value={selectedFilter} onValueChange={setSelectedFilter}>
                  <TabsList className="bg-white border border-slate-200 w-full grid grid-cols-2 sm:grid-cols-4 h-auto">
                    <TabsTrigger value="all">Em Andamento</TabsTrigger>
                    <TabsTrigger value="bio">Sala Bio</TabsTrigger>
                    <TabsTrigger value="industrial">Sala Industrial</TabsTrigger>
                    <TabsTrigger value="finalizados">Finalizados</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="flex-1 min-w-0">
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
            {/* Celular: cartao por registro. A tabela tem 8 colunas; no
                celular as acoes ficavam fora da tela. */}
            {ehCelular && (
            <div className="divide-y divide-slate-100">
              {isLoading ? (
                <p className="text-center py-8 text-slate-500">Carregando registros...</p>
              ) : lista.total === 0 ? (
                <p className="text-center py-8 text-slate-500">Nenhum registro encontrado</p>
              ) : lista.pagina.map((record) => (
                <div key={record.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono font-semibold text-slate-900">{record.op}</p>
                      <p className="text-sm text-slate-600">{formatarData(record.data)}</p>
                    </div>
                    {status(record)}
                  </div>
                  <p className="text-slate-700">{record.descricao_produto}</p>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <Badge variant={record.sala === "Bio" ? "default" : "secondary"}>
                      <Factory className="w-3 h-3 mr-1" />
                      {record.sala}
                    </Badge>
                    <span>{record.operador}</span>
                    <span className="font-semibold">
                      {record.quantidade_produzida?.toLocaleString("pt-BR")}
                    </span>
                  </div>
                  {acoes(record)}
                </div>
              ))}
            </div>
            )}

            {!ehCelular && (
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
                  ) : lista.total === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                        Nenhum registro encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    lista.pagina.map((record) => (
                      <TableRow key={record.id} className="hover:bg-slate-50">
                        <TableCell className="font-medium">
                          {formatarData(record.data)}
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
                        <TableCell>{status(record)}</TableCell>
                        <TableCell className="text-right">{acoes(record)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            )}

            <RodapeDaLista {...lista} substantivo="registros" />
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