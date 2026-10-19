import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { MolduraTV, NumeroTV, MetaTV, StatusTV, GradeOperacoes, u } from "@/components/fluxo/tv";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function TelevisaoEmpilha() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const today = format(new Date(), "yyyy-MM-dd");

  const { data: programacoes } = useQuery({
    queryKey: ["empilha-prog-tv"],
    queryFn: () => base44.entities.EmpilhaProgramacao.list(),
    refetchInterval: 10000,
    initialData: [],
  });

  const { data: allLinhas } = useQuery({
    queryKey: ["empilha-linhas-tv"],
    queryFn: () => base44.entities.EmpilhaLinha.list("-updated_date", 200),
    refetchInterval: 10000,
    initialData: [],
  });

  const { data: operators } = useQuery({
    queryKey: ["operators-tv"],
    queryFn: () => base44.entities.Operator.list(),
    refetchInterval: 60000,
    initialData: [],
  });

  const { data: ocorrencias } = useQuery({
    queryKey: ["empilha-ocorrencias-tv"],
    queryFn: () => base44.entities.EmpilhaOcorrencia.list("-data"),
    refetchInterval: 15000,
    initialData: [],
  });

  const progHoje = programacoes.filter(p => p.data_programada === today);
  const progHojeIds = progHoje.map(p => p.id);
  const linhasHoje = allLinhas.filter(l => progHojeIds.includes(l.programacao_id));

  // `tipo_linha === "Crítico"`, e NÃO `l.critico`: a tabela empilha_linhas não
  // tem coluna `critico` (conferido no banco). Esta tela filtrava por ela desde
  // antes do módulo 1 — o contador "Críticos pendentes" era SEMPRE zero e a
  // linha crítica nunca ia para o topo nem ficava vermelha.
  const ehCritica = (l) => l.tipo_linha === "Crítico";
  const linhasEmAndamento = linhasHoje
    .filter(l => l.status === "Em Andamento")
    .sort((a, b) => (ehCritica(b) ? 1 : 0) - (ehCritica(a) ? 1 : 0));

  const ocorrenciasHoje = ocorrencias.filter(o => o.data === today && !o.resolvido);

  // KPIs
  const totalLinhas = linhasHoje.length;
  const concluidas = linhasHoje.filter(l => l.status === "Concluído").length;
  const emAndamento = linhasHoje.filter(l => l.status === "Em Andamento").length;
  const criticosPendentes = linhasHoje.filter(l => ehCritica(l) && l.status !== "Concluído").length;

  // Tempo médio
  const linhasComTempo = linhasHoje.filter(l => l.tempo_total && l.status === "Concluído");
  let tempoMedioMin = 0;
  if (linhasComTempo.length > 0) {
    const totalMins = linhasComTempo.reduce((sum, l) => {
      const [h, m] = l.tempo_total.split(":").map(Number);
      return sum + h * 60 + m;
    }, 0);
    tempoMedioMin = Math.round(totalMins / linhasComTempo.length);
  }
  const tempoMedio = tempoMedioMin > 0 ? `${Math.floor(tempoMedioMin / 60)}h${(tempoMedioMin % 60).toString().padStart(2, "0")}m` : "—";

  const getOperatorPhoto = (nome) => operators.find(o => o.nome === nome)?.foto_url || null;

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
      situacao: ocorrenciasHoje.length > 0 ? `${ocorrenciasHoje.length} aberta(s)` : 'nenhuma aberta',
      tom: ocorrenciasHoje.length > 0 ? 'erro' : 'ok',
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
      foto: getOperatorPhoto(l.operador_empilhadeira),
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
  const ultimaOcorrencia = ocorrenciasHoje[0];
  const numeros = [
    {
      rotulo: "Críticos pendentes", valor: criticosPendentes, tom: "erro",
      pilula: criticosPendentes > 0 ? "prioridade" : "nenhum crítico",
      pilulaTom: criticosPendentes > 0 ? "erro" : "atencao",
    },
    {
      rotulo: "Ocorrências abertas", valor: ocorrenciasHoje.length, tom: "erro",
      pilula: ultimaOcorrencia
        ? `${ultimaOcorrencia.tipo || "ocorrência"}${ultimaOcorrencia.hora ? ` · ${String(ultimaOcorrencia.hora).slice(0, 5)}` : ""}`
        : "nenhuma aberta",
      pilulaTom: ultimaOcorrencia ? "erro" : "atencao",
    },
  ];
  const meta = {
    rotulo: "Concluídas",
    valor: concluidas,
    total: totalLinhas,
    unidade: "linhas",
    legenda: totalLinhas > 0 ? `${totalLinhas - concluidas} em aberto · ${totalLinhas} no dia` : "sem linhas",
  };

  return (
    <MolduraTV
      titulo="Movimentação de hoje"
      modulo="Empilhadeira"
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
