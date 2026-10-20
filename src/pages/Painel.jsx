import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { usePainelTV } from "@/components/fluxo/tv";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  PageHeader, StatCard, SectionCard, SegmentoPeriodo, ListaAcoes, CartaoAoVivo, EmptyState,
} from "@/components/fluxo";
import {
  Package, ShoppingCart, Warehouse, Truck, ClipboardCheck, FileText,
  AlertTriangle, Factory, Sparkles, Boxes,
} from "lucide-react";
import { corNome } from "@/lib/checklist";

/* ── helpers ── */
function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * Tempo decorrido desde um "HH:mm" de hoje.
 *
 * Devolve string vazia quando não dá para calcular, e não "0:00": um cronômetro
 * parado em zero parece operação que acabou de começar, quando na verdade é
 * dado faltando.
 */
function calcElapsed(startTime) {
  if (!startTime) return "";
  const clean = String(startTime).slice(0, 5);
  const [h, m] = clean.split(":");
  if (h == null || m == null) return "";
  const inicio = new Date();
  inicio.setHours(Number(h), Number(m), 0, 0);
  const diff = Date.now() - inicio.getTime();
  if (diff < 0) return "";
  const horas = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${horas}:${String(mins).padStart(2, "0")}`;
}


/**
 * PAINEL GERAL — padrão "Painel" do protótipo.
 *
 * O que mudou de estrutura, e por quê:
 *
 *  - Os indicadores do DIA e os da SEMANA eram dois blocos empilhados, com
 *    quatorze números visíveis ao mesmo tempo e um título em maiúsculas em
 *    cada um. Agora é um período de cada vez, escolhido no controle segmentado.
 *  - NÃO existe "Mês". As consultas desta tela trazem no máximo 100 registros
 *    (`list("-data", 100)`), então um total mensal sairia truncado e errado sem
 *    avisar. Mês entra quando os indicadores forem calculados no banco.
 *  - As pendências eram cinco cartões desenhados mesmo valendo zero. Viraram
 *    uma lista onde só entra o que tem contagem, em ordem de urgência.
 *  - Os quatro cartões "ao vivo" eram quatro funções de ~45 linhas desenhando a
 *    mesma coisa. Viraram quatro chamadas de `CartaoAoVivo`.
 *
 * As consultas, os filtros e as contas NÃO mudaram.
 */
export default function Painel() {
  const { user } = useAuth();
  const role = user?.role === "user" ? "operator" : (user?.role || "operator");
  const isAdmin = role === "admin";
  const now = useNow();
  // O painel inteiro vem pronto do banco — public.painel_geral() (Etapa 2).
  // Antes eram 16 consultas, cada uma com teto (100, 50, 30 ou 10 linhas), e
  // "semana" e pendências eram contadas DENTRO desses tetos: com ~150 envases
  // por semana, os números saíam truncados sem aviso. Se a função ainda não
  // existir no banco, o adaptador calcula o mesmo painel no navegador
  // (src/lib/painelGeral.js). Pausa com a aba oculta, como antes.
  const { painel: dados, atualizacao } = usePainelTV("geral", () => base44.functions.painelGeral(), { pausarOculto: true });

  // Só para a FOTO. Muda raramente e a URL assinada vale 24 h.
  const { data: operators = [] } = useQuery({
    queryKey: ["painel-operators"], queryFn: () => base44.entities.Operator.list(), refetchInterval: 30 * 60000,
  });

  const loading = !dados;
  // Pelo id primeiro: o nome falha com homônimos (CLAUDE.md §6).
  const getPhoto = (id, nome) =>
    (operators.find((op) => op.id === id) || operators.find((op) => op.nome === nome))?.foto_url || null;

  const H = dados?.hoje ?? {};
  const S = dados?.semana ?? {};
  const P = dados?.pendencias ?? {};
  const V = dados?.ao_vivo ?? {};
  const n = (x) => Number(x) || 0;

  const totalAssinaturas = n(P.assinaturas);
  const totalOcorrencias = n(P.ocorrencias);
  const limpezasAtrasadas = n(P.limpezas_atrasadas);
  const alertasManut = n(P.manutencao);
  const checklistsReprovHoje = n(P.checklists_reprovados_hoje);
  const nfsPendentes3dias = n(P.nfs_sem_arquivo_3dias);
  const notaMedia = H.nota_media ?? null;
  const notaMediaSemana = S.nota_media ?? null;

  const diaSemanaCapit = (() => { const s = format(now, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR }); return s.charAt(0).toUpperCase() + s.slice(1); })();
  /* ── Período dos indicadores ───────────────────────────────────────────── */
  const [periodo, setPeriodo] = useState("hoje");

  /** O `corNome` do checklist devolve nome de cor; o StatCard fala em tom. */
  const tomDaNota = (nota) => {
    if (nota === null || nota === undefined) return "neutro";
    const cor = corNome(nota);
    return cor === "green" ? "ok" : cor === "red" ? "erro" : "atencao";
  };

  const INDICADORES = periodo === "hoje"
    ? [
        {
          rotulo: "Envases hoje", valor: n(H.envases), destaque: true, icone: Factory,
          legenda: `${n(H.envases_concluidos)} concluídos`,
        },
        {
          rotulo: "Produção hoje", valor: n(H.producao).toLocaleString("pt-BR"), icone: Package,
          legenda: "unidades",
        },
        {
          rotulo: "Checklists", valor: n(H.checklists), icone: ClipboardCheck,
          tom: tomDaNota(notaMedia),
          legenda: notaMedia !== null ? `nota média ${notaMedia}` : "nenhum hoje",
        },
        {
          rotulo: "Limpeza hoje", icone: Sparkles,
          valor: `${n(H.limpezas_concluidas)}/${n(H.limpezas)}`,
          tom: limpezasAtrasadas > 0 ? "erro" : "ok",
          legenda: limpezasAtrasadas > 0 ? `${limpezasAtrasadas} atrasada(s)` : "em dia",
        },
      ]
    : [
        {
          rotulo: "Envases na semana", valor: n(S.envases), destaque: true, icone: Factory,
          legenda: `${n(S.producao).toLocaleString("pt-BR")} un.`,
        },
        { rotulo: "Check-outs concluídos", valor: n(S.checkouts_concluidos), icone: ShoppingCart },
        { rotulo: "Linhas movimentadas", valor: n(S.linhas_movimentadas), icone: Warehouse },
        { rotulo: "Recebimentos", valor: n(S.recebimentos), icone: Truck },
        {
          rotulo: "Checklists", valor: n(S.checklists), icone: ClipboardCheck,
          tom: tomDaNota(notaMediaSemana),
          legenda: notaMediaSemana !== null ? `nota média ${notaMediaSemana}` : "—",
        },
        {
          // Correção 3 da migration: só segunda a domingo. Antes entravam as
          // limpezas programadas para as semanas seguintes.
          rotulo: "Limpezas realizadas", icone: Sparkles,
          valor: `${n(S.limpezas_concluidas)}/${n(S.limpezas)}`,
          legenda: n(S.limpezas) > 0
            ? `${Math.round((n(S.limpezas_concluidas) / n(S.limpezas)) * 100)}% concluído`
            : "nada programado",
        },
        { rotulo: "NFs arquivadas", valor: n(S.nfs), icone: FileText },
      ];

  /* ── "Precisa de você": a MESMA regra dos cartões de alerta anteriores ─── */
  const PENDENCIAS = [
    { rotulo: "Assinaturas do líder pendentes", contagem: totalAssinaturas, url: "/Empilhadeira", tom: "atencao" },
    { rotulo: "Ocorrências em aberto", contagem: totalOcorrencias, url: "/Empilhadeira", tom: "erro" },
    { rotulo: "Limpezas atrasadas", contagem: limpezasAtrasadas, url: "/Dashboard", tom: "erro" },
    { rotulo: "Checklists reprovados hoje", contagem: checklistsReprovHoje, url: "/ChecklistRecebimento", tom: "erro" },
    { rotulo: "NFs sem foto há mais de 3 dias", contagem: nfsPendentes3dias, url: "/NotasFiscais", tom: "atencao" },
    { rotulo: "Manutenção de empilhadeira próxima", contagem: alertasManut, url: "/Empilhadeira", tom: "atencao" },
  ];

  /* ── Cartões ao vivo: só o mapeamento dos dados muda entre eles ────────── */
  const envaseAtivos = (V.envase?.itens ?? []).map((r) => ({
    id: r.id,
    operador: r.operador,
    foto: getPhoto(r.operator_id, r.operador),
    principal: r.descricao_produto || "Produto não especificado",
    secundario: `${r.operador} · Sala ${r.sala}`,
    direita: calcElapsed(r.inicio),
    direitaLegenda: n(r.quantidade_produzida) > 0 ? `${n(r.quantidade_produzida)} un.` : null,
  }));

  const checkoutCriticos = n(V.checkout?.criticos);
  const checkoutAtivos = (V.checkout?.itens ?? []).map((i) => ({
    id: i.id,
    operador: i.operador,
    foto: getPhoto(i.operator_id, i.operador),
    tom: i.critico ? "erro" : "neutro",
    principal: i.numero_pedido,
    marcas: i.critico ? [{ texto: "CRÍTICO", tom: "erro" }] : [],
    secundario: [i.cliente, i.operador].filter(Boolean).join(" · "),
    direita: calcElapsed(i.hora_inicio),
    direitaLegenda: i.data_entrega
      ? `entrega ${format(new Date(i.data_entrega + "T00:00:00"), "dd/MM")}` : null,
  }));

  const paradaAberta = V.empilha?.parada ?? null;
  // Correção 6: `numero_linha` e `descricao` não existem em empilha_linhas —
  // todo cartão dizia só "Linha". O item e o produto são numero_item e
  // descricao_produto.
  const empilhaAtivas = (V.empilha?.itens ?? []).map((l) => ({
    id: l.id,
    operador: l.operador_empilhadeira,
    foto: getPhoto(l.operador_empilhadeira_id, l.operador_empilhadeira),
    tom: l.tipo_linha === "Crítico" ? "erro" : "neutro",
    principal: l.numero_item ? `Item ${l.numero_item}` : (l.descricao_produto || l.codigo_produto || "Linha"),
    marcas: l.tipo_linha === "Crítico" ? [{ texto: "CRÍTICO", tom: "erro" }] : [],
    secundario: [l.descricao_produto, l.operador_empilhadeira].filter(Boolean).join(" · "),
    direita: calcElapsed(l.hora_inicio),
  }));

  // Correção 5: o participante é `operator_nome` (a tela lia `operador_nome`,
  // que não existe, e o nome nunca aparecia). A hora de início é a de
  // Brasília — antes saía do texto UTC, três horas adiantada.
  const horaLocal = (iso) => (iso ? format(new Date(iso), "HH:mm") : null);
  const recebimentoAtivos = (V.recebimento?.itens ?? []).map((r) => {
    const marcas = [{ texto: r.tipo, tom: "neutro" }];
    if (r.prioridade === "Urgente") marcas.push({ texto: "URGENTE", tom: "erro" });
    if (r.prioridade === "Alta") marcas.push({ texto: "ALTA", tom: "atencao" });
    return {
      id: r.id,
      operador: r.primeiro?.nome,
      foto: getPhoto(r.primeiro?.id, r.primeiro?.nome),
      principal: r.numero_documento,
      marcas,
      // Correção 5 de verdade: o participante aparece ESCRITO. Antes só a
      // inicial dele ia na foto, e o teste só passava quando o mesmo nome
      // aparecia em outro cartão da página.
      secundario: [r.fornecedor_nome, r.primeiro?.nome, r.participantes ? `${r.participantes} participante(s)` : null]
        .filter(Boolean).join(" · "),
      direita: calcElapsed(horaLocal(r.datetime_inicio)),
    };
  });

  // Correção 4: as pílulas "N ativo(s)" mostram o TOTAL, não o que coube nos
  // 4 cartões.
  const totalAtivos = {
    envase: n(V.envase?.total), checkout: n(V.checkout?.total),
    empilha: n(V.empilha?.total), recebimento: n(V.recebimento?.total),
  };

  const ocorrenciasAbertas = dados?.ocorrencias ?? [];

  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="mx-auto flex min-w-0 max-w-[1500px] flex-col gap-4">
        <PageHeader
          aoVivo
          migalha={[{ rotulo: "Acompanhar" }, { rotulo: "Painel geral" }]}
          titulo="Painel geral"
          legenda={
            atualizacao.falhou ? (
              <span role="status" data-tv-atualizacao="falhou" className="text-erro">
                Sem atualizar{atualizacao.em ? ` desde ${format(atualizacao.em, "HH:mm")}` : ""} · verifique a rede
              </span>
            ) : (
              <span data-tv-atualizacao={atualizacao.em ? "ok" : undefined}>
                {diaSemanaCapit}{atualizacao.em ? ` · atualizado às ${format(atualizacao.em, "HH:mm")}` : ""}
              </span>
            )
          }
          acoes={
            <>
              {/* O relógio fica: este painel costuma ficar aberto numa tela de
                  parede, e saber a hora do dado importa tanto quanto o dado. */}
              <span className="num flex min-h-[48px] items-center rounded-full bg-cartao px-4
                               text-xl font-extrabold text-tinta shadow-cartao">
                {format(now, "HH:mm:ss")}
              </span>
              <SegmentoPeriodo
                opcoes={[{ valor: "hoje", rotulo: "Hoje" }, { valor: "semana", rotulo: "Semana" }]}
                valor={periodo}
                aoEscolher={setPeriodo}
              />
            </>
          }
        />

        {/* INDICADORES ---------------------------------------------------- */}
        {loading ? (
          <div className="cartao-fluxo"><EmptyState carregando /></div>
        ) : (
          <div className="grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
            {INDICADORES.map((k, i) => (
              <StatCard key={k.rotulo} {...k} atraso={0.05 + i * 0.05} />
            ))}
          </div>
        )}

        {/* ACONTECENDO AGORA ---------------------------------------------- */}
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <CartaoAoVivo
            titulo="Envase em andamento"
            icone={Factory}
            url="/NovoRegistro"
            itens={envaseAtivos}
            vazio="Nenhum envase em andamento"
            pilula={{ texto: `${totalAtivos.envase} ativo(s)` }}
            atraso={0.1}
          />
          <CartaoAoVivo
            titulo="Check-out em andamento"
            icone={ShoppingCart}
            url="/Checkout"
            itens={checkoutAtivos}
            vazio="Nenhum check-out em andamento"
            pilula={checkoutCriticos > 0
              ? { texto: `${checkoutCriticos} crítico(s)`, tom: "erro" }
              : { texto: `${totalAtivos.checkout} ativo(s)` }}
            atraso={0.15}
          />
          <CartaoAoVivo
            titulo="Empilhadeira"
            icone={Warehouse}
            url="/Empilhadeira"
            itens={empilhaAtivas}
            vazio="Empilhadeira disponível"
            aviso={paradaAberta ? `Parada: ${paradaAberta.tipo} desde ${paradaAberta.hora_inicio}` : null}
            pilula={paradaAberta
              ? { texto: "parada", tom: "erro" }
              : { texto: `${totalAtivos.empilha} ativo(s)` }}
            atraso={0.2}
          />
          <CartaoAoVivo
            titulo="Recebimento em andamento"
            icone={Truck}
            url="/Recebimento"
            itens={recebimentoAtivos}
            vazio="Nenhum recebimento em andamento"
            pilula={{ texto: `${totalAtivos.recebimento} ativo(s)` }}
            atraso={0.25}
          />
        </div>

        {/* PRECISA DE VOCÊ (admin) ---------------------------------------- */}
        {isAdmin && (
          <SectionCard
            titulo="Precisa de você"
            legenda="Em ordem de urgência"
            icone={AlertTriangle}
            atraso={0.3}
          >
            <ListaAcoes itens={PENDENCIAS} vazio="Tudo em dia — nenhuma pendência agora." />
          </SectionCard>
        )}

        {/* OCORRÊNCIAS ----------------------------------------------------- */}
        {ocorrenciasAbertas.length > 0 && (
          <SectionCard
            titulo="Ocorrências em aberto"
            legenda={`${totalOcorrencias} no total`}
            icone={Boxes}
            atraso={0.35}
          >
            <ul className="flex flex-col gap-2">
              {ocorrenciasAbertas.map((o) => (
                <li key={`${o.modulo}-${o.id}`} className="rounded-token bg-atencao-suave px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-cartao px-2 py-0.5 text-[11px] font-extrabold text-atencao">
                      {o.tipo || "Outro"}
                    </span>
                    <span className="rounded-full bg-cartao px-2 py-0.5 text-[11px] font-extrabold text-texto-fraco">
                      {o.modulo}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-tinta">{o.descricao}</p>
                  {o.registrado_por && (
                    <p className="text-xs font-semibold text-texto-fraco">
                      Registrado por {o.registrado_por}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
