import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SelectOperador from "@/components/operadores/SelectOperador";
import { ArrowLeft, Upload, Trash2, Plus, Search } from "lucide-react";
import { format } from "date-fns";

function parseLinhas(texto) {
  const rows = texto.trim().split("\n").filter(r => r.trim());
  return rows.map(row => {
    const parts = row.split("\t");
    return {
      numero_item: parts[1]?.trim() || "",
      descricao_produto: parts[2]?.trim() || "",
      lote: parts[3]?.trim() || "",
      deposito: parts[4]?.trim() || "",
      rua_torre: parts[5]?.trim() || "",
      quantidade: parseFloat(parts[6]?.trim()) || 0,
      tipo_linha: "Normal",
      status: "Pendente",
    };
  }).filter(l => l.numero_item || l.descricao_produto);
}

export default function NovaEmpilhaProgramacao() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dataProgramada, setDataProgramada] = useState(format(new Date(), "yyyy-MM-dd"));
  const [empilhadeiraId, setEmpilhadeiraId] = useState("");
  const [criadoPor, setCriadoPor] = useState(null); // { id, nome } escolhido na lista
  const [observacoes, setObservacoes] = useState("");
  const [rawText, setRawText] = useState("");
  const [linhas, setLinhas] = useState([]);
  const [novaLinha, setNovaLinha] = useState({ numero_item: "", descricao_produto: "", deposito: "", rua_torre: "", quantidade: 0, lote: "", tipo_linha: "Normal" });

  const { data: empilhadeiras } = useQuery({
    queryKey: ["empilhadeiras-config"],
    queryFn: () => base44.entities.EmpilhadeiraConfig.list(),
    initialData: [],
  });

  const ativas = empilhadeiras.filter(e => e.ativa);

  const criarMutation = useMutation({
    mutationFn: async () => {
      const prog = await base44.entities.EmpilhaProgramacao.create({
        data_programada: dataProgramada,
        empilhadeira_id: empilhadeiraId,
        status: "Pendente",
        total_linhas: linhas.length,
        linhas_concluidas: 0,
        observacoes,
        criado_por: criadoPor?.nome || null,
        criado_por_id: criadoPor?.id || null,
      });

      if (linhas.length > 0) {
        await base44.entities.EmpilhaLinha.bulkCreate(
          linhas.map(l => ({ ...l, programacao_id: prog.id }))
        );
      }

      return prog;
    },
    onSuccess: (prog) => {
      queryClient.invalidateQueries({ queryKey: ["empilha-programacoes"] });
      navigate(createPageUrl(`ExecutarEmpilha?id=${prog.id}`));
    },
  });

  const handleProcessar = () => {
    setLinhas(parseLinhas(rawText));
  };

  const handleRemoverLinha = (idx) => setLinhas(prev => prev.filter((_, i) => i !== idx));

  const handleAdicionarManual = () => {
    if (!novaLinha.descricao_produto && !novaLinha.numero_item) return;
    setLinhas(prev => [...prev, { ...novaLinha, status: "Pendente" }]);
    setNovaLinha({ numero_item: "", descricao_produto: "", deposito: "", rua_torre: "", quantidade: 0, lote: "", tipo_linha: "Normal" });
  };

  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        <div className="flex items-center gap-4">
          <Button aria-label="Voltar" variant="outline" size="icon" onClick={() => navigate(createPageUrl("Empilhadeira"))}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-tinta">Nova Programação de Empilhadeira</h1>
            <p className="text-texto-fraco text-sm">Configure a empilhadeira, data e importe as linhas</p>
          </div>
        </div>

        {/* Dados da programação */}
        <Card className="border-borda shadow-cartao">
          <CardHeader className="border-b border-borda">
            <CardTitle>Dados da Programação</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Empilhadeira *</Label>
                <Select value={empilhadeiraId} onValueChange={setEmpilhadeiraId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a empilhadeira" />
                  </SelectTrigger>
                  <SelectContent>
                    {ativas.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.nome}{e.marca ? ` — ${e.marca}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {ativas.length === 0 && (
                  <p className="text-xs text-erro">Nenhuma empilhadeira ativa cadastrada. Cadastre em Config. Empilhadeira.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Data Programada *</Label>
                <Input aria-label="Data Programada" type="date" value={dataProgramada} onChange={e => setDataProgramada(e.target.value)} />
              </div>
              <SelectOperador
                id="empilha-criado-por"
                rotulo="Criado por (Líder/Supervisor)"
                placeholder="Selecione o líder"
                valor={criadoPor?.id}
                aoEscolher={setCriadoPor}
              />
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Observações gerais..." rows={2} />
            </div>
          </CardContent>
        </Card>

        {/* Importação Excel */}
        <Card className="border-borda shadow-cartao">
          <CardHeader className="border-b border-borda">
            <CardTitle className="text-lg">Importar via Excel (colar dados)</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-texto-fraco">
              Formato: <code className="bg-fundo px-1 rounded">Data picking | Nº Item | Descrição | Lote | Depósito | Rua/Torre | Quantidade | Operador | Líder</code>
            </p>
            <Textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder={"01/01/2025\tIVP072696220\tGRAXA MOBILUX EP 0\tLT001\tERM\tR02-T01\t50\tJoão\tMaria"}
              rows={8}
              className="font-mono text-sm"
            />
            <Button onClick={handleProcessar} disabled={!rawText.trim()} className="bg-marca hover:bg-marca-forte">
              <Search className="w-4 h-4 mr-2" /> Processar Lista
            </Button>
          </CardContent>
        </Card>

        {/* Adicionar linha manual */}
        <Card className="border-borda shadow-cartao">
          <CardHeader className="border-b border-borda">
            <CardTitle className="text-lg">Adicionar Linha Manualmente</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nº Item</Label>
                <Input value={novaLinha.numero_item} onChange={e => setNovaLinha(p => ({ ...p, numero_item: e.target.value }))} placeholder="IVP072696..." />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Descrição do Produto</Label>
                <Input value={novaLinha.descricao_produto} onChange={e => setNovaLinha(p => ({ ...p, descricao_produto: e.target.value }))} placeholder="Ex: GRAXA MOBILUX EP 0" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Lote</Label>
                <Input value={novaLinha.lote} onChange={e => setNovaLinha(p => ({ ...p, lote: e.target.value }))} placeholder="LT001" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Depósito</Label>
                <Input value={novaLinha.deposito} onChange={e => setNovaLinha(p => ({ ...p, deposito: e.target.value }))} placeholder="ERM, EPB, EPI" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rua/Torre</Label>
                <Input value={novaLinha.rua_torre} onChange={e => setNovaLinha(p => ({ ...p, rua_torre: e.target.value }))} placeholder="R02-T01" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantidade</Label>
                <Input aria-label="Quantidade" type="number" value={novaLinha.quantidade} onChange={e => setNovaLinha(p => ({ ...p, quantidade: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={novaLinha.tipo_linha} onValueChange={v => setNovaLinha(p => ({ ...p, tipo_linha: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Crítico">Crítico</SelectItem>
                    <SelectItem value="Avulso">Avulso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button variant="outline" onClick={handleAdicionarManual}>
              <Plus className="w-4 h-4 mr-2" /> Adicionar à Lista
            </Button>
          </CardContent>
        </Card>

        {/* Preview */}
        {linhas.length > 0 && (
          <Card className="border-borda shadow-cartao">
            <CardHeader className="border-b border-borda">
              <CardTitle className="text-lg">Preview — {linhas.length} linhas</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-fundo sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium text-texto-fraco">#</th>
                      <th className="text-left p-3 font-medium text-texto-fraco">Tipo</th>
                      <th className="text-left p-3 font-medium text-texto-fraco">Item</th>
                      <th className="text-left p-3 font-medium text-texto-fraco">Descrição</th>
                      <th className="text-left p-3 font-medium text-texto-fraco">Depósito</th>
                      <th className="text-left p-3 font-medium text-texto-fraco">Rua/Torre</th>
                      <th className="text-left p-3 font-medium text-texto-fraco">Qtd</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l, i) => (
                      <tr key={i} className={`border-t border-borda ${l.tipo_linha === "Crítico" ? "bg-erro-suave" : l.tipo_linha === "Avulso" ? "bg-atencao-suave" : ""}`}>
                        <td className="p-3 text-texto-apagado text-xs">{i + 1}</td>
                        <td className="p-3">
                          {l.tipo_linha !== "Normal" && (
                            <Badge className={l.tipo_linha === "Crítico" ? "bg-erro-suave text-erro text-xs" : "bg-atencao-suave text-atencao text-xs"}>
                              {l.tipo_linha}
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 font-mono text-xs">{l.numero_item || "—"}</td>
                        <td className="p-3 font-medium">{l.descricao_produto || "—"}</td>
                        <td className="p-3 text-texto-fraco">{l.deposito || "—"}</td>
                        <td className="p-3 text-texto-fraco">{l.rua_torre || "—"}</td>
                        <td className="p-3">{l.quantidade}</td>
                        <td className="p-3">
                          <Button aria-label="Excluir" variant="ghost" size="icon" onClick={() => handleRemoverLinha(i)}>
                            <Trash2 className="w-4 h-4 text-erro" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Button
          onClick={() => criarMutation.mutate()}
          disabled={!dataProgramada || !empilhadeiraId || criarMutation.isPending}
          className="w-full bg-atencao hover:bg-atencao text-white text-lg py-6"
        >
          <Upload className="w-5 h-5 mr-2" />
          {criarMutation.isPending ? "Criando..." : `Criar Programação${linhas.length > 0 ? ` com ${linhas.length} ${linhas.length === 1 ? "linha" : "linhas"}` : ""}`}
        </Button>

        {!empilhadeiraId && (
          <p className="text-center text-sm text-erro">Selecione uma empilhadeira para continuar</p>
        )}
      </div>
    </div>
  );
}