/**
 * src/lib/checklist.js — o critério de aprovação do checklist, num lugar só.
 *
 * POR QUE ISTO EXISTE
 *
 * A regra `nota_final >= 80` estava escrita em **7 arquivos e 22 ocorrências**:
 * IndicadoresChecklist, NovoChecklist, ChecklistDetalhe, ChecklistNotaBadge,
 * RecebimentoCard, ChecklistRecebimento e Painel. Mudar o critério exigia
 * acertar sete arquivos em sincronia, e esquecer um faz duas telas discordarem
 * sobre o mesmo checklist.
 *
 * A varredura mostrou que isso já tinha acontecido:
 *   - `Painel.jsx:549` tinha só dois ramos (verde ou amarelo), sem vermelho:
 *     nota negativa aparecia AMARELA na TV e VERMELHA em todas as outras telas;
 *   - `ChecklistRecebimento.jsx:129` usa 80 e 60 sobre um PERCENTUAL de
 *     conformidade, não sobre a nota. É outro número com a mesma cor verde.
 *
 * COMO A NOTA É CALCULADA (trigger `calcular_nota_checklist`, no banco)
 *
 *   9 perguntas. "Sim" = +10, "Não" = −10, "N/A" = 0.
 *   Faixa: −90 a +90, de 10 em 10.
 *
 * Por isso NUNCA criar restrição de 0 a 100 sobre `nota_final`.
 *
 * OS DOIS CRITÉRIOS
 *
 * A — PONTOS (ativo). É exatamente o que o sistema faz hoje: aprovado a partir
 *     de 80. Só duas combinações chegam lá: 9 "Sim" (90), ou 8 "Sim" + 1 "N/A"
 *     (80). É rígido, e pode ser intencional numa inspeção de recebimento.
 *
 * B — PERCENTUAL SOBRE O APLICÁVEL. Ignora os "N/A" e mede conformidade:
 *     `soma_sim / (total_sim + total_nao)`. Resolve o efeito colateral de "N/A"
 *     valer 0, que hoje faz uma pergunta não aplicável pesar como meio erro —
 *     um checklist sem nenhum problema mas com 4 "N/A" tira 50.
 *
 * O critério ativo é escolhido em `CRITERIO_ATIVO`, uma linha. Mudar de A para
 * B muda o que aparece em todas as telas de uma vez, que é o objetivo.
 *
 * >>> AS FAIXAS DE B AINDA NÃO FORAM CONFIRMADAS PELA QUALIDADE. <<<
 * Os valores abaixo (90% / 70%) são os propostos e estão aqui para a regra
 * poder ser testada, não para entrar em produção sem aprovação.
 */

/** Pontuação de cada resposta, igual à da trigger no banco. */
export const PONTOS = { Sim: 10, 'Não': -10, 'N/A': 0 };

/** Quantas perguntas o checklist tem. */
export const TOTAL_PERGUNTAS = 9;

/** Limites teóricos de `nota_final`. */
export const NOTA_MINIMA = -90;
export const NOTA_MAXIMA = 90;

export const CRITERIOS = {
  // A: pontos absolutos — o comportamento de hoje.
  PONTOS: {
    id: 'PONTOS',
    descricao: 'Pontos absolutos: aprovado a partir de 80 (de um máximo de 90)',
    aprovadoMin: 80,
    atencaoMin: 0,
  },
  // B: percentual sobre o aplicável — proposto, faixas a confirmar.
  PERCENTUAL: {
    id: 'PERCENTUAL',
    descricao: 'Percentual sobre o aplicável, ignorando "N/A"',
    aprovadoMin: 90,
    atencaoMin: 70,
  },
};

/**
 * Critério em uso.
 *
 * Está em PONTOS de propósito: é o comportamento atual, e trocar o critério é
 * decisão de negócio, não de refatoração. Esta troca de uma linha é o que o
 * item (a) da fase V1 entrega.
 */
export const CRITERIO_ATIVO = CRITERIOS.PONTOS;

export const CLASSIFICACAO = {
  APROVADO: 'APROVADO',
  ATENCAO: 'ATENCAO',
  REPROVADO: 'REPROVADO',
  SEM_NOTA: 'SEM_NOTA',
};

/**
 * Percentual de conformidade sobre o que era aplicável.
 * Devolve null quando nenhuma pergunta era aplicável (todas "N/A") — nesse
 * caso não há conformidade a medir, e dividir daria divisão por zero.
 */
export function percentualConformidade(checklist) {
  if (!checklist) return null;
  const sim = Number(checklist.total_sim ?? 0);
  const nao = Number(checklist.total_nao ?? 0);
  const aplicaveis = sim + nao;
  if (aplicaveis <= 0) return null;
  return Math.round((sim / aplicaveis) * 100);
}

/**
 * Classifica um checklist. Aceita o registro inteiro ou só a nota.
 * @returns {'APROVADO'|'ATENCAO'|'REPROVADO'|'SEM_NOTA'}
 */
export function classificar(checklistOuNota, criterio = CRITERIO_ATIVO) {
  const ehObjeto = checklistOuNota !== null
    && typeof checklistOuNota === 'object';
  const checklist = ehObjeto ? checklistOuNota : null;
  const nota = ehObjeto ? checklistOuNota.nota_final : checklistOuNota;

  if (nota === null || nota === undefined || Number.isNaN(Number(nota))) {
    return CLASSIFICACAO.SEM_NOTA;
  }

  let valor;
  if (criterio.id === 'PERCENTUAL') {
    // Sem o registro inteiro não dá para calcular percentual: faltam
    // total_sim e total_nao. Cai para a nota, em vez de inventar um número.
    valor = checklist ? percentualConformidade(checklist) : null;
    if (valor === null) return CLASSIFICACAO.SEM_NOTA;
  } else {
    valor = Number(nota);
  }

  if (valor >= criterio.aprovadoMin) return CLASSIFICACAO.APROVADO;
  if (valor >= criterio.atencaoMin) return CLASSIFICACAO.ATENCAO;
  return CLASSIFICACAO.REPROVADO;
}

/** Texto para a tela. */
export function rotulo(checklistOuNota, criterio = CRITERIO_ATIVO) {
  return {
    APROVADO: 'Aprovado',
    ATENCAO: 'Atenção',
    REPROVADO: 'Reprovado',
    SEM_NOTA: '—',
  }[classificar(checklistOuNota, criterio)];
}

/**
 * Classes de cor do texto. Os quatro estados existem SEMPRE — foi a falta do
 * ramo vermelho que fez a TV mostrar nota negativa em amarelo.
 */
export function corTexto(checklistOuNota, criterio = CRITERIO_ATIVO) {
  return {
    APROVADO: 'text-green-700',
    ATENCAO: 'text-yellow-700',
    REPROVADO: 'text-red-700',
    SEM_NOTA: 'text-slate-500',
  }[classificar(checklistOuNota, criterio)];
}

/** Classes de selo (fundo + texto + borda). */
export function corSelo(checklistOuNota, criterio = CRITERIO_ATIVO) {
  return {
    APROVADO: 'bg-green-100 text-green-700 border-green-200',
    ATENCAO: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    REPROVADO: 'bg-red-100 text-red-700 border-red-200',
    SEM_NOTA: 'bg-slate-100 text-slate-600 border-slate-200',
  }[classificar(checklistOuNota, criterio)];
}

/** Classes de caixa (fundo claro + borda), usadas nos blocos de destaque. */
export function corCaixa(checklistOuNota, criterio = CRITERIO_ATIVO) {
  return {
    APROVADO: 'bg-green-50 border-green-300',
    ATENCAO: 'bg-yellow-50 border-yellow-300',
    REPROVADO: 'bg-red-50 border-red-300',
    SEM_NOTA: 'bg-slate-50 border-slate-200',
  }[classificar(checklistOuNota, criterio)];
}

/** Nome de cor simples, para componentes que recebem "green"/"yellow"/"red". */
export function corNome(checklistOuNota, criterio = CRITERIO_ATIVO) {
  return {
    APROVADO: 'green',
    ATENCAO: 'yellow',
    REPROVADO: 'red',
    SEM_NOTA: 'slate',
  }[classificar(checklistOuNota, criterio)];
}

/** Conta quantos caem em cada faixa. Útil para gráfico e painel. */
export function contarPorFaixa(checklists = [], criterio = CRITERIO_ATIVO) {
  const r = { APROVADO: 0, ATENCAO: 0, REPROVADO: 0, SEM_NOTA: 0 };
  for (const c of checklists) r[classificar(c, criterio)] += 1;
  return r;
}
