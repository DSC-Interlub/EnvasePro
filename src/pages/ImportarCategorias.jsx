import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, CheckCircle, AlertCircle, Search, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const CHUNK_SIZE = 50;

export default function ImportarCategorias() {
  const [rawText, setRawText] = useState("");
  const [matches, setMatches] = useState(null);
  const [done, setDone] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [updateError, setUpdateError] = useState(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => base44.entities.Product.list(),
    initialData: [],
  });

  const handleProcess = () => {
    const lines = rawText.trim().split('\n').filter(l => l.trim());
    const parsed = lines.map(line => {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const codigo = parts[0].trim();
        const categoria = parts[parts.length - 1].trim();
        return { codigo, categoria };
      }
      return null;
    }).filter(Boolean).filter(p => ['Graxa', 'Óleo', 'Pasta'].includes(p.categoria));

    const result = parsed.map(({ codigo, categoria }) => {
      const product = products.find(p => p.codigo?.trim() === codigo);
      return { codigo, categoria, product };
    });

    setMatches(result);
    setDone(false);
    setUpdateError(null);
  };

  const handleConfirm = async () => {
    const found = matches?.filter(m => m.product) ?? [];
    if (found.length === 0) return;

    setIsUpdating(true);
    setUpdateError(null);
    setProgress({ done: 0, total: found.length });

    const updates = found.map(m => ({ id: m.product.id, categoria: m.categoria }));

    // Dividir em chunks e chamar a função por partes
    let totalSuccess = 0;
    let totalErrors = 0;

    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      try {
        const response = await base44.functions.invoke('atualizarCategorias', { updates: chunk });
        totalSuccess += response.data.success ?? 0;
        totalErrors += response.data.errors ?? 0;
      } catch (err) {
        totalErrors += chunk.length;
      }
      setProgress({ done: Math.min(i + CHUNK_SIZE, updates.length), total: updates.length });
    }

    setIsUpdating(false);

    if (totalErrors > 0) {
      setUpdateError(`${totalSuccess} atualizados com sucesso, ${totalErrors} falharam.`);
    } else {
      setDone(true);
    }
  };

  const found = matches?.filter(m => m.product) ?? [];
  const notFound = matches?.filter(m => !m.product) ?? [];
  const invalidCat = matches?.filter(m => !['Graxa', 'Óleo', 'Pasta'].includes(m.categoria)) ?? [];
  const catColor = {
    Graxa: "bg-atencao-suave text-atencao",
    Óleo: "bg-marca-suave text-marca",
    Pasta: "bg-ok-suave text-ok"
  };

  if (done) {
    return (
      <div className="min-h-screen bg-fundo p-4 md:p-8 flex items-center justify-center">
        <Card className="border-ok bg-ok-suave max-w-md w-full">
          <CardContent className="p-8 text-center">
            <CheckCircle className="w-16 h-16 text-ok mx-auto mb-4" />
            <h2 className="text-2xl font-black text-ok mb-2">Categorias atualizadas!</h2>
            <p className="text-ok mb-6">{found.length} produtos foram atualizados com sucesso.</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => { setDone(false); setMatches(null); setRawText(""); }} variant="outline">
                Nova Importação
              </Button>
              <Link to={createPageUrl("Produtos")}>
                <Button className="bg-ok hover:bg-ok">Ver Produtos</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl("Produtos")}>
            <Button aria-label="Voltar" variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-tinta">Importar Categorias em Massa</h1>
            <p className="text-texto-fraco text-sm">Cole a lista (Código TAB Categoria) para atualizar todos os produtos de uma vez</p>
          </div>
        </div>

        {/* Input */}
        <Card className="border-borda shadow-cartao">
          <CardHeader className="border-b border-borda">
            <CardTitle className="text-lg">Cole a lista aqui</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-texto-fraco">
              Formato: <code className="bg-fundo px-1 rounded">CÓDIGO[TAB]Graxa</code> ou <code className="bg-fundo px-1 rounded">Óleo</code> ou <code className="bg-fundo px-1 rounded">Pasta</code> — uma por linha.
              Copie diretamente da planilha Excel (coluna Código + coluna Categoria).
            </p>
            <Textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder={"12345\tGraxa\n67890\tÓleo\n11223\tPasta"}
              rows={10}
              className="font-mono text-sm"
            />
            <Button
              onClick={handleProcess}
              disabled={!rawText.trim() || isLoading}
              className="bg-marca hover:bg-marca-forte"
            >
              <Search className="w-4 h-4 mr-2" />
              {isLoading ? "Carregando produtos..." : `Processar Lista (${products.length} produtos no banco)`}
            </Button>
          </CardContent>
        </Card>

        {/* Resultados */}
        {matches && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Card className="border-ok bg-ok-suave">
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle className="w-8 h-8 text-ok" />
                  <div>
                    <p className="text-2xl font-black text-ok">{found.length}</p>
                    <p className="text-sm text-ok">produtos encontrados</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-atencao bg-atencao-suave">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertCircle className="w-8 h-8 text-atencao" />
                  <div>
                    <p className="text-2xl font-black text-atencao">{notFound.length}</p>
                    <p className="text-sm text-atencao">não encontrados</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {found.length > 0 && (
              <Card className="border-borda shadow-cartao">
                <CardHeader className="border-b border-borda">
                  <CardTitle className="text-base">✅ Serão atualizados ({found.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-4 max-h-72 overflow-y-auto">
                  <div className="space-y-1">
                    {found.map((m, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-borda last:border-0">
                        <div>
                          <span className="font-mono text-xs text-texto-fraco mr-2">{m.product.codigo}</span>
                          <span className="font-medium text-tinta-media">{m.product.nome}</span>
                        </div>
                        <Badge className={catColor[m.categoria]}>{m.categoria}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {notFound.length > 0 && (
              <Card className="border-atencao">
                <CardHeader className="border-b border-atencao">
                  <CardTitle className="text-base text-atencao">⚠️ Não encontrados ({notFound.length}) — serão ignorados</CardTitle>
                </CardHeader>
                <CardContent className="p-4 max-h-48 overflow-y-auto">
                  <div className="flex flex-wrap gap-2">
                    {notFound.map((m, i) => (
                      <Badge key={i} variant="outline" className="text-atencao border-atencao">{m.codigo}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {updateError && (
              <Card className="border-erro bg-erro-suave">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-erro" />
                  <p className="text-erro text-sm">{updateError}</p>
                </CardContent>
              </Card>
            )}

            {found.length > 0 && (
              <Button
                onClick={handleConfirm}
                disabled={isUpdating}
                className="w-full bg-ok hover:bg-ok text-white text-lg py-6"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Atualizando... {progress.done}/{progress.total} produtos
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 mr-2" />
                    Confirmar e Atualizar {found.length} Produtos
                  </>
                )}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}