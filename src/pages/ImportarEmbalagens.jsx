import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Upload, CheckCircle, AlertCircle, FileSpreadsheet, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ImportarEmbalagens() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [embalagensText, setEmbalagensText] = useState("");
  const [embalagensParsed, setEmbalagensParsed] = useState([]);
  const [error, setError] = useState(null);

  const parseEmbalagens = () => {
    setError(null);
    const lines = embalagensText.trim().split('\n');
    const parsed = [];
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Formato esperado: Código [TAB] Descrição [TAB] Conteúdo [TAB] Tipo [TAB] Conteúdo Ext
      const parts = line.split('\t');
      
      if (parts.length >= 4) {
        const [codigo, descricao, conteudo, tipo, conteudo_ext = ""] = parts;
        
        // Converter vírgula em ponto para números decimais
        const conteudoNumerico = parseFloat(conteudo.trim().replace(',', '.')) || 0;
        
        parsed.push({
          codigo: codigo.trim(),
          descricao: descricao.trim(),
          conteudo: conteudoNumerico,
          tipo: tipo.trim(),
          conteudo_ext: conteudo_ext.trim(),
          ultimos_4_digitos: codigo.trim().slice(-4)
        });
      }
    }
    
    if (parsed.length === 0) {
      setError("Nenhuma embalagem válida encontrada. Verifique o formato dos dados colados.");
      return;
    }
    
    setEmbalagensParsed(parsed);
  };

  const createEmbalagensMutation = useMutation({
    mutationFn: async (embalagens) => {
      await base44.entities.Embalagem.bulkCreate(embalagens);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embalagens'] });
      setTimeout(() => {
        navigate(createPageUrl("Embalagens"));
      }, 1500);
    },
    onError: (error) => {
      setError("Erro ao importar embalagens. Tente novamente.");
    }
  });

  const handleSubmit = () => {
    if (embalagensParsed.length === 0) {
      setError("Adicione pelo menos uma embalagem para importar.");
      return;
    }
    
    createEmbalagensMutation.mutate(embalagensParsed);
  };

  const removeEmbalagem = (index) => {
    setEmbalagensParsed(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(createPageUrl("Embalagens"))}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Importar Embalagens</h1>
            <p className="text-slate-600 mt-1">Cole a lista de embalagens do Excel</p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {createEmbalagensMutation.isSuccess && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <strong>{embalagensParsed.length} embalagens</strong> importadas com sucesso! Redirecionando...
            </AlertDescription>
          </Alert>
        )}

        {/* Instruções */}
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              Como Importar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-slate-700">
              <p className="font-semibold">Copie as colunas do Excel e cole no campo abaixo:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Coluna A:</strong> Código da Embalagem</li>
                <li><strong>Coluna B:</strong> Descrição</li>
                <li><strong>Coluna C:</strong> Conteúdo (número)</li>
                <li><strong>Coluna D:</strong> Tipo</li>
                <li><strong>Coluna E:</strong> Conteúdo Externo (opcional)</li>
              </ul>
              <p className="mt-3 text-slate-600">
                <strong>Exemplo do que colar:</strong><br />
                <code className="text-xs bg-white px-2 py-1 rounded">
                  EMB001	Pote 500ml	500	Pote	Info adicional<br />
                  EMB002	Frasco 1L	1000	Frasco	<br />
                  EMB003	Bisnaga 0,5L	0,5	Bisnaga	Pequena
                </code>
              </p>
              <p className="mt-2 text-amber-700 font-medium">
                <strong>Importante:</strong> Use vírgula (,) ou ponto (.) para números decimais. Ex: 0,5 ou 0.5
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Campo para colar */}
        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="border-b border-slate-100">
            <CardTitle>Cole a lista de embalagens</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="embalagens">Dados das Embalagens</Label>
              <Textarea
                id="embalagens"
                value={embalagensText}
                onChange={(e) => setEmbalagensText(e.target.value)}
                placeholder="EMB001	Pote 500ml	500	Pote	Info adicional
EMB002	Frasco 1L	1000	Frasco	
EMB003	Bisnaga 0,5L	0,5	Bisnaga	Pequena"
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-slate-500">
                Cole os dados copiados do Excel. As colunas devem estar separadas por TAB.
              </p>
            </div>

            <Button
              type="button"
              onClick={parseEmbalagens}
              variant="outline"
              className="w-full"
              disabled={!embalagensText.trim()}
            >
              <Upload className="w-4 h-4 mr-2" />
              Processar Embalagens
            </Button>
          </CardContent>
        </Card>

        {/* Lista de Embalagens Processadas */}
        {embalagensParsed.length > 0 && (
          <Card className="border-slate-200 shadow-lg">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-xl font-bold text-slate-900">
                Embalagens Importadas ({embalagensParsed.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {embalagensParsed.map((embalagem, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200"
                  >
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-6 gap-4">
                      <div>
                        <p className="text-xs text-slate-500">Código</p>
                        <p className="font-mono font-semibold text-slate-900">{embalagem.codigo}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Descrição</p>
                        <p className="font-semibold text-slate-900">{embalagem.descricao}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Conteúdo</p>
                        <p className="text-slate-700">{embalagem.conteudo}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Tipo</p>
                        <p className="text-slate-700">{embalagem.tipo}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Conteúdo Ext</p>
                        <p className="text-slate-700">{embalagem.conteudo_ext || "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">4 Dígitos</p>
                        <p className="font-mono text-slate-700">{embalagem.ultimos_4_digitos}</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEmbalagem(index)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Botão Importar */}
        {embalagensParsed.length > 0 && (
          <Button
            onClick={handleSubmit}
            className="w-full bg-blue-600 hover:bg-blue-700"
            size="lg"
            disabled={createEmbalagensMutation.isPending}
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {createEmbalagensMutation.isPending ? "Importando..." : `Importar ${embalagensParsed.length} Embalagens`}
          </Button>
        )}
      </div>
    </div>
  );
}