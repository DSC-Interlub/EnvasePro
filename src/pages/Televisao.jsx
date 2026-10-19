import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MolduraTV, NumeroTV, MetaTV, StatusTV, PainelImportacoes, GradeOperacoes, u,
} from "@/components/fluxo/tv";
import { format } from "date-fns";
import { formatarData } from '@/lib/datas';

/* ===================== UTILITÁRIOS ===================== */
function calcElapsed(startTime) {
  if (!startTime) return "—";
  const now = new Date();
  const [h, m] = startTime.split(':');
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(h), parseInt(m));
  const diff = now - start;
  if (diff < 0) return "0h 00m";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}

/** "08:10:00" -> "08:10" */
const hhmm = (t) => (t ? String(t).slice(0, 5) : null);

/* ===================== AS OPERAÇÕES DE CADA MÓDULO =====================
 *
 * O que cada cartão mostra, campo a campo, comparado com a TV ANTERIOR ao
 * módulo 1 (git 4ccc811^) — inventário completo no PR:
 *
 *  ENVASE: foto + nome do operador (grande), sala, produto, OP, quantidade
 *    produzida, certificações COM logo, tempo decorrido + "desde HH:MM", e o
 *    "PRONTO" da sala Bio aguardando retirada, com o botão de retirar.
 *    Tempo decorrido, "desde" e os logos tinham sumido na reconstrução.
 *
 *  CHECK-OUT: foto + nome, número do pedido, cliente, data de entrega,
 *    "CRÍTICO", tempo decorrido. A reconstrução tinha trocado pedido e
 *    cliente por `descricao_produto`/`quantidade` — colunas que NÃO EXISTEM
 *    em checkout_itens — e a linha mostrava só "Item".
 *
 *  EMPILHADEIRA: foto + nome do empilhador, AJUDANTE, produto, item,
 *    rua/torre, depósito, quantidade, "CRÍTICO", tempo decorrido. Ajudante,
 *    rua/torre, depósito, item e tempo tinham sumido.
 *
 * NOVO, pedido pelo dono: o alerta de atraso. Só onde há dado para isso — no
 * check-out, pela data de entrega. Envase e empilhadeira não têm prazo
 * gravado em lugar nenhum, então não há "atrasado" a calcular; inventar um
 * limite de tempo seria regra de negócio nova.
 */
function operacoesEnvase(records, { getOperatorPhoto, getProductCertifications, markMaterialAsRetirado }) {
  return records.map((r) => {
    const pronto = r.sala === 'Bio' && r.termino && !r.material_retirado;
    const qtd = r.quantidade_produzida > 0 ? `${r.quantidade_produzida.toLocaleString('pt-BR')} un. produzidas` : null;
    return {
      id: r.id,
      tom: pronto ? 'ok' : 'neutro',
      foto: getOperatorPhoto(r.operador),
      operador: r.operador,
      verbo: pronto ? 'Terminou — aguardando retirada' : 'Envasando',
      principal: r.descricao_produto || 'Produto não especificado',
      detalhe: [r.codigo_produto, qtd].filter(Boolean).join(' · ') || null,
      etiquetas: [
        { texto: `OP ${r.op || '—'}` },
        { texto: `Sala ${r.sala || '—'}`, tom: r.sala === 'Bio' ? 'ok' : undefined },
      ],
      certificacoes: getProductCertifications(r.codigo_produto),
      tempo: calcElapsed(r.inicio),
      desde: hhmm(r.inicio),
      alerta: pronto ? { texto: 'PRONTO', tom: 'ok' } : null,
      // A única ação da TV: a sala Bio marca que o material foi retirado.
      // Mesma regra de antes — só em linha Bio já concluída.
      acao: pronto ? { rotulo: 'Material retirado', aoClicar: () => markMaterialAsRetirado.mutate(r.id) } : null,
    };
  });
}

function operacoesCheckout(itens, { getOperatorPhoto, hoje }) {
  return itens.map((i) => {
    const atrasada = i.data_entrega && i.data_entrega < hoje;
    const entregaHoje = i.data_entrega === hoje;
    return {
      id: i.id,
      tom: i.critico || atrasada ? 'erro' : 'neutro',
      foto: getOperatorPhoto(i.operador),
      operador: i.operador,
      verbo: 'Em check-out',
      principal: `Pedido ${i.numero_pedido || '—'}`,
      detalhe: i.cliente || null,
      etiquetas: i.data_entrega ? [{ texto: `entrega ${formatarData(i.data_entrega, 'dd/MM')}` }] : [],
      tempo: calcElapsed(i.hora_inicio),
      desde: hhmm(i.hora_inicio),
      alerta: i.critico ? { texto: 'CRÍTICO', tom: 'erro' }
        : atrasada ? { texto: 'ENTREGA ATRASADA', tom: 'erro' }
        : entregaHoje ? { texto: 'ENTREGA HOJE', tom: 'atencao' }
        : null,
    };
  });
}

function operacoesEmpilha(linhas, { getOperatorPhoto }) {
  return linhas.map((l) => {
    const critica = l.tipo_linha === 'Crítico';
    const pausada = l.status === 'Pausado';
    return {
      id: l.id,
      tom: critica ? 'erro' : pausada ? 'atencao' : 'neutro',
      foto: getOperatorPhoto(l.operador_empilhadeira),
      operador: l.operador_empilhadeira,
      verbo: `${pausada ? 'Pausado' : 'Movimentando'}${l.operador_ajudante ? ` · com ${l.operador_ajudante}` : ''}`,
      principal: l.descricao_produto || l.codigo_produto || 'Linha',
      detalhe: [
        l.numero_item ? `Item ${l.numero_item}` : null,
        l.rua_torre ? `Rua/torre ${l.rua_torre}` : null,
        l.deposito ? `Depósito ${l.deposito}` : null,
        Number(l.quantidade) > 0 ? `${Number(l.quantidade).toLocaleString('pt-BR')} un.` : null,
      ].filter(Boolean).join(' · ') || null,
      etiquetas: l.tipo_linha && !critica ? [{ texto: l.tipo_linha }] : [],
      tempo: calcElapsed(l.hora_inicio),
      desde: hhmm(l.hora_inicio),
      alerta: critica ? { texto: 'CRÍTICO', tom: 'erro' } : pausada ? { texto: 'PAUSADA', tom: 'atencao' } : null,
    };
  });
}

export default function Televisao() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [slideIndex, setSlideIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const autoPlayRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Cinco paineis: Envase, Check-out, Empilhadeira, Mes e Importacoes.
  const NUM_SLIDES = 5;

  useEffect(() => {
    if (autoPlay) {
      autoPlayRef.current = setInterval(() => setSlideIndex(i => (i + 1) % NUM_SLIDES), 30000);
    }
    return () => clearInterval(autoPlayRef.current);
  }, [autoPlay, slideIndex]);

  const resetAutoPlay = (idx) => {
    setSlideIndex(idx);
    clearInterval(autoPlayRef.current);
    if (autoPlay) {
      autoPlayRef.current = setInterval(() => setSlideIndex(i => (i + 1) % NUM_SLIDES), 30000);
    }
  };

  const { data: allEnvaseRecords = [], isLoading: loadingEnvase } = useQuery({
    queryKey: ['envase-live'],
    queryFn: () => base44.entities.EnvaseRecord.list("-updated_date", 100),
    refetchInterval: 30000,
  });

  const { data: allCheckoutItems = [], isLoading: loadingCheckout } = useQuery({
    queryKey: ['checkout-live'],
    queryFn: () => base44.entities.CheckoutItem.list("-updated_date", 100),
    refetchInterval: 35000,
  });

  const { data: checkoutProgramacoes = [] } = useQuery({
    queryKey: ['checkout-programacoes-tv'],
    queryFn: () => base44.entities.CheckoutProgramacao.list(),
    refetchInterval: 60000,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-tv'],
    queryFn: () => base44.entities.Product.list(),
    refetchInterval: 300000,
  });

  const { data: operators = [] } = useQuery({
    queryKey: ['operators-tv'],
    queryFn: () => base44.entities.Operator.list(),
    refetchInterval: 120000,
  });

  const { data: monthlyKpis = { total: 0, bio: 0, industrial: 0, totalRegistros: 0, bioRegistros: 0, industrialRegistros: 0 } } = useQuery({
    queryKey: ['monthly-kpis-tv'],
    queryFn: async () => {
      const currentMonth = format(new Date(), "yyyy-MM");
      const all = await base44.entities.EnvaseRecord.list("-data", 2000);
      const monthRecords = all.filter(r => {
        if (!r.data) return false;
        return r.data.startsWith(currentMonth);
      });
      const bioRecs = monthRecords.filter(r => r.sala === "Bio");
      const indRecs = monthRecords.filter(r => r.sala === "Industrial");
      // Produção do mês por código de produto: a categoria (óleo, graxa,
      // pasta) é resolvida no render com a lista de produtos que a TV já
      // carrega. A TV antiga baixava os mesmos 2.000 registros uma SEGUNDA vez
      // só para isso.
      const porCodigo = {};
      for (const r of monthRecords) {
        if (!r.codigo_produto) continue;
        porCodigo[r.codigo_produto] = (porCodigo[r.codigo_produto] || 0) + (r.quantidade_produzida || 0);
      }
      return {
        total: monthRecords.reduce((s, r) => s + (r.quantidade_produzida || 0), 0),
        bio: bioRecs.reduce((s, r) => s + (r.quantidade_produzida || 0), 0),
        industrial: indRecs.reduce((s, r) => s + (r.quantidade_produzida || 0), 0),
        totalRegistros: monthRecords.length,
        bioRegistros: bioRecs.length,
        industrialRegistros: indRecs.length,
        porCodigo,
      };
    },
    refetchInterval: 120000,
  });


  const { data: todayStats = { envaseTotal: 0, envaseConcluidos: 0, checkoutConcluidos: 0, checkoutPendentes: 0 } } = useQuery({
    queryKey: ['today-stats'],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const allRecords = await base44.entities.EnvaseRecord.list();
      const todayRecords = allRecords.filter(r => r.data === today);
      const allProgramacoes = await base44.entities.CheckoutProgramacao.list();
      const todayProgramacoes = allProgramacoes.filter(p => p.data_programada === today);
      const todayProgramacaoIds = todayProgramacoes.map(p => p.id);
      const allCheckouts = await base44.entities.CheckoutItem.list();
      const todayCheckouts = allCheckouts.filter(item => todayProgramacaoIds.includes(item.programacao_id));
      return {
        envaseTotal: todayRecords.reduce((sum, r) => sum + (r.quantidade_produzida || 0), 0),
        envaseConcluidos: todayRecords.filter(r => r.termino).length,
        checkoutConcluidos: todayCheckouts.filter(item => item.status === "Concluído").length,
        checkoutPendentes: todayCheckouts.length,
      };
    },
    refetchInterval: 60000,
  });

  /* ---- Dados Empilhadeira ---- */
  const { data: empilhaProgramacoes = [] } = useQuery({
    queryKey: ['empilha-prog-tv'],
    queryFn: () => base44.entities.EmpilhaProgramacao.list("-data_programada"),
    refetchInterval: 60000,
  });

  const { data: empilhaLinhas = [] } = useQuery({
    queryKey: ['empilha-linhas-tv'],
    queryFn: () => base44.entities.EmpilhaLinha.list(),
    refetchInterval: 40000,
  });

  const { data: empilhaParadas = [] } = useQuery({
    queryKey: ['empilha-paradas-tv'],
    queryFn: () => base44.entities.EmpilhadeiraParada.list("-data"),
    refetchInterval: 45000,
  });

  const { data: empilhaOcorrencias = [] } = useQuery({
    queryKey: ['empilha-ocorr-tv'],
    queryFn: () => base44.entities.EmpilhaOcorrencia.list("-data"),
    refetchInterval: 50000,
  });

  const { data: empilhadeiras = [] } = useQuery({
    queryKey: ['empilhadeiras-tv'],
    queryFn: () => base44.entities.EmpilhadeiraConfig.list(),
    refetchInterval: 300000,
  });


  // Importacoes (SAP): voltou como o quarto painel do carrossel, a pedido do
  // dono. Mesma consulta de antes.
  const { data: importacoes = [], isLoading: loadingImportacoes } = useQuery({
    queryKey: ['importacoes-tv'],
    queryFn: () => base44.entities.SapPedido.list(),
    refetchInterval: 300000,
    initialData: [],
  });

  const markMaterialAsRetirado = useMutation({
    mutationFn: async (recordId) => base44.entities.EnvaseRecord.update(recordId, { material_retirado: true }),
    onSuccess: () => queryClient.invalidateQueries(['envase-live']),
  });

  const today = format(new Date(), "yyyy-MM-dd");

  const envaseRecords = allEnvaseRecords.filter(r => {
    if (!r.inicio) return false;
    if (r.sala === "Bio") { if (r.material_retirado) return false; }
    else { if (r.termino) return false; }
    return r.data === today;
  });

  const todayProgramacoes = checkoutProgramacoes.filter(p => p.data_programada === today);
  const todayProgramacaoIds = todayProgramacoes.map(p => p.id);
  const checkoutItems = allCheckoutItems
    .filter(item => item.hora_inicio && !item.hora_termino && item.status === "Em Andamento" && todayProgramacaoIds.includes(item.programacao_id))
    .sort((a, b) => (b.hora_inicio || "").localeCompare(a.hora_inicio || ""));

  const getProductCertifications = (codigoProduto) => {
    if (!products || !codigoProduto) return [];
    const product = products.find(p => p.codigo === codigoProduto);
    if (!product) return [];
    const certs = [];
    // Com o logo, como a TV antiga: o selo é reconhecido pela imagem antes
    // de o nome ser lido.
    if (product.halal) certs.push({ nome: 'HALAL', logo: '/certificacoes/halal.png' });
    if (product.kosher) certs.push({ nome: 'KOSHER', logo: '/certificacoes/kosher.png' });
    if (product.nsf_3h) certs.push({ nome: 'NSF 3H', logo: '/certificacoes/nsf.png' });
    if (product.nsf_h1) certs.push({ nome: 'NSF H1', logo: '/certificacoes/nsf.png' });
    return certs;
  };
  const getOperatorPhoto = (nome) => operators.find(op => op.nome === nome)?.foto_url || null;

  const todayProgIds = empilhaProgramacoes.filter(p => p.data_programada === today).map(p => p.id);
  const todayLinhas = empilhaLinhas.filter(l => todayProgIds.includes(l.programacao_id));
  const linhasAtivas = [
    ...todayLinhas.filter(l => l.tipo_linha === "Crítico" && l.status === "Em Andamento"),
    ...todayLinhas.filter(l => l.tipo_linha === "Avulso" && l.status === "Em Andamento"),
    ...todayLinhas.filter(l => (l.tipo_linha === "Normal" || !l.tipo_linha) && l.status === "Em Andamento"),
  ];
  const paradaAtiva = empilhaParadas.find(p => p.data === today && !p.hora_fim);
  const ocorrenciasAtivas = empilhaOcorrencias.filter(o => o.data === today && !o.resolvido);
  const temposMins = todayLinhas.filter(l => l.status === "Concluído" && l.tempo_total)
    .map(l => { const [h, m] = (l.tempo_total || "0:0").split(":").map(Number); return h * 60 + (m || 0); });
  const tempoMedio = temposMins.length > 0 ? Math.round(temposMins.reduce((a, b) => a + b, 0) / temposMins.length) : 0;
  const empilhadeiraAtiva = empilhadeiras.find(e => e.ativa);

  const empilhadeiraData = {
    linhasAtivas,
    empilhadeira: empilhadeiraAtiva,
    paradaAtiva,
    ocorrencias: ocorrenciasAtivas,
    kpis: {
      total: todayLinhas.length,
      concluidas: todayLinhas.filter(l => l.status === "Concluído").length,
      criticos: todayLinhas.filter(l => l.tipo_linha === "Crítico" && l.status !== "Concluído").length,
      tempoMedio,
    },
  };

  const prevSlide = () => resetAutoPlay((slideIndex - 1 + NUM_SLIDES) % NUM_SLIDES);
  const nextSlide = () => resetAutoPlay((slideIndex + 1) % NUM_SLIDES);

  // ---------------------------------------------------------------------
  // O que cada slide mostra.
  //
  // A estrutura e a do prototipo TV-fabrica.html: anel da meta + dois numeros
  // gigantes + quatro cartoes de status no rodape.
  //
  // SOBRE A "META": o prototipo mostra "meta 150", e NAO EXISTE campo de meta
  // em lugar nenhum do banco (conferido em todas as colunas de public). Em vez
  // de inventar um numero, o anel mostra o que e real: a fracao CONCLUIDA do
  // que foi lancado hoje. Se o dono quiser meta de verdade, ela precisa de
  // coluna — esta anotado no relatorio.
  // ---------------------------------------------------------------------
  const emAndamentoEnvase = envaseRecords.length;
  const totalEnvaseHoje = todayStats.envaseConcluidos + emAndamentoEnvase;
  const totalCheckoutHoje = todayStats.checkoutConcluidos + todayStats.checkoutPendentes;

  // Mesma regra da TV antiga: a categoria vem de products.categoria.
  const categoriaDe = {};
  for (const p of products) if (p.codigo && p.categoria) categoriaDe[p.codigo] = p.categoria;
  const porCategoria = { oleo: 0, graxa: 0, pasta: 0 };
  for (const [codigo, qtd] of Object.entries(monthlyKpis.porCodigo || {})) {
    const cat = categoriaDe[codigo];
    if (cat === 'Óleo') porCategoria.oleo += qtd;
    else if (cat === 'Graxa') porCategoria.graxa += qtd;
    else if (cat === 'Pasta') porCategoria.pasta += qtd;
  }

  const PAINEIS = [
    {
      modulo: 'Envase',
      titulo: 'Produção de hoje',
      meta: {
        rotulo: 'Concluídos',
        valor: todayStats.envaseConcluidos,
        total: totalEnvaseHoje,
        unidade: 'envases',
        legenda: totalEnvaseHoje > 0
          ? `${emAndamentoEnvase} em andamento · ${totalEnvaseHoje} lançados`
          : 'sem lançamentos',
      },
      numeros: [
        { rotulo: 'Produção de hoje', valor: todayStats.envaseTotal.toLocaleString('pt-BR'),
          pilula: `${monthlyKpis.totalRegistros} registros no mês`, pilulaTom: 'atencao' },
        { rotulo: 'Ocorrências abertas', valor: ocorrenciasAtivas.length, tom: 'erro',
          pilula: ocorrenciasAtivas.length > 0 ? 'precisa de atenção' : 'nenhuma aberta',
          pilulaTom: ocorrenciasAtivas.length > 0 ? 'erro' : 'atencao' },
      ],
      tituloOperacoes: 'Envase em andamento',
      contagemOperacoes: `${envaseRecords.length} ${envaseRecords.length === 1 ? 'operação' : 'operações'}`,
      operacoes: operacoesEnvase(envaseRecords, { getOperatorPhoto, getProductCertifications, markMaterialAsRetirado }),
    },
    {
      modulo: 'Check-out',
      titulo: 'Expedição de hoje',
      meta: {
        rotulo: 'Concluídos',
        valor: todayStats.checkoutConcluidos,
        total: totalCheckoutHoje,
        unidade: 'pedidos',
        legenda: totalCheckoutHoje > 0
          ? `${todayStats.checkoutPendentes} pendentes · ${totalCheckoutHoje} no dia`
          : 'sem pedidos',
      },
      numeros: [
        { rotulo: 'Em andamento', valor: checkoutItems.length,
          pilula: `${todayStats.checkoutPendentes} pendentes`, pilulaTom: 'atencao' },
        { rotulo: 'Pedidos críticos', valor: checkoutItems.filter((i) => i.critico).length, tom: 'erro',
          pilula: checkoutItems.filter((i) => i.critico).length > 0 ? 'prioridade' : 'nenhum crítico',
          pilulaTom: checkoutItems.filter((i) => i.critico).length > 0 ? 'erro' : 'atencao' },
      ],
      tituloOperacoes: 'Check-out em andamento',
      contagemOperacoes: `${checkoutItems.length} ${checkoutItems.length === 1 ? 'pedido' : 'pedidos'}`,
      operacoes: operacoesCheckout(checkoutItems, { getOperatorPhoto, hoje: today }),
    },
    {
      modulo: 'Empilhadeira',
      titulo: 'Movimentação de hoje',
      meta: {
        rotulo: 'Concluídas',
        valor: empilhadeiraData.kpis.concluidas,
        total: empilhadeiraData.kpis.total,
        unidade: 'linhas',
        legenda: empilhadeiraData.kpis.total > 0
          ? `${empilhadeiraData.kpis.total - empilhadeiraData.kpis.concluidas} em aberto · ${empilhadeiraData.kpis.total} no dia`
          : 'sem linhas',
      },
      numeros: [
        { rotulo: 'Tempo médio por linha',
          valor: empilhadeiraData.kpis.tempoMedio > 0 ? `${empilhadeiraData.kpis.tempoMedio}m` : '—',
          pilula: `${empilhadeiraData.linhasAtivas.length} em andamento`, pilulaTom: 'atencao' },
        { rotulo: 'Críticos pendentes', valor: empilhadeiraData.kpis.criticos, tom: 'erro',
          pilula: empilhadeiraData.kpis.criticos > 0 ? 'prioridade' : 'nenhum crítico',
          pilulaTom: empilhadeiraData.kpis.criticos > 0 ? 'erro' : 'atencao' },
      ],
      tituloOperacoes: 'Movimentação em andamento',
      contagemOperacoes: `${linhasAtivas.length} ${linhasAtivas.length === 1 ? 'linha' : 'linhas'}`,
      operacoes: operacoesEmpilha(linhasAtivas, { getOperatorPhoto }),
    },
    {
      // OS NUMEROS DO MES, de volta. A TV anterior ao modulo 1 os mostrava no
      // topo do painel de envase; a reconstrucao tirou-os dizendo que
      // "duplicavam os cartoes grandes" — mas os cartoes grandes mostram o
      // DIA. Voltam como painel proprio, porque nao cabem ao lado das
      // operacoes sem espremer o que a fabrica le.
      modulo: 'Mês',
      titulo: 'Produção do mês',
      proprio: (
        <div
          className="grid min-h-0 flex-1"
          style={{
            gap: u(1.3),
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
          }}
        >
          <NumeroTV rotulo="Produção total" valor={monthlyKpis.total.toLocaleString('pt-BR')}
            pilula={`${monthlyKpis.totalRegistros} registros`} atraso={0.05} />
          <NumeroTV rotulo="Sala Bio" valor={monthlyKpis.bio.toLocaleString('pt-BR')} tom="ok"
            pilula={`${monthlyKpis.bioRegistros} registros`} atraso={0.1} />
          <NumeroTV rotulo="Sala Industrial" valor={monthlyKpis.industrial.toLocaleString('pt-BR')}
            pilula={`${monthlyKpis.industrialRegistros} registros`} atraso={0.15} />
          <NumeroTV rotulo="Óleo" valor={porCategoria.oleo.toLocaleString('pt-BR')} pilula="unidades no mês" atraso={0.2} />
          <NumeroTV rotulo="Graxa" valor={porCategoria.graxa.toLocaleString('pt-BR')} pilula="unidades no mês" atraso={0.25} />
          <NumeroTV rotulo="Pasta" valor={porCategoria.pasta.toLocaleString('pt-BR')} pilula="unidades no mês" atraso={0.3} />
        </div>
      ),
    },
    {
      modulo: 'Importações',
      titulo: 'Importações previstas',
      // Este painel nao usa anel nem os dois numeros padrao: a propria
      // PainelImportacoes monta a faixa de cima inteira, porque o conteudo
      // (data da proxima chegada) nao cabe na forma "anel + dois numeros".
      proprio: <PainelImportacoes pedidos={importacoes} carregando={loadingImportacoes} />,
    },
  ];

  const painel = PAINEIS[slideIndex] || PAINEIS[0];

  // Rodape: quatro situacoes, cada uma com ponto de cor E texto.
  const diasAteManutencao = empilhadeiraAtiva?.data_proxima_manutencao
    ? Math.ceil((new Date(empilhadeiraAtiva.data_proxima_manutencao) - new Date()) / 86400000)
    : null;

  const situacoes = [
    {
      nome: 'Envase',
      situacao: emAndamentoEnvase > 0 ? `${emAndamentoEnvase} em andamento` : 'sem envase ativo',
      tom: emAndamentoEnvase > 0 ? 'ok' : 'neutro',
    },
    {
      nome: 'Check-out',
      situacao: todayStats.checkoutPendentes > 0
        ? `${todayStats.checkoutPendentes} pendentes` : 'tudo concluído',
      tom: todayStats.checkoutPendentes > 0 ? 'atencao' : 'ok',
    },
    {
      nome: empilhadeiraAtiva?.nome || 'Empilhadeira',
      situacao: empilhadeiraData.paradaAtiva ? 'parada agora'
        : diasAteManutencao != null && diasAteManutencao <= 7
          ? `manutenção em ${Math.max(0, diasAteManutencao)} dias`
          : 'operando',
      tom: empilhadeiraData.paradaAtiva ? 'erro'
        : diasAteManutencao != null && diasAteManutencao <= 7 ? 'atencao' : 'ok',
    },
    {
      nome: 'Ocorrências',
      situacao: ocorrenciasAtivas.length > 0
        ? `${ocorrenciasAtivas.length} aberta(s) hoje` : 'nenhuma aberta',
      tom: ocorrenciasAtivas.length > 0 ? 'erro' : 'ok',
    },
  ];

  // O prototipo mostra "turno [TURNO]", mas nao existe dado de turno no
  // sistema e a TV roda numa conta compartilhada: nao ha operador de turno a
  // exibir. Fica de fora em vez de inventar.
  return (
    <MolduraTV
      titulo={painel.titulo}
      modulo={painel.modulo}
      acoes={
        <div className="flex items-center" style={{ gap: u(0.8) }}>
          <button
            type="button"
            onClick={() => setAutoPlay((a) => !a)}
            aria-label={autoPlay ? 'Pausar rotação' : 'Retomar rotação'}
            className="press rounded-full border border-white/15 bg-cartao/5 font-bold text-texto-fraco
                       hover:bg-cartao/10 hover:text-tinta"
            style={{ padding: `${u(0.5)} ${u(1)}`, fontSize: u(0.95) }}
          >
            {autoPlay ? 'Pausar' : 'Retomar'}
          </button>
          <div className="flex items-center" style={{ gap: u(0.45) }} role="tablist" aria-label="Painel">
            {PAINEIS.map((pnl, i) => (
              <button
                key={pnl.modulo}
                type="button"
                role="tab"
                aria-selected={i === slideIndex}
                aria-label={pnl.modulo}
                onClick={() => resetAutoPlay(i)}
                className="press rounded-full transition-all"
                style={{
                  height: u(0.65),
                  width: i === slideIndex ? u(2) : u(0.65),
                  background: i === slideIndex ? 'rgb(var(--marca))' : 'rgb(255 255 255 / .25)',
                }}
              />
            ))}
          </div>
        </div>
      }
      rodape={situacoes.map((s, i) => (
        <StatusTV key={s.nome} nome={s.nome} situacao={s.situacao} tom={s.tom} atraso={0.45 + i * 0.05} />
      ))}
    >
      {/* Painel que monta o proprio miolo (Importacoes) */}
      {painel.proprio}

      {!painel.proprio && (painel.operacoes.length > 0 ? (
        /*
          COM OPERACOES EM ANDAMENTO: elas sao o centro.

          A versao anterior punha o anel e os dois numeros GIGANTES em cima e
          espremia a lista numa faixa embaixo; numa tela baixa os numeros
          transbordavam e cobriam a lista. Mas quem esta fazendo o que, em
          cada linha, e o que a fabrica realmente le na TV. Agora: operacoes em
          2/3, anel e numeros compactos em 1/3.
        */
        <div
          className="grid min-h-0 flex-1"
          style={{ gap: u(1.3), gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}
        >
          <GradeOperacoes
            titulo={painel.tituloOperacoes}
            contagem={painel.contagemOperacoes}
            itens={painel.operacoes}
          />

          <div
            className="grid min-h-0 min-w-0"
            style={{ gap: u(1.3), gridTemplateRows: 'minmax(0, 1.15fr) minmax(0, 1fr)' }}
          >
            <MetaTV
              compacto
              rotulo={painel.meta.rotulo}
              valor={painel.meta.valor}
              meta={painel.meta.total}
              unidade={painel.meta.unidade}
              legenda={painel.meta.legenda}
            />
            <div
              className="grid min-h-0 min-w-0"
              style={{ gap: u(1.3), gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}
            >
              {painel.numeros.map((n, i) => (
                <NumeroTV key={n.rotulo} compacto {...n} atraso={0.15 + i * 0.1} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* SEM OPERACOES: o layout grande do prototipo — anel + dois numeros. */
        <div
          className="grid min-h-0 flex-1"
          style={{
            gap: u(1.3),
            gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr)',
          }}
        >
          <MetaTV
            rotulo={painel.meta.rotulo}
            valor={painel.meta.valor}
            meta={painel.meta.total}
            unidade={painel.meta.unidade}
            legenda={painel.meta.legenda}
          />
          {painel.numeros.map((n, i) => (
            <NumeroTV key={n.rotulo} {...n} atraso={0.15 + i * 0.15} />
          ))}
        </div>
      ))}
    </MolduraTV>
  );
}
