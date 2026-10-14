import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { MolduraTV, CartaoVidro, NumeroTV, MetaTV, StatusTV, ListaTV } from "@/components/fluxo/tv";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Warehouse, User, MapPin, Package, Clock, CheckCircle, AlertCircle, AlertTriangle } from "lucide-react";
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

  const linhasEmAndamento = linhasHoje
    .filter(l => l.status === "Em Andamento")
    .sort((a, b) => (b.critico ? 1 : 0) - (a.critico ? 1 : 0));

  const ocorrenciasHoje = ocorrencias.filter(o => o.data === today && !o.resolvido);

  // KPIs
  const totalLinhas = linhasHoje.length;
  const concluidas = linhasHoje.filter(l => l.status === "Concluído").length;
  const emAndamento = linhasHoje.filter(l => l.status === "Em Andamento").length;
  const criticosPendentes = linhasHoje.filter(l => l.critico && l.status !== "Concluído").length;

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

  return (
    <MolduraTV
      titulo="Movimentação de hoje"
      modulo="Empilhadeira"
      rodape={situacoes.map((s, i) => (
        <StatusTV key={s.nome} nome={s.nome} situacao={s.situacao} tom={s.tom} atraso={0.45 + i * 0.05} />
      ))}
    >
      <div
        className="grid min-h-0 flex-1 lg:grid-cols-[1.25fr_1fr_1fr]"
        style={{ gap: 'clamp(14px, 1.5vw, 28px)' }}
      >
        <MetaTV
          rotulo="Concluídas"
          valor={concluidas}
          meta={totalLinhas}
          unidade="linhas"
          legenda={totalLinhas > 0
            ? `${totalLinhas - concluidas} em aberto · ${totalLinhas} no dia`
            : 'sem linhas'}
        />
        <NumeroTV
          rotulo="Em andamento"
          valor={emAndamento}
          pilula={`${progHoje.length} programação(ões) hoje`}
          atraso={0.15}
        />
        <NumeroTV
          rotulo="Críticos pendentes"
          valor={criticosPendentes}
          tom="erro"
          pilula={criticosPendentes > 0 ? 'prioridade' : 'nenhum crítico'}
          pilulaTom={criticosPendentes > 0 ? 'erro' : 'atencao'}
          atraso={0.3}
        />
      </div>

      {/* A faixa so aparece quando ha linha: sem isso ela ocuparia espaco sem
          dizer nada e afastaria o rodape, que no prototipo fica colado embaixo. */}
      {linhasEmAndamento.length > 0 && (
        <CartaoVidro atraso={0.35} className="min-h-0 flex-1 overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto" style={{ padding: 'clamp(14px, 1.5vw, 28px)' }}>
            <ListaTV
              titulo="Linhas em andamento"
              contagem={`${linhasEmAndamento.length} ativa(s)`}
              vazio="Nenhuma linha em andamento agora"
              itens={linhasEmAndamento.map((l) => ({
                id: l.id,
                tom: l.critico ? 'erro' : l.status === 'Pausado' ? 'atencao' : 'neutro',
                foto: getOperatorPhoto(l.operador_empilhadeira),
                principal: l.descricao_produto || l.codigo_produto || 'Linha',
                secundario: `${l.operador_empilhadeira || 'sem operador'}${l.critico ? ' · crítico' : ''}${l.deposito ? ` · ${l.deposito}` : ''}`,
                direita: calculateElapsed(l.hora_inicio),
                direitaLegenda: 'decorrido',
              }))}
            />
          </div>
        </CartaoVidro>
      )}
    </MolduraTV>
  );
}
