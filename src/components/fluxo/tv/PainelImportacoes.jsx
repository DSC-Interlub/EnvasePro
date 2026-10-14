import React from "react";
import CartaoVidro from "./CartaoVidro";
import NumeroTV from "./NumeroTV";
import ListaTV from "./ListaTV";
import { formatarData, diaLocal } from "@/lib/datas";

/**
 * Importações (SAP) como quarto painel da TV.
 *
 * O cartão antigo tinha 224 linhas e mostrava texto de 12px num cartão de
 * 300px de largura — ilegível a 4 metros. Aqui o conteúdo é o mesmo, na
 * gramática de vidro: dois números grandes e a lista das próximas chegadas.
 *
 * A LÓGICA DE AGRUPAMENTO É A MESMA do cartão antigo, e isso é de propósito:
 *
 *  - agrupa por `numero_documento`, somando os itens;
 *  - considera só o fornecedor `FOR000002`, que é o filtro que o cartão
 *    original aplicava (é o fornecedor das importações);
 *  - usa `data_chegada`, caindo para `data_vencimento` quando a primeira
 *    falta — era assim antes.
 *
 * Nenhuma regra mudou; só a apresentação.
 */

/** Mantido igual ao cartão antigo. Se o fornecedor mudar, muda aqui. */
const FORNECEDOR_IMPORTACAO = "FOR000002";

export function agruparImportacoes(pedidos = []) {
  const porDoc = {};
  for (const r of pedidos) {
    if (!r.numero_documento) continue;
    if (!porDoc[r.numero_documento]) {
      porDoc[r.numero_documento] = {
        numero_documento: r.numero_documento,
        codigo_fornecedor: r.codigo_fornecedor,
        fornecedor: r.nome_fornecedor || r.fornecedor || null,
        itens: 0,
        data_chegada: r.data_chegada || r.data_vencimento || null,
      };
    }
    const g = porDoc[r.numero_documento];
    g.itens += 1;
    if (!g.data_chegada && (r.data_chegada || r.data_vencimento)) {
      g.data_chegada = r.data_chegada || r.data_vencimento;
    }
  }

  const docs = Object.values(porDoc)
    .filter((d) => d.codigo_fornecedor === FORNECEDOR_IMPORTACAO)
    .filter((d) => d.data_chegada);

  const hoje = diaLocal();
  const proximas = docs
    .filter((d) => d.data_chegada >= hoje)
    .sort((a, b) => a.data_chegada.localeCompare(b.data_chegada));

  const mes = hoje.slice(0, 7);
  const noMes = docs.filter((d) => d.data_chegada.startsWith(mes));

  return { docs, proximas, noMes, hoje };
}

export default function PainelImportacoes({ pedidos = [], carregando = false }) {
  const { proximas, noMes, hoje } = agruparImportacoes(pedidos);
  const aChegar = proximas.length;
  const proxima = proximas[0];

  const diasAte = proxima
    ? Math.round((new Date(proxima.data_chegada + "T12:00:00") - new Date(hoje + "T12:00:00")) / 86400000)
    : null;

  return (
    <>
      <div
        className="grid min-h-0 flex-1 lg:grid-cols-[1.25fr_1fr_1fr]"
        style={{ gap: "clamp(14px, 1.5vw, 28px)" }}
      >
        <CartaoVidro
          // Vazio, o conteudo centraliza: com justify-between o texto "nenhuma
          // chegada" ficava colado no rodape do cartao, parecendo erro.
          className={`flex-col ${proxima ? "justify-between" : "justify-center"}`}
          style={{ padding: "clamp(18px, 2.5vw, 48px)" }}
        >
          <div className="font-bold text-texto-fraco" style={{ fontSize: "clamp(15px, 1.56vw, 30px)" }}>
            Próxima chegada
          </div>
          {proxima ? (
            <>
              <div
                className="num font-extrabold leading-[.95] text-tinta"
                style={{ fontSize: "clamp(44px, 7.8vw, 150px)", letterSpacing: "-.04em" }}
              >
                {formatarData(proxima.data_chegada, "dd/MM")}
              </div>
              <div className="min-w-0">
                <div
                  className="codigo truncate font-extrabold text-tinta"
                  style={{ fontSize: "clamp(16px, 1.56vw, 30px)" }}
                >
                  {proxima.numero_documento}
                </div>
                <div
                  className="font-semibold text-tinta-media"
                  style={{ fontSize: "clamp(13px, 1.35vw, 26px)" }}
                >
                  {proxima.itens} {proxima.itens === 1 ? "item" : "itens"}
                  {diasAte === 0 ? " · chega hoje"
                    : diasAte === 1 ? " · chega amanhã"
                    : diasAte != null ? ` · em ${diasAte} dias` : ""}
                </div>
              </div>
            </>
          ) : (
            <div
              className="font-bold text-texto-fraco"
              style={{ fontSize: "clamp(16px, 1.56vw, 30px)" }}
            >
              Nenhuma chegada prevista
            </div>
          )}
        </CartaoVidro>

        <NumeroTV
          rotulo="A chegar"
          valor={aChegar}
          pilula={aChegar > 0 ? "documentos com data" : "nada previsto"}
          atraso={0.15}
        />
        <NumeroTV
          rotulo="No mês"
          valor={noMes.length}
          pilula={`${noMes.reduce((s, d) => s + d.itens, 0)} itens`}
          atraso={0.3}
        />
      </div>

      {proximas.length > 0 && (
        <CartaoVidro atraso={0.35} className="min-h-0 flex-1 overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto" style={{ padding: "clamp(14px, 1.5vw, 28px)" }}>
            <ListaTV
              titulo="Próximas importações"
              contagem={`${proximas.length} documento(s)`}
              carregando={carregando}
              vazio="Nenhuma importação prevista"
              itens={proximas.slice(0, 8).map((d) => ({
                id: d.numero_documento,
                tom: d.data_chegada === hoje ? "ok" : "neutro",
                principal: d.numero_documento,
                secundario: `${d.itens} ${d.itens === 1 ? "item" : "itens"}${d.fornecedor ? ` · ${d.fornecedor}` : ""}`,
                direita: formatarData(d.data_chegada, "dd/MM"),
                direitaLegenda: "chegada",
              }))}
            />
          </div>
        </CartaoVidro>
      )}
    </>
  );
}
