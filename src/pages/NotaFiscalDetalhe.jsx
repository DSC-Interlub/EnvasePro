import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Camera, ImagePlus, Trash2, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function NotaFiscalDetalhe() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef();
  const cameraRef = useRef();
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get("id");

  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: nf, isLoading } = useQuery({
    queryKey: ["nf-detalhe", id],
    queryFn: () => base44.entities.NotaFiscalArquivo.get(id),
    enabled: !!id,
  });

  const handleUpload = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const file = files[0];
    const { file_url } = await base44.integrations.Core.UploadFile({ file, bucket: 'notas-fiscais' });
    await base44.entities.NotaFiscalArquivo.update(id, {
      arquivo_url: file_url,
      arquivo_nome: file.name,
    });
    queryClient.invalidateQueries({ queryKey: ["nf-detalhe", id] });
    queryClient.invalidateQueries({ queryKey: ["notas-fiscais"] });
    setUploading(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    await base44.entities.NotaFiscalArquivo.delete(id);
    queryClient.invalidateQueries({ queryKey: ["notas-fiscais"] });
    navigate("/NotasFiscais");
  };

  const fmtDate = (d) => d ? format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";

  if (isLoading) return (
    <div className="p-6 flex justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  );

  if (!nf) return (
    <div className="p-6 text-center text-slate-400">
      Nota fiscal não encontrada.
      <Button variant="link" onClick={() => navigate("/NotasFiscais")}>Voltar</Button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/NotasFiscais")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold text-slate-900">NF {nf.numero_nf}</h1>
      </div>

      {/* Info */}
      <Card>
        <CardContent className="p-5 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Número</span>
            <span className="font-mono font-bold text-blue-700">{nf.numero_nf}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Arquivado em</span>
            <span>{fmtDate(nf.created_date)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Por</span>
            <span>{nf.arquivado_por_nome || "—"}</span>
          </div>
          {nf.observacoes && (
            <div className="flex justify-between">
              <span className="text-slate-500">Obs</span>
              <span className="text-right max-w-xs">{nf.observacoes}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Arquivo */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <p className="text-sm font-medium text-slate-700">Arquivo / Foto</p>
          {nf.arquivo_url ? (
            <div className="space-y-3">
              <img src={nf.arquivo_url} alt="NF" className="w-full rounded-xl border object-contain max-h-80" />
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => window.open(nf.arquivo_url, "_blank")}>
                  <ExternalLink className="w-3 h-3" /> Abrir original
                </Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => inputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />} Substituir
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 flex-wrap">
              <Button variant="outline" className="gap-2 flex-1" onClick={() => inputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                Galeria
              </Button>
              <Button variant="outline" className="gap-2 flex-1" onClick={() => cameraRef.current?.click()} disabled={uploading}>
                <Camera className="w-4 h-4" /> Câmera
              </Button>
            </div>
          )}

          <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={e => { handleUpload(e.target.files); e.target.value = ""; }} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => { handleUpload(e.target.files); e.target.value = ""; }} />
        </CardContent>
      </Card>

      {/* Excluir */}
      <div className="pt-2">
        {!confirmDelete ? (
          <Button variant="outline" className="text-red-500 border-red-200 hover:bg-red-50 gap-1 w-full" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-4 h-4" /> Excluir registro
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700 gap-1" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Confirmar exclusão
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}