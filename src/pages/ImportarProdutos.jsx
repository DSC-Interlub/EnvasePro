import React, { useState, useEffect } from "react"; // Added useEffect
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
import { Badge } from "@/components/ui/badge";

export default function ImportarProdutos() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [produtosText, setProdutosText] = useState("");
  const [produtosParsed, setProdutosParsed] = useState([]);
  const [error, setError] = useState(null);

  // Set document title to reflect the page and system name
  useEffect(() => {
    document.title = "Importar Produtos - Operações Interlub";
  }, []);

  const parseProdutos = () => {
    setError(null);
    const lines = produtosText.trim().split('\n');
    const parsed = [];
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Formato esperado: Código [TAB] Nome [TAB] Unidade [TAB] Consistência [TAB] NSF 3H [TAB] NSF H1 [TAB] HALAL [TAB] KOSHER
      const parts = line.split('\t');
      
      // We expect at least 4 parts (codigo, nome, unidade_medida, consistencia)
      // The classifications (NSF 3H, NSF H1, HALAL, KOSHER) are optional and can be empty.
      if (parts.length >= 4) {
        const [codigo, nome, unidade_medida, consistencia, nsf_3h, nsf_h1, halal, kosher, categoria] = parts;
        const categoriaVal = categoria?.trim();
        
        parsed.push({
          codigo: codigo.trim(),
          nome: nome.trim(),
          unidade_medida: unidade_medida.trim(),
          consistencia: consistencia.trim(),
          nsf_3h: nsf_3h?.trim().toUpperCase() === 'X',
          nsf_h1: nsf_h1?.trim().toUpperCase() === 'X',
          halal: halal?.trim().toUpperCase() === 'X',
          kosher: kosher?.trim().toUpperCase() === 'X',
          ...(['Graxa', 'Óleo', 'Pasta'].includes(categoriaVal) && { categoria: categoriaVal })
        });
      }
    }
    
    if (parsed.length === 0) {
      setError("Nenhum produto válido encontrado. Verifique o formato dos dados colados.");
      return;
    }
    
    setProdutosParsed(parsed);
  };

  const createProdutosMutation = useMutation({
    mutationFn: async (produtos) => {
      await base44.entities.Product.bulkCreate(produtos);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setTimeout(() => {
        navigate(createPageUrl("Produtos"));
      }, 1500);
    },
    onError: (error) => {
      setError("Erro ao importar produtos. Tente novamente.");
    }
  });

  const handleSubmit = () => {
    if (produtosParsed.length === 0) {
      setError("Adicione pelo menos um produto para importar.");
      return;
    }
    
    createProdutosMutation.mutate(produtosParsed);
  };

  const removeProduto = (index) => {
    setProdutosParsed(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button aria-label="Voltar"
            variant="outline"
            size="icon"
            onClick={() => navigate(createPageUrl("Produtos"))}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-tinta">Importar Produtos</h1>
            <p className="text-texto-fraco mt-1">Cole a lista de produtos do Excel</p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {createProdutosMutation.isSuccess && (
          <Alert className="bg-ok-suave border-ok">
            <CheckCircle className="h-4 w-4 text-ok" />
            <AlertDescription className="text-ok">
              <strong>{produtosParsed.length} produtos</strong> importados com sucesso! Redirecionando...
            </AlertDescription>
          </Alert>
        )}

        {/* Instruções */}
        <Card className="border-marca-suave-2 bg-marca-suave">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-marca" />
              Como Importar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-tinta-media">
              <p className="font-semibold">Copie as colunas do Excel e cole no campo abaixo:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Coluna A:</strong> Código do Item</li>
                <li><strong>Coluna B:</strong> Descrição do Item</li>
                <li><strong>Coluna C:</strong> Unidade de Medida</li>
                <li><strong>Coluna D:</strong> Consistência</li>
                <li><strong>Coluna E:</strong> NSF 3H (X se tiver, vazio se não)</li>
                <li><strong>Coluna F:</strong> NSF H1 (X se tiver, vazio se não)</li>
                <li><strong>Coluna G:</strong> HALAL (X se tiver, vazio se não)</li>
                <li><strong>Coluna H:</strong> KOSHER (X se tiver, vazio se não)</li>
                <li><strong>Coluna I:</strong> Categoria (Graxa, Óleo ou Pasta — opcional)</li>
              </ul>
              <p className="mt-3 text-texto-fraco">
                <strong>Exemplo do que colar:</strong><br />
                <code className="text-xs bg-cartao px-2 py-1 rounded block mt-1">
                  ALIPLEX 0	ALIPLEX 0	L	2		X	X	X<br />
                  BIO CLEANER	BIO CLEANER	L	2	X	X	X	X
                </code>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Campo para colar */}
        <Card className="border-borda shadow-cartao">
          <CardHeader className="border-b border-borda">
            <CardTitle>Cole a lista de produtos</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="produtos">Dados dos Produtos</Label>
              <Textarea
                id="produtos"
                value={produtosText}
                onChange={(e) => setProdutosText(e.target.value)}
                placeholder="ALIPLEX 0	ALIPLEX 0	L	2		X	X	X
BIO CLEANER	BIO CLEANER	L	2	X	X	X	X"
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-texto-fraco">
                Cole os dados copiados do Excel. As colunas devem estar separadas por TAB.
              </p>
            </div>

            <Button
              type="button"
              onClick={parseProdutos}
              variant="outline"
              className="w-full"
              disabled={!produtosText.trim()}
            >
              <Upload className="w-4 h-4 mr-2" />
              Processar Produtos
            </Button>
          </CardContent>
        </Card>

        {/* Lista de Produtos Processados */}
        {produtosParsed.length > 0 && (
          <Card className="border-borda shadow-cartao">
            <CardHeader className="border-b border-borda">
              <CardTitle className="text-xl font-bold text-tinta">
                Produtos Importados ({produtosParsed.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {produtosParsed.map((produto, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-fundo rounded-token border border-borda"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-texto-fraco">Código</p>
                          <p className="font-mono font-semibold text-tinta">{produto.codigo}</p>
                        </div>
                        <div>
                          <p className="text-xs text-texto-fraco">Nome</p>
                          <p className="font-semibold text-tinta">{produto.nome}</p>
                        </div>
                        <div>
                          <p className="text-xs text-texto-fraco">Unidade</p>
                          <p className="text-tinta-media">{produto.unidade_medida}</p>
                        </div>
                        <div>
                          <p className="text-xs text-texto-fraco">Consistência</p>
                          <p className="text-tinta-media">{produto.consistencia}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {produto.categoria && (
                          <Badge className={
                            produto.categoria === 'Graxa' ? 'bg-atencao-suave text-atencao text-xs font-medium' :
                            produto.categoria === 'Óleo' ? 'bg-marca-suave text-marca text-xs font-medium' :
                            'bg-ok-suave text-ok text-xs font-medium'
                          }>{produto.categoria}</Badge>
                        )}
                        {produto.nsf_3h && (
                          <Badge className="bg-marca-suave text-marca text-xs font-medium">NSF 3H</Badge>
                        )}
                        {produto.nsf_h1 && (
                          <Badge className="bg-ok-suave text-ok text-xs font-medium">NSF H1</Badge>
                        )}
                        {produto.halal && (
                          <Badge className="bg-purple-100 text-purple-800 text-xs font-medium">HALAL</Badge>
                        )}
                        {produto.kosher && (
                          <Badge className="bg-fundo text-tinta text-xs font-medium">KOSHER</Badge>
                        )}
                      </div>
                    </div>
                    <Button aria-label="Excluir"
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeProduto(index)}
                      className="text-erro hover:text-erro hover:bg-erro-suave"
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
        {produtosParsed.length > 0 && (
          <Button
            onClick={handleSubmit}
            className="w-full bg-marca hover:bg-marca-forte"
            size="lg"
            disabled={createProdutosMutation.isPending}
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {createProdutosMutation.isPending ? "Importando..." : `Importar ${produtosParsed.length} Produtos`}
          </Button>
        )}
      </div>
    </div>
  );
}