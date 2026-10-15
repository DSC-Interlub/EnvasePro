import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek } from "date-fns";
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

function useIsVisible() {
  const [visible, setVisible] = useState(() => (typeof document !== "undefined" ? !document.hidden : true));
  useEffect(() => {
    const handleVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);
  return visible;
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
  const isVisible = useIsVisible();

  // Polling consolidado com pausa em aba oculta (document.hidden)
  const pollAtivo = isVisible ? 60000 : false;   // 60s para operações ativas
  const pollLento = isVisible ? 300000 : false;  // 300s (5 min) para cadastros e KPIs lentos

  const hoje = format(now, "yyyy-MM-dd");
  const semanaInicio = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");

  /* ── Queries operacionais ativas (polling a cada 60s, pausa em background) ── */
  const { data: envases = [], isLoading: l1 } = useQuery({ queryKey: ["painel-envases"], queryFn: () => base44.entities.EnvaseRecord.list("-data", 100), refetchInterval: pollAtivo });
  const { data: checkoutItems = [] } = useQuery({ queryKey: ["painel-checkout-items"], queryFn: () => base44.entities.CheckoutItem.list("-created_date", 100), refetchInterval: pollAtivo });
  const { data: checkoutProgs = [] } = useQuery({ queryKey: ["painel-checkout-progs"], queryFn: () => base44.entities.CheckoutProgramacao.list("-data_programada", 10), refetchInterval: pollAtivo });
  const { data: empilhaLinhas = [] } = useQuery({ queryKey: ["painel-empilha-linhas"], queryFn: () => base44.entities.EmpilhaLinha.list("-created_date", 100), refetchInterval: pollAtivo });
  const { data: empilhaParadas = [] } = useQuery({ queryKey: ["painel-empilha-paradas"], queryFn: () => base44.entities.EmpilhadeiraParada.list("-created_date", 30), refetchInterval: pollAtivo });
  const { data: empilhaProgs = [] } = useQuery({ queryKey: ["painel-empilha-progs"], queryFn: () => base44.entities.EmpilhaProgramacao.list("-data_programada", 10), refetchInterval: pollAtivo });
  const { data: recebimentos = [] } = useQuery({ queryKey: ["painel-recebimentos"], queryFn: () => base44.entities.Recebimento.list("-created_date", 50), refetchInterval: pollAtivo });
  const { data: empilhaOcorrencias = [] } = useQuery({ queryKey: ["painel-empilha-ocorr"], queryFn: () => base44.entities.EmpilhaOcorrencia.list("-created_date", 50), refetchInterval: pollAtivo });
  const { data: recOcorrencias = [] } = useQuery({ queryKey: ["painel-rec-ocorr"], queryFn: () => base44.entities.RecebimentoOcorrencia.list("-created_date", 50), refetchInterval: pollAtivo });
  const { data: recebimentoParticipantes = [] } = useQuery({ queryKey: ["painel-rec-participantes"], queryFn: () => base44.entities.RecebimentoParticipante.list("-created_date", 100), refetchInterval: pollAtivo });

  /* ── Queries de cadastros e KPIs lentos (polling a cada 300s, pausa em background) ── */
  const { data: operators = [] } = useQuery({ queryKey: ["painel-operators"], queryFn: () => base44.entities.Operator.list(), refetchInterval: pollLento });
  const { data: checklists = [] } = useQuery({ queryKey: ["painel-checklists"], queryFn: () => base44.entities.ChecklistRecebimento.list("-created_date", 100), refetchInterval: pollLento });
  const { data: limpezas = [] } = useQuery({ queryKey: ["painel-limpezas"], queryFn: () => base44.entities.LimpezaProgramacao.list("-data_prevista", 100), refetchInterval: pollLento });
  const { data: nfs = [] } = useQuery({ queryKey: ["painel-nfs"], queryFn: () => base44.entities.NotaFiscalArquivo.list("-created_date", 50), refetchInterval: pollLento });
  const { data: empilhaConfig = [] } = useQuery({ queryKey: ["painel-empilha-config"], queryFn: () => base44.entities.EmpilhadeiraConfig.list(), refetchInterval: pollLento });

  const loading = l1;

  const getPhoto = (nome) => operators.find(op => op.nome === nome)?.foto_url || null;

  /* ── KPIs ── */
  const checklistsHoje = checklists.filter(c => c.created_date?.startsWith(hoje));
  const notaMedia = checklistsHoje.length > 0 ? Math.round(checklistsHoje.reduce((s, c) => s + (c.nota_final || 0), 0) / checklistsHoje.length) : null;
  const limpezasHoje = limpezas.filter(l => l.data_prevista === hoje);
  const limpezasConclHoje = limpezasHoje.filter(l => l.status === "Concluído");
  const limpezasAtrasadas = limpezas.filter(l => l.data_prevista < hoje && l.status !== "Concluído");
  const nfsHoje = nfs.filter(n => n.created_date?.startsWith(hoje));

  const envasesSemana = envases.filter(e => e.data >= semanaInicio);
  const checkoutSemana = checkoutItems.filter(e => e.status === "Concluído" && e.updated_date >= semanaInicio);
  const empilhaSemana = empilhaLinhas.filter(e => e.status === "Concluído" && e.updated_date >= semanaInicio);
  const recSemana = recebimentos.filter(r => r.created_date >= semanaInicio);
  const checklistsSemana = checklists.filter(c => c.created_date >= semanaInicio);
  const notaMediaSemana = checklistsSemana.length > 0 ? Math.round(checklistsSemana.reduce((s, c) => s + (c.nota_final || 0), 0) / checklistsSemana.length) : null;
  const limpezasSemana = limpezas.filter(l => l.data_prevista >= semanaInicio);
  const limpezasConclSemana = limpezasSemana.filter(l => l.status === "Concluído");
  const nfsSemana = nfs.filter(n => n.created_date >= semanaInicio);

  const assEmpilha = empilhaLinhas.filter(l => l.status === "Concluído" && !l.assinatura_lider).length;
  const assLimpeza = limpezas.filter(l => l.status === "Concluído" && l.assinatura_responsavel && !l.assinatura_lider).length;
  const assRecebimento = recebimentos.filter(r => r.status === "Concluído" && !r.assinatura_lider).length;
  const totalAssinaturas = assEmpilha + assLimpeza + assRecebimento;
  const ocAbertasEmpilha = empilhaOcorrencias.filter(o => !o.resolvido).length;
  const ocAbertasRec = recOcorrencias.filter(o => !o.resolvido).length;
  const totalOcorrencias = ocAbertasEmpilha + ocAbertasRec;
  const alertasManut = empilhaConfig.filter(e => e.data_proxima_manutencao && Math.ceil((new Date(e.data_proxima_manutencao) - now) / (1000 * 60 * 60 * 24)) <= 7).length;
  const checklistsReprovHoje = checklistsHoje.filter(c => (c.nota_final || 0) < 0).length;
  const nfsPendentes3dias = nfs.filter(n => !n.arquivo_url && (now - new Date(n.created_date)) > 3 * 24 * 60 * 60 * 1000).length;
  const temPendencias = totalAssinaturas + alertasManut + limpezasAtrasadas.length + nfsPendentes3dias + checklistsReprovHoje > 0;

  const diaSemanaCapit = (() => { const s = format(now, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR }); return s.charAt(0).toUpperCase() + s.slice(1); })();
  /* ── Período dos indicadores ───────────────────────────────────────────── */
  const [periodo, setPeriodo] = useState("hoje");

  const envasesHoje = envases.filter((e) => e.data === hoje);
  const producaoHoje = envasesHoje.reduce((s, e) => s + (e.quantidade_produzida || 0), 0);
  const producaoSemana = envasesSemana.reduce((s, e) => s + (e.quantidade_produzida || 0), 0);

  /** O `corNome` do checklist devolve nome de cor; o StatCard fala em tom. */
  const tomDaNota = (nota) => {
    if (nota === null || nota === undefined) return "neutro";
    const cor = corNome(nota);
    return cor === "green" ? "ok" : cor === "red" ? "erro" : "atencao";
  };

  const INDICADORES = periodo === "hoje"
    ? [
        {
          rotulo: "Envases hoje", valor: envasesHoje.length, destaque: true, icone: Factory,
          legenda: `${envasesHoje.filter((e) => e.termino).length} concluídos`,
        },
        {
          rotulo: "Produção hoje", valor: producaoHoje.toLocaleString("pt-BR"), icone: Package,
          legenda: "unidades",
        },
        {
          rotulo: "Checklists", valor: checklistsHoje.length, icone: ClipboardCheck,
          tom: tomDaNota(notaMedia),
          legenda: notaMedia !== null ? `nota média ${notaMedia}` : "nenhum hoje",
        },
        {
          rotulo: "Limpeza hoje", icone: Sparkles,
          valor: `${limpezasConclHoje.length}/${limpezasHoje.length}`,
          tom: limpezasAtrasadas.length > 0 ? "erro" : "ok",
          legenda: limpezasAtrasadas.length > 0
            ? `${limpezasAtrasadas.length} atrasada(s)` : "em dia",
        },
      ]
    : [
        {
          rotulo: "Envases na semana", valor: envasesSemana.length, destaque: true, icone: Factory,
          legenda: `${producaoSemana.toLocaleString("pt-BR")} un.`,
        },
        { rotulo: "Check-outs concluídos", valor: checkoutSemana.length, icone: ShoppingCart },
        { rotulo: "Linhas movimentadas", valor: empilhaSemana.length, icone: Warehouse },
        { rotulo: "Recebimentos", valor: recSemana.length, icone: Truck },
        {
          rotulo: "Checklists", valor: checklistsSemana.length, icone: ClipboardCheck,
          tom: tomDaNota(notaMediaSemana),
          legenda: notaMediaSemana !== null ? `nota média ${notaMediaSemana}` : "—",
        },
        {
          rotulo: "Limpezas realizadas", icone: Sparkles,
          valor: `${limpezasConclSemana.length}/${limpezasSemana.length}`,
          legenda: limpezasSemana.length > 0
            ? `${Math.round((limpezasConclSemana.length / limpezasSemana.length) * 100)}% concluído`
            : "nada programado",
        },
        { rotulo: "NFs arquivadas", valor: nfsSemana.length, icone: FileText },
      ];

  /* ── "Precisa de você": a MESMA regra dos cartões de alerta anteriores ─── */
  const PENDENCIAS = [
    { rotulo: "Assinaturas do líder pendentes", contagem: totalAssinaturas, url: "/Empilhadeira", tom: "atencao" },
    { rotulo: "Ocorrências em aberto", contagem: totalOcorrencias, url: "/Empilhadeira", tom: "erro" },
    { rotulo: "Limpezas atrasadas", contagem: limpezasAtrasadas.length, url: "/Dashboard", tom: "erro" },
    { rotulo: "Checklists reprovados hoje", contagem: checklistsReprovHoje, url: "/ChecklistRecebimento", tom: "erro" },
    { rotulo: "NFs sem foto há mais de 3 dias", contagem: nfsPendentes3dias, url: "/NotasFiscais", tom: "atencao" },
    { rotulo: "Manutenção de empilhadeira próxima", contagem: alertasManut, url: "/Empilhadeira", tom: "atencao" },
  ];

  /* ── Cartões ao vivo: só o mapeamento dos dados muda entre eles ────────── */
  const envaseAtivos = envases
    .filter((r) => {
      if (!r.inicio || r.data !== hoje) return false;
      return r.sala === "Bio" ? !r.material_retirado : !r.termino;
    })
    .slice(0, 4)
    .map((r) => ({
      id: r.id,
      operador: r.operador,
      foto: getPhoto(r.operador),
      principal: r.descricao_produto || "Produto não especificado",
      secundario: `${r.operador} · Sala ${r.sala}`,
      direita: calcElapsed(r.inicio),
      direitaLegenda: r.quantidade_produzida > 0 ? `${r.quantidade_produzida} un.` : null,
    }));

  const checkoutIdsHoje = checkoutProgs.filter((p) => p.data_programada === hoje).map((p) => p.id);
  const checkoutCriticos = checkoutItems.filter(
    (i) => i.critico && i.status !== "Concluído" && checkoutIdsHoje.includes(i.programacao_id));
  const checkoutAtivos = checkoutItems
    .filter((i) => i.hora_inicio && !i.hora_termino && i.status === "Em Andamento"
      && checkoutIdsHoje.includes(i.programacao_id))
    .slice(0, 4)
    .map((i) => ({
      id: i.id,
      operador: i.operador,
      foto: getPhoto(i.operador),
      tom: i.critico ? "erro" : "neutro",
      principal: i.numero_pedido,
      marcas: i.critico ? [{ texto: "CRÍTICO", tom: "erro" }] : [],
      secundario: [i.cliente, i.operador].filter(Boolean).join(" · "),
      direita: calcElapsed(i.hora_inicio),
      direitaLegenda: i.data_entrega
        ? `entrega ${format(new Date(i.data_entrega + "T00:00:00"), "dd/MM")}` : null,
    }));

  const empilhaIdsHoje = empilhaProgs.filter((p) => p.data_programada === hoje).map((p) => p.id);
  const paradaAberta = empilhaParadas.find((p) => p.data === hoje && !p.hora_fim);
  const empilhaAtivas = [
    ...empilhaLinhas.filter((l) => empilhaIdsHoje.includes(l.programacao_id)
      && l.tipo_linha === "Crítico" && l.status === "Em Andamento"),
    ...empilhaLinhas.filter((l) => empilhaIdsHoje.includes(l.programacao_id)
      && l.tipo_linha !== "Crítico" && l.status === "Em Andamento"),
  ].slice(0, 4).map((l) => ({
    id: l.id,
    operador: l.operador_empilhadeira,
    foto: getPhoto(l.operador_empilhadeira),
    tom: l.tipo_linha === "Crítico" ? "erro" : "neutro",
    principal: l.numero_linha ? `Linha ${l.numero_linha}` : (l.descricao || "Linha"),
    marcas: l.tipo_linha === "Crítico" ? [{ texto: "CRÍTICO", tom: "erro" }] : [],
    secundario: l.operador_empilhadeira,
    direita: calcElapsed(l.hora_inicio),
  }));

  const partPorRecebimento = {};
  for (const p of recebimentoParticipantes) {
    if (!partPorRecebimento[p.recebimento_id]) partPorRecebimento[p.recebimento_id] = [];
    partPorRecebimento[p.recebimento_id].push(p);
  }
  const recebimentoAtivos = recebimentos
    .filter((r) => r.status === "Em andamento")
    .slice(0, 4)
    .map((r) => {
      const parts = partPorRecebimento[r.id] || [];
      const marcas = [{ texto: r.tipo, tom: "neutro" }];
      if (r.prioridade === "Urgente") marcas.push({ texto: "URGENTE", tom: "erro" });
      if (r.prioridade === "Alta") marcas.push({ texto: "ALTA", tom: "atencao" });
      return {
        id: r.id,
        operador: parts[0]?.operador_nome,
        foto: getPhoto(parts[0]?.operador_nome),
        principal: r.numero_documento,
        marcas,
        secundario: [r.fornecedor_nome, parts.length ? `${parts.length} participante(s)` : null]
          .filter(Boolean).join(" · "),
        direita: calcElapsed(r.datetime_inicio?.split("T")[1]?.slice(0, 5)),
      };
    });

  const ocorrenciasAbertas = [
    ...empilhaOcorrencias.filter((o) => !o.resolvido).map((o) => ({ ...o, modulo: "Empilhadeira" })),
    ...recOcorrencias.filter((o) => !o.resolvido).map((o) => ({ ...o, modulo: "Recebimento" })),
  ].slice(0, 5);

  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="mx-auto flex min-w-0 max-w-[1500px] flex-col gap-4">
        <PageHeader
          aoVivo
          migalha={[{ rotulo: "Acompanhar" }, { rotulo: "Painel geral" }]}
          titulo="Painel geral"
          legenda={diaSemanaCapit}
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
            pilula={{ texto: `${envaseAtivos.length} ativo(s)` }}
            atraso={0.1}
          />
          <CartaoAoVivo
            titulo="Check-out em andamento"
            icone={ShoppingCart}
            url="/Checkout"
            itens={checkoutAtivos}
            vazio="Nenhum check-out em andamento"
            pilula={checkoutCriticos.length > 0
              ? { texto: `${checkoutCriticos.length} crítico(s)`, tom: "erro" }
              : { texto: `${checkoutAtivos.length} ativo(s)` }}
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
              : { texto: `${empilhaAtivas.length} ativo(s)` }}
            atraso={0.2}
          />
          <CartaoAoVivo
            titulo="Recebimento em andamento"
            icone={Truck}
            url="/Recebimento"
            itens={recebimentoAtivos}
            vazio="Nenhum recebimento em andamento"
            pilula={{ texto: `${recebimentoAtivos.length} ativo(s)` }}
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
