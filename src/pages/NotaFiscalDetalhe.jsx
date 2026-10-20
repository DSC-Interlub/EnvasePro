import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Camera, ImagePlus, Trash2, Loader2, CheckCircle2, ExternalLink, FileText } from "lucide-react";
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
  const [erroExclusao, setErroExclusao] = useState(null);
  // Só admin apaga NF (RLS). O botão some para os outros perfis.
  const isAdmin = user?.role === "admin";

  const { data: nf, isLoading } = useQuery({
    queryKey: ["nf-detalhe", id],
    queryFn: async () => {
      const data = await base44.entities.NotaFiscalArquivo.get(id);
      if (data && data.arquivo_url) {
        let path = data.arquivo_url;
        if (path.includes('/notas-fiscais/')) {
          path = path.split('/notas-fiscais/')[1]?.split('?')[0];
        }
        if (path && !path.startsWith('http')) {
          try {
            const signed = await base44.integrations.Core.createSignedUrl('notas-fiscais', path, 3600);
            return { ...data, signed_url: signed, arquivo_path: path };
          } catch (e) {
            console.error('Erro ao gerar URL assinada da NF:', e);
          }
        }
      }
      return data;
    },
    enabled: !!id,
  });

  const handleUpload = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const file = files[0];
    const { file_path } = await base44.integrations.Core.UploadFile({ file, bucket: 'notas-fiscais' });
    await base44.entities.NotaFiscalArquivo.update(id, {
      arquivo_url: file_path, // Salva APENAS o caminho no bucket (retenção 5 anos)
      arquivo_nome: file.name,
    });
    queryClient.invalidateQueries({ queryKey: ["nf-detalhe", id] });
    queryClient.invalidateQueries({ queryKey: ["notas-fiscais"] });
    setUploading(false);
  };

  // O banco recusa a exclusão de quem não é admin SEM erro (o RLS só filtra
  // as linhas). Antes, a tela voltava para a lista como se tivesse excluído.
  // Agora confere se o registro sumiu de fato e, se não sumiu, avisa.
  const handleDelete = async () => {
    setDeleting(true);
    setErroExclusao(null);
    try {
      await base44.entities.NotaFiscalArquivo.delete(id);
      const ainda = await base44.entities.NotaFiscalArquivo.filter({ id });
      if (ainda?.length) {
        setErroExclusao("Não foi possível excluir: somente administradores podem excluir notas fiscais.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["notas-fiscais"] });
      navigate("/NotasFiscais");
    } catch {
      setErroExclusao("Não foi possível excluir. Tente de novo.");
    } finally {
      setDeleting(false);
    }
  };

  const fmtDate = (d) => d ? format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";

  if (isLoading) return (
    <div className="p-6 flex justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-texto-apagado" />
    </div>
  );

  if (!nf) return (
    <div className="p-6 text-center text-texto-apagado">
      Nota fiscal não encontrada.
      <Button variant="link" onClick={() => navigate("/NotasFiscais")}>Voltar</Button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button aria-label="Voltar" variant="ghost" size="icon" onClick={() => navigate("/NotasFiscais")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold text-tinta">NF {nf.numero_nf}</h1>
      </div>

      {/* Info */}
      <Card>
        <CardContent className="p-5 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-texto-fraco">Número</span>
            <span className="font-mono font-bold text-marca">{nf.numero_nf}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-texto-fraco">Arquivado em</span>
            <span>{fmtDate(nf.created_date)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-texto-fraco">Por</span>
            <span>{nf.arquivado_por_nome || "—"}</span>
          </div>
          {nf.observacoes && (
            <div className="flex justify-between">
              <span className="text-texto-fraco">Obs</span>
              <span className="text-right max-w-xs">{nf.observacoes}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Arquivo */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <p className="text-sm font-medium text-tinta-media">Arquivo / Foto</p>
          {nf.signed_url || nf.arquivo_url ? (
            <div className="space-y-3">
              {nf.arquivo_nome?.toLowerCase().endsWith('.pdf') ? (
                <div className="p-6 bg-fundo border rounded-painel flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-marca" />
                    <div>
                      <p className="font-medium text-tinta">{nf.arquivo_nome || "Documento PDF"}</p>
                      <p className="text-xs text-texto-apagado">PDF Arquivado (retenção legal)</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => window.open(nf.signed_url || nf.arquivo_url, "_blank")}>
                    <ExternalLink className="w-4 h-4 mr-1" /> Abrir PDF
                  </Button>
                </div>
              ) : (
                <img src={nf.signed_url || nf.arquivo_url} alt="NF" className="w-full rounded-painel border object-contain max-h-80" />
              )}
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => window.open(nf.signed_url || nf.arquivo_url, "_blank")}>
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

      {/* Excluir — só admin (o RLS também só deixa admin) */}
      {erroExclusao && (
        <p role="alert" className="rounded-token bg-erro-suave px-4 py-3 text-sm font-bold text-erro">{erroExclusao}</p>
      )}
      {isAdmin && (
      <div className="pt-2">
        {!confirmDelete ? (
          <Button variant="outline" className="text-erro border-erro hover:bg-erro-suave gap-1 w-full" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-4 h-4" /> Excluir registro
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            <Button className="flex-1 bg-erro hover:bg-erro gap-1" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Confirmar exclusão
            </Button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}