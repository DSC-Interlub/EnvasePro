import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { MolduraTV, NumeroTV, MetaTV, StatusTV, GradeOperacoes, usePainelTV, u } from "@/components/fluxo/tv";

export default function TelevisaoEmpilha() {
  // Re-renderiza a cada segundo: é o que faz o "tempo decorrido" andar.
  const [, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // O painel do dia vem pronto do banco — public.painel_televisao_empilha()
  // (Etapa 2). Antes eram três consultas a cada 10–15 s, baixando TODAS as
  // programações e TODAS as ocorrências para mostrar o dia de hoje. Se a
  // função ainda não existir no banco, o adaptador calcula o mesmo painel no
  // navegador (src/lib/painelEmpilha.js).
  const { painel, atualizacao } = usePainelTV("empilha", () => base44.functions.painelTelevisaoEmpilha());

  // Os operadores servem só para a FOTO. Mudam raramente e a URL assinada
  // vale 24 h: recarregar a cada 30 min basta.
  const { data: operators } = useQuery({
    queryKey: ["operators-tv"],
    queryFn: () => base44.entities.Operator.list(),
    refetchInterval: 30 * 60000,
    initialData: [],
  });

  const linhasEmAndamento = painel?.operacoes ?? [];
  const ehCritica = (l) => l.tipo_linha === "Crítico";

  // KPIs — as mesmas regras de antes, agora calculadas no banco.
  const totalLinhas = painel?.total ?? 0;
  const concluidas = painel?.concluidas ?? 0;
  const emAndamento = painel?.em_andamento ?? 0;
  const criticosPendentes = painel?.criticos_pendentes ?? 0;
  const ocorrenciasAbertas = painel?.ocorrencias_abertas ?? 0;
  const tempoMedioMin = painel?.tempo_medio_min ?? 0;
  const tempoMedio = tempoMedioMin > 0 ? `${Math.floor(tempoMedioMin / 60)}h${(tempoMedioMin % 60).toString().padStart(2, "0")}m` : "—";

  // Pelo id primeiro: o nome falha com homônimos (CLAUDE.md §6).
  const getOperatorPhoto = (l) =>
    (operators.find(o => o.id === l.operador_empilhadeira_id)
      || operators.find(o => o.nome === l.operador_empilhadeira))?.foto_url || null;

  const calculateElapsed = (startTime) => {
    if (!startTime) return "—";
    const now = new Date();
    const [h, m] = startTime.split(":").map(Number);
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    const diff = now - start;
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins.toString().padStart(2, "0")}m`;
  };

  // ---------------------------------------------------------------------
  // Reconstruido sobre o prototipo TV-fabrica.html, com os mesmos componentes
  // da TV de envase. Os DADOS acima nao mudaram — as mesmas consultas, os
  // mesmos filtros, os mesmos KPIs.
  //
  // O anel mostra a fracao CONCLUIDA do dia. Nao ha campo de meta no banco
  // (ver docs e o relatorio do modulo), entao nao ha "meta 150" a mostrar.
  // ---------------------------------------------------------------------
  const situacoes = [
    {
      nome: 'Em andamento',
      situacao: emAndamento > 0 ? `${emAndamento} linha(s) agora` : 'nenhuma linha ativa',
      tom: emAndamento > 0 ? 'ok' : 'neutro',
    },
    {
      nome: 'Críticos',
      situacao: criticosPendentes > 0 ? `${criticosPendentes} pendente(s)` : 'nenhum pendente',
      tom: criticosPendentes > 0 ? 'erro' : 'ok',
    },
    {
      nome: 'Ocorrências',
      situacao: ocorrenciasAbertas > 0 ? `${ocorrenciasAbertas} aberta(s)` : 'nenhuma aberta',
      tom: ocorrenciasAbertas > 0 ? 'erro' : 'ok',
    },
    {
      nome: 'Tempo médio',
      situacao: tempoMedioMin > 0 ? `${tempoMedio} por linha` : 'sem linha concluída',
      tom: 'neutro',
    },
  ];

  // Cada linha em andamento, com o que a TV antiga mostrava (git 4ccc811^):
  // empilhador com foto, AJUDANTE, produto, item, rua/torre, depósito,
  // quantidade, crítico e tempo decorrido. Ajudante, rua/torre, item e
  // quantidade tinham sumido na reconstrução do módulo 1.
  const operacoes = linhasEmAndamento.map((l) => {
    const critica = ehCritica(l);
    const pausada = l.status === "Pausado";
    return {
      id: l.id,
      tom: critica ? "erro" : pausada ? "atencao" : "neutro",
      foto: getOperatorPhoto(l),
      operador: l.operador_empilhadeira,
      verbo: `${pausada ? "Pausado" : "Movimentando"}${l.operador_ajudante ? ` · com ${l.operador_ajudante}` : ""}`,
      principal: l.descricao_produto || l.codigo_produto || "Linha",
      detalhe: [
        l.numero_item ? `Item ${l.numero_item}` : null,
        l.rua_torre ? `Rua/torre ${l.rua_torre}` : null,
        l.deposito ? `Depósito ${l.deposito}` : null,
        Number(l.quantidade) > 0 ? `${Number(l.quantidade).toLocaleString("pt-BR")} un.` : null,
      ].filter(Boolean).join(" · ") || null,
      etiquetas: l.tipo_linha && !critica ? [{ texto: l.tipo_linha }] : [],
      tempo: calculateElapsed(l.hora_inicio),
      desde: l.hora_inicio ? String(l.hora_inicio).slice(0, 5) : null,
      alerta: critica ? { texto: "CRÍTICO", tom: "erro" } : pausada ? { texto: "PAUSADA", tom: "atencao" } : null,
    };
  });

  // A ocorrência mais recente vai na pílula: a TV antiga listava as abertas
  // com tipo e hora, e a reconstrução tinha reduzido isso a um número no
  // rodapé. A descrição inteira continua na tela do módulo.
  const ultimaOcorrencia = painel?.ultima_ocorrencia;
  const numeros = [
    {
      rotulo: "Críticos pendentes", valor: criticosPendentes, tom: "erro",
      pilula: criticosPendentes > 0 ? "prioridade" : "nenhum crítico",
      pilulaTom: criticosPendentes > 0 ? "erro" : "atencao",
    },
    {
      rotulo: "Ocorrências abertas", valor: ocorrenciasAbertas, tom: "erro",
      pilula: ultimaOcorrencia
        ? `${ultimaOcorrencia.tipo || "ocorrência"}${ultimaOcorrencia.hora ? ` · ${String(ultimaOcorrencia.hora).slice(0, 5)}` : ""}`
        : "nenhuma aberta",
      pilulaTom: ultimaOcorrencia ? "erro" : "atencao",
    },
  ];
  const meta = {
    rotulo: "Concluídas",
    valor: concluidas,
    // `meta`, não `total`: é o nome que o MetaTV lê. Com `total` o anel ficava
    // sempre em 0% (defeito do PR #24, achado pelo teste da Etapa 2).
    meta: totalLinhas,
    unidade: "linhas",
    legenda: totalLinhas > 0 ? `${totalLinhas - concluidas} em aberto · ${totalLinhas} no dia` : "sem linhas",
  };

  return (
    <MolduraTV
      titulo="Movimentação de hoje"
      modulo="Empilhadeira"
      atualizacao={atualizacao}
      rodape={situacoes.map((s, i) => (
        <StatusTV key={s.nome} nome={s.nome} situacao={s.situacao} tom={s.tom} atraso={0.45 + i * 0.05} />
      ))}
    >
      {operacoes.length > 0 ? (
        // Com linhas em andamento: elas no centro (2/3), anel e números ao lado.
        <div
          className="grid min-h-0 flex-1"
          style={{ gap: u(1.3), gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" }}
        >
          <GradeOperacoes
            titulo="Linhas em andamento"
            contagem={`${operacoes.length} ${operacoes.length === 1 ? "linha" : "linhas"}`}
            itens={operacoes}
          />
          <div
            className="grid min-h-0 min-w-0"
            style={{ gap: u(1.3), gridTemplateRows: "minmax(0, 1.15fr) minmax(0, 1fr)" }}
          >
            <MetaTV compacto {...meta} />
            <div
              className="grid min-h-0 min-w-0"
              style={{ gap: u(1.3), gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}
            >
              {numeros.map((n, i) => <NumeroTV key={n.rotulo} compacto {...n} atraso={0.15 + i * 0.1} />)}
            </div>
          </div>
        </div>
      ) : (
        // Sem linhas: o layout grande do protótipo.
        <div
          className="grid min-h-0 flex-1"
          style={{ gap: u(1.3), gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr)" }}
        >
          <MetaTV {...meta} />
          {numeros.map((n, i) => <NumeroTV key={n.rotulo} {...n} atraso={0.15 + i * 0.15} />)}
        </div>
      )}
    </MolduraTV>
  );
}
