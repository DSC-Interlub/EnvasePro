import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Square } from "lucide-react";

function parseSapDate(str) {
  if (!str) return undefined;
  const clean = str.trim();
  // dd/MM/yyyy ou dd.MM.yyyy
  const m1 = clean.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
  return undefined;
}

function parseSapNumber(str) {
  if (!str) return 0;
  const s = str.toString().trim();
  if (!s || s === "0") return 0;
  // Remove pontos de milhar, troca vírgula decimal
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

// Novo formato de colunas (tab-separated):
// [0]=Nº doc  [1]=Cód. fornecedor  [2]=Fornecedor  [3]=Data de Chegada
// [4]=Código do Item  [5]=Produto  [6]=Quantidade  [7]=Item para Recebimento

const CABECALHOS = new Set([
  "nº doc", "nº doc.", "numero_documento", "selecionar"
]);

function parseLines(raw) {
  return raw
    .split("\n")
    .map(l => l.split("\t"))
    .filter(cols => {
      if (cols.length < 4) return false;
      const numDoc = cols[0]?.trim().toLowerCase();
      if (!numDoc || CABECALHOS.has(numDoc)) return false;
      if (!/^\d+$/.test(numDoc)) return false;
      return true;
    })
    .map(cols => {
      const dataChegada = parseSapDate(cols[3]);
      const codigoItem = cols[4]?.trim() || "";
      const produto = cols[5]?.trim() || "";
      const quantidadeRaw = cols[6]?.trim() || "0";
      const quantidade = parseSapNumber(quantidadeRaw);
      const itemParaRecebimento = cols[7]?.trim() || "";
      return {
        numero_documento: cols[0]?.trim() || "",
        codigo_fornecedor: cols[1]?.trim() || "",
        nome_fornecedor: cols[2]?.trim() || "",
        data_chegada: dataChegada,
        data_vencimento: dataChegada, // compatibilidade checklist
        codigo_item: codigoItem,
        produto: produto,
        quantidade: quantidade,
        item_para_recebimento: itemParaRecebimento,
      };
    });
}

export default function ModalImportarSAP({ open, onClose }) {
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState(null);
  const [selected, setSelected] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);

  const { data: existentes = [] } = useQuery({
    queryKey: ["sap-pedidos-all"],
    queryFn: () => base44.entities.SapPedido.list(),
    enabled: open,
  });

  // Mapa de dedup: chave = numero_documento + "|" + codigo_item
  const existentesMap = {};
  existentes.forEach(e => {
    const key = `${e.numero_documento}|${e.codigo_item || ""}`;
    existentesMap[key] = e;
  });

  const handleProcessar = () => {
    const rows = parseLines(raw);
    const filtered = rows.filter(r => r.numero_documento && r.numero_documento !== "Nº doc");
    setParsed(filtered);
    setSelected(filtered.map((_, i) => i));
    setResultado(null);
  };

  const toggleRow = (i) => {
    setSelected(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  };

  const handleConfirmar = async () => {
    if (!parsed) return;
    setLoading(true);

    const selRows = parsed.filter((_, i) => selected.includes(i));

    // Separar novos vs atualizar baseado na chave composta
    const novos = [];
    const paraAtualizar = [];

    const norm = (v) => (v ?? "").toString().trim();

    selRows.forEach(row => {
      const key = `${row.numero_documento}|${row.codigo_item || ""}`;
      const ex = existentesMap[key];
      if (!ex) {
        novos.push({ ...row, ativo: true });
      } else {
        // Verificar se algo mudou
        const mudou =
          norm(ex.nome_fornecedor) !== norm(row.nome_fornecedor) ||
          norm(ex.codigo_fornecedor) !== norm(row.codigo_fornecedor) ||
          norm(ex.data_chegada) !== norm(row.data_chegada) ||
          norm(ex.produto) !== norm(row.produto) ||
          norm(ex.codigo_item) !== norm(row.codigo_item) ||
          (ex.quantidade || 0) !== row.quantidade;
        if (mudou) paraAtualizar.push({ ...row, id: ex.id });
      }
    });

    // Criar novos
    if (novos.length > 0) {
      await base44.entities.SapPedido.bulkCreate(novos);
    }

    // Atualizar
    if (paraAtualizar.length > 0) {
      await base44.entities.SapPedido.bulkUpdate(paraAtualizar);
    }

    queryClient.invalidateQueries({ queryKey: ["sap-pedidos-all"] });
    queryClient.invalidateQueries({ queryKey: ["sap-pedidos"] });
    queryClient.invalidateQueries({ queryKey: ["importacoes-tv"] });
    setResultado({
      criados: novos.length,
      atualizados: paraAtualizar.length,
      ignorados: selRows.length - novos.length - paraAtualizar.length,
    });
    setLoading(false);
  };

  const handleClose = () => {
    setRaw(""); setParsed(null); setSelected([]); setResultado(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Base SAP</DialogTitle>
        </DialogHeader>

        {!parsed && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Cole abaixo os dados copiados da nova consulta SAP. O sistema extrai: <strong>Nº doc, Cód. fornecedor, Fornecedor, Data de Chegada, Código do Item, Produto, Quantidade e Item para Recebimento</strong>.
            </p>
            <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded border">
              Cole diretamente do relatório SAP (Ctrl+A → Ctrl+C).<br />
              Registros com o mesmo Nº doc + Código do Item serão atualizados. Linhas sem item (fornecedores não-FOR000002) ficam uma por documento.
            </p>
            <Textarea
              value={raw}
              onChange={e => setRaw(e.target.value)}
              placeholder="Cole aqui os dados do SAP..."
              className="min-h-[200px] font-mono text-xs"
            />
          </div>
        )}

        {parsed && !resultado && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">{parsed.length} registros encontrados</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setSelected(parsed.map((_, i) => i))}>Selecionar todos</Button>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setSelected([])}>Desmarcar todos</Button>
              </div>
            </div>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-1.5 text-left w-8"></th>
                    <th className="px-2 py-1.5 text-left">Nº doc.</th>
                    <th className="px-2 py-1.5 text-left">Fornecedor</th>
                    <th className="px-2 py-1.5 text-left">Data Chegada</th>
                    <th className="px-2 py-1.5 text-left">Cód. Item</th>
                    <th className="px-2 py-1.5 text-left">Produto</th>
                    <th className="px-2 py-1.5 text-right">Qtd</th>
                    <th className="px-2 py-1.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((row, i) => {
                    const key = `${row.numero_documento}|${row.codigo_item || ""}`;
                    const existe = !!existentesMap[key];
                    return (
                      <tr key={i} className={`border-t hover:bg-slate-50 cursor-pointer ${selected.includes(i) ? "" : "opacity-40"}`} onClick={() => toggleRow(i)}>
                        <td className="px-2 py-1.5">
                          {selected.includes(i) ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5 text-slate-400" />}
                        </td>
                        <td className="px-2 py-1.5 font-mono">{row.numero_documento}</td>
                        <td className="px-2 py-1.5 max-w-[150px] truncate">{row.nome_fornecedor}</td>
                        <td className="px-2 py-1.5">{row.data_chegada || "—"}</td>
                        <td className="px-2 py-1.5 font-mono text-[10px]">{row.codigo_item || "—"}</td>
                        <td className="px-2 py-1.5 max-w-[180px] truncate">{row.produto || "—"}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{row.quantidade > 0 ? row.quantidade.toLocaleString('pt-BR') : "—"}</td>
                        <td className="px-2 py-1.5">
                          <Badge className={existe ? "bg-orange-100 text-orange-700 text-[10px]" : "bg-green-100 text-green-700 text-[10px]"}>
                            {existe ? "Atualizar" : "Novo"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {resultado && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center space-y-1">
            <p className="text-green-800 font-semibold">Importação concluída!</p>
            <p className="text-sm text-green-700">
              {resultado.criados} criados · {resultado.atualizados} atualizados · {resultado.ignorados} já existiam (sem alteração)
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Fechar</Button>
          {!parsed && <Button onClick={handleProcessar} disabled={!raw.trim()}>Processar</Button>}
          {parsed && !resultado && (
            <Button onClick={handleConfirmar} disabled={loading || selected.length === 0} className="bg-blue-600 hover:bg-blue-700">
              {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Importando {selected.length} registros...
            </span>
          ) : `Confirmar importação (${selected.length})`}
            </Button>
          )}
          {resultado && <Button onClick={() => { setParsed(null); setRaw(""); setSelected([]); setResultado(null); }}>Nova importação</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}