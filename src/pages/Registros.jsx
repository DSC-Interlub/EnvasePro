import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Factory, Clock, CheckCircle, Package, List } from "lucide-react";
import { formatarData } from "@/lib/datas";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import RecordDetails from "../components/registros/RecordDetails";
import RecordEdit from "../components/registros/RecordEdit";
import AcoesDaLinha from "../components/listas/AcoesDaLinha";
import RodapeDaLista from "../components/listas/RodapeDaLista";
import { useListaPaginada } from "../components/listas/useListaPaginada";
import { PageHeader, ListaCard, ChipsFiltro, EmptyState, StatusPill } from "@/components/fluxo";
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
      // StatusPill: o mesmo estado com a mesma cara em todo o sistema.
      // Antes era bg-yellow-500/bg-green-600/bg-marca escritos aqui, e o
      // mesmo "Concluido" aparecia de outro jeito em cada tela.
      return <StatusPill variante="atencao" texto="Pronto" />;
    }
    if (record.termino || record.material_retirado) {
      return <StatusPill estado="Concluído" />;
    }
    return <StatusPill estado="Em Andamento" />;
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
          className="h-12 bg-ok-suave text-ok hover:bg-ok-suave"
          disabled={marcarRetiradoMutation.isPending}
        >
          <CheckCircle className="w-4 h-4 mr-1" />
          Material Retirado
        </Button>
      )}
    />
  );

  // ---------------------------------------------------------------------
  // Padrao Lista do prototipo: cabecalho com migalha + titulo 38px + acoes,
  // chips de filtro COM CONTAGEM, busca, tabela em cartao, rodape.
  //
  // Os filtros eram abas (<Tabs>), e nelas nao dava para saber QUANTO tem em
  // cada faixa sem trocar de aba. Agora o chip mostra o numero, contado sobre
  // a lista COMPLETA — contar a pagina visivel daria "3" quando ha 40.
  //
  // A REGRA DE FILTRO NAO MUDOU: e a mesma expressao de `filteredRecords`,
  // inclusive a definicao de "finalizado" (termino E (sala !== Bio OU
  // material_retirado)).
  // ---------------------------------------------------------------------
  const ehFinalizado = (r) => r.termino && (r.sala !== 'Bio' || r.material_retirado);
  const combinaBusca = (r) => {
    const t = searchTerm.toLowerCase();
    if (!t) return true;
    return (r.op?.toLowerCase().includes(t) || r.operador?.toLowerCase().includes(t)
      || r.descricao_produto?.toLowerCase().includes(t) || r.codigo_produto?.toLowerCase().includes(t));
  };
  const naBusca = records.filter(combinaBusca);

  const CHIPS = [
    { valor: 'all', rotulo: 'Em andamento', contagem: naBusca.filter((r) => !ehFinalizado(r)).length },
    { valor: 'bio', rotulo: 'Sala Bio', contagem: naBusca.filter((r) => !ehFinalizado(r) && r.sala === 'Bio').length },
    { valor: 'industrial', rotulo: 'Sala Industrial', contagem: naBusca.filter((r) => !ehFinalizado(r) && r.sala === 'Industrial').length },
    { valor: 'finalizados', rotulo: 'Finalizados', contagem: naBusca.filter(ehFinalizado).length },
  ];

  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <PageHeader
          migalha={[{ rotulo: 'Envase' }, { rotulo: 'Registros' }]}
          titulo="Todos os registros"
          legenda="Acompanhe e gerencie os lançamentos de envase"
          acoes={
            <Link to={createPageUrl('NovoRegistro')}>
              <Button size="lg">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Novo registro
              </Button>
            </Link>
          }
        />

        <ListaCard
          chips={
            <ChipsFiltro
              rotulo="Filtrar registros"
              opcoes={CHIPS}
              valor={selectedFilter}
              aoEscolher={setSelectedFilter}
            />
          }
          busca={searchTerm}
          aoBuscar={setSearchTerm}
          placeholderBusca="OP, operador ou produto"
          rotuloBusca="Buscar registros"
          rodape={lista.total > 0 ? <RodapeDaLista {...lista} substantivo="registros" /> : null}
        >
          {/* Celular: cartao por registro. A tabela tem 8 colunas; no celular
              as acoes ficavam fora da tela. */}
          {ehCelular && (
          <div className="divide-y divide-borda">
            {isLoading ? (
              <EmptyState carregando />
            ) : lista.total === 0 ? (
              <EmptyState
                icone={List}
                titulo="Nenhum registro encontrado"
                legenda="Ajuste o filtro ou lance um registro novo."
                acao={
                  <Link to={createPageUrl('NovoRegistro')}>
                    <Button><Plus className="h-4 w-4" aria-hidden="true" />Novo registro</Button>
                  </Link>
                }
              />
            ) : lista.pagina.map((record) => (
              <div key={record.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="codigo font-bold text-tinta">{record.op}</p>
                    <p className="text-sm font-semibold text-texto-fraco">{formatarData(record.data)}</p>
                  </div>
                  {status(record)}
                </div>
                <p className="font-semibold text-tinta">{record.descricao_produto}</p>
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-texto-fraco">
                  <Badge variant="secondary">{record.sala}</Badge>
                  <span>{record.operador}</span>
                  <span className="num font-bold text-tinta">
                    {record.quantidade_produzida?.toLocaleString('pt-BR')}
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
                <TableRow className="bg-cartao-fraco">
                  <TableHead>Data</TableHead>
                  <TableHead>OP</TableHead>
                  <TableHead>Sala</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8}><EmptyState carregando /></TableCell>
                  </TableRow>
                ) : lista.total === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <EmptyState
                        icone={List}
                        titulo="Nenhum registro encontrado"
                        legenda="Ajuste o filtro ou lance um registro novo."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  lista.pagina.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-semibold">{formatarData(record.data)}</TableCell>
                      <TableCell className="codigo">{record.op}</TableCell>
                      <TableCell>
                        <Badge variant={record.sala === 'Bio' ? 'ok' : 'secondary'} ponto={false}>
                          {record.sala}
                        </Badge>
                      </TableCell>
                      <TableCell>{record.operador}</TableCell>
                      <TableCell className="max-w-xs truncate">{record.descricao_produto}</TableCell>
                      <TableCell className="num font-bold">
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
        </ListaCard>
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
