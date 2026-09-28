import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Camera, ImagePlus, X, Upload, CheckCircle2, Loader2 } from "lucide-react";

// Um item de lote: { id, file, preview, numero_nf, status: 'pendente'|'enviando'|'ok'|'erro' }
function criarItem(file) {
  return {
    id: Math.random().toString(36).slice(2),
    file,
    preview: URL.createObjectURL(file),
    numero_nf: "",
    status: "pendente",
  };
}

export default function NovaNotaFiscal() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const inputGaleriaRef = useRef();
  const inputCameraRef = useRef();

  const [itens, setItens] = useState([]);
  const [salvando, setSalvando] = useState(false);

  const adicionarArquivos = (files) => {
    const novos = Array.from(files).map(criarItem);
    setItens(prev => [...prev, ...novos]);
  };

  const remover = (id) => {
    setItens(prev => prev.filter(i => i.id !== id));
  };

  const atualizarNumero = (id, valor) => {
    setItens(prev => prev.map(i => i.id === id ? { ...i, numero_nf: valor } : i));
  };

  const salvarTodos = async () => {
    const pendentes = itens.filter(i => i.status === "pendente" || i.status === "erro");
    if (pendentes.some(i => !i.numero_nf.trim())) {
      alert("Preencha o número da NF em todos os itens antes de salvar.");
      return;
    }
    setSalvando(true);
    for (const item of pendentes) {
      setItens(prev => prev.map(i => i.id === item.id ? { ...i, status: "enviando" } : i));
      try {
        let arquivo_url = "";
        let arquivo_nome = item.file.name;
        // Upload do arquivo para bucket notas-fiscais (privado)
        const { file_url } = await base44.integrations.Core.UploadFile({ file: item.file, bucket: 'notas-fiscais' });
        arquivo_url = file_url;

        await base44.entities.NotaFiscalArquivo.create({
          numero_nf: item.numero_nf.trim(),
          arquivo_url,
          arquivo_nome,
          arquivado_por_nome: user?.full_name || "",
        });
        setItens(prev => prev.map(i => i.id === item.id ? { ...i, status: "ok" } : i));
      } catch (err) {
        setItens(prev => prev.map(i => i.id === item.id ? { ...i, status: "erro" } : i));
      }
    }
    setSalvando(false);
  };

  // Sem arquivo: permite salvar só número
  const salvarSemArquivo = async () => {
    const numeros = itens.filter(i => i.status === "pendente" || i.status === "erro");
    setSalvando(true);
    for (const item of numeros) {
      if (!item.numero_nf.trim()) continue;
      setItens(prev => prev.map(i => i.id === item.id ? { ...i, status: "enviando" } : i));
      try {
        await base44.entities.NotaFiscalArquivo.create({
          numero_nf: item.numero_nf.trim(),
          arquivo_url: item.arquivo_url || "",
          arquivo_nome: item.arquivo_nome || "",
          arquivado_por_nome: user?.full_name || "",
        });
        setItens(prev => prev.map(i => i.id === item.id ? { ...i, status: "ok" } : i));
      } catch {
        setItens(prev => prev.map(i => i.id === item.id ? { ...i, status: "erro" } : i));
      }
    }
    setSalvando(false);
  };

  const todosOk = itens.length > 0 && itens.every(i => i.status === "ok");
  const temPendente = itens.some(i => i.status === "pendente" || i.status === "erro");

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/NotasFiscais")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold text-slate-900">Arquivar Notas Fiscais</h1>
      </div>

      {/* Botões de upload */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <p className="text-sm text-slate-600 font-medium">Selecione as fotos das NFs</p>
          <div className="flex gap-3 flex-wrap">
            <Button
              variant="outline"
              className="gap-2 flex-1"
              onClick={() => inputGaleriaRef.current?.click()}
            >
              <ImagePlus className="w-4 h-4" /> Escolher da Galeria
            </Button>
            <Button
              variant="outline"
              className="gap-2 flex-1"
              onClick={() => inputCameraRef.current?.click()}
            >
              <Camera className="w-4 h-4" /> Tirar Foto
            </Button>
          </div>
          <p className="text-xs text-slate-400">Você pode selecionar várias fotos de uma vez da galeria.</p>

          {/* inputs escondidos */}
          <input
            ref={inputGaleriaRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={e => { adicionarArquivos(e.target.files); e.target.value = ""; }}
          />
          <input
            ref={inputCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { adicionarArquivos(e.target.files); e.target.value = ""; }}
          />
        </CardContent>
      </Card>

      {/* Lista de itens */}
      {itens.length > 0 && (
        <div className="space-y-3">
          {itens.map((item) => (
            <Card key={item.id} className={`border ${item.status === "ok" ? "border-green-300 bg-green-50" : item.status === "erro" ? "border-red-300 bg-red-50" : "border-slate-200"}`}>
              <CardContent className="p-4 flex gap-3 items-start">
                {/* Preview */}
                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                  {item.preview && (
                    <img src={item.preview} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                {/* Campo número */}
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-slate-500 font-medium">Número da NF</label>
                  <Input
                    value={item.numero_nf}
                    onChange={e => atualizarNumero(item.id, e.target.value)}
                    placeholder="Ex: 123456"
                    disabled={item.status === "ok" || item.status === "enviando"}
                    className="h-9"
                  />
                  <p className="text-xs text-slate-400 truncate">{item.file.name}</p>
                </div>
                {/* Status / remover */}
                <div className="flex-shrink-0 flex items-center">
                  {item.status === "ok" && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                  {item.status === "enviando" && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                  {item.status === "erro" && <span className="text-xs text-red-500">Erro</span>}
                  {(item.status === "pendente" || item.status === "erro") && (
                    <Button variant="ghost" size="icon" className="w-7 h-7 ml-1" onClick={() => remover(item.id)}>
                      <X className="w-4 h-4 text-slate-400" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Ações */}
          <div className="flex gap-3 pt-1">
            {todosOk ? (
              <Button className="flex-1 bg-green-600 hover:bg-green-700 gap-2" onClick={() => navigate("/NotasFiscais")}>
                <CheckCircle2 className="w-4 h-4" /> Concluído — Ver arquivo
              </Button>
            ) : (
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2"
                disabled={salvando || !temPendente}
                onClick={salvarTodos}
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Salvar {itens.filter(i => i.status === "pendente" || i.status === "erro").length} NF(s)
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Se quiser arquivar só número sem foto */}
      {itens.length === 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm text-slate-600 font-medium">Ou arquive apenas pelo número (sem foto)</p>
            <SemFotoForm user={user} onSalvo={() => navigate("/NotasFiscais")} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SemFotoForm({ user, onSalvo }) {
  const [numero, setNumero] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);

  const salvar = async () => {
    if (!numero.trim()) return;
    setSalvando(true);
    await base44.entities.NotaFiscalArquivo.create({
      numero_nf: numero.trim(),
      arquivado_por_nome: user?.full_name || "",
    });
    setSalvando(false);
    setOk(true);
    setTimeout(onSalvo, 800);
  };

  return (
    <div className="flex gap-2">
      <Input
        value={numero}
        onChange={e => setNumero(e.target.value)}
        placeholder="Número da NF"
        onKeyDown={e => e.key === "Enter" && salvar()}
        disabled={salvando || ok}
      />
      <Button onClick={salvar} disabled={salvando || ok || !numero.trim()} className="gap-1 bg-blue-600 hover:bg-blue-700">
        {ok ? <CheckCircle2 className="w-4 h-4" /> : salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
      </Button>
    </div>
  );
}