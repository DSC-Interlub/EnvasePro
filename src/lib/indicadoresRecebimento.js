/**
 * Os indicadores de recebimento num período — no formato que a RPC
 * `public.indicadores_recebimento(de, ate)` devolve.
 *
 * As contas são as que viviam em src/pages/IndicadoresRecebimento.jsx. Mudou
 * só o declarado na migration 20261019000005_indicadores_recebimento.sql:
 * "Nacional" entra no tempo médio por tipo (era omitido), desempates em ordem
 * alfabética, nomes e tipos ausentes com rótulo em vez de "null".
 *
 * É também o RECUO, quando a função não existe no banco. O teste
 * scripts/test-indicadores-recebimento.mjs exige o mesmo objeto da RPC.
 *
 * O CHECKLIST não está aqui de propósito: as faixas de nota moram em
 * src/lib/checklist.js e não podem ser copiadas para o SQL (duas verdades
 * sobre o mesmo checklist). Ele continua calculado no navegador.
 */

/** Na ordem do enum tipo_recebimento. */
export const TIPOS_RECEBIMENTO = ["Importação", "Nacional", "Devolução", "Material auxiliar", "Outro"];

const porNome = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const contar = (lista, chave) => {
  const m = new Map();
  for (const x of lista) m.set(chave(x), (m.get(chave(x)) || 0) + 1);
  return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => porNome(a.name, b.name));
};
const media = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

/** A data que vale para o período: a de chegada, senão a prevista. */
export const dataDoRecebimento = (r) => r.data_chegada || r.data_prevista || "";

/**
 * @param {object} p
 * @param {string} p.de, p.ate
 * @param {object[]} p.recebimentos  recebimentos cuja data (chegada ou prevista) está no período
 * @param {object[]} p.participantes recebimento_participantes desses recebimentos
 * @param {object[]} p.ocorrencias   recebimento_ocorrencias desses recebimentos
 */
export function calcularIndicadoresRecebimento({ de, ate, recebimentos, participantes, ocorrencias }) {
  const filtrados = recebimentos.filter((r) => {
    const d = dataDoRecebimento(r);
    return d >= de && d <= ate;
  });
  const ids = new Set(filtrados.map((r) => r.id));
  const concluidos = filtrados.filter((r) => r.status === "Concluído" && r.tempo_produtivo_minutos != null);
  const min = (v) => Number(v) || 0;

  const porDia = new Map();
  for (const r of filtrados) {
    const d = dataDoRecebimento(r);
    if (d) porDia.set(d, (porDia.get(d) || 0) + 1);
  }

  const equipe = new Map();
  for (const p of participantes) {
    if (!ids.has(p.recebimento_id)) continue;
    const nome = p.operator_nome || "Sem nome";
    equipe.set(nome, (equipe.get(nome) || 0) + 1);
  }
  const ocorr = ocorrencias.filter((o) => ids.has(o.recebimento_id));

  return {
    de, ate,
    total: filtrados.length,
    concluidos: filtrados.filter((r) => r.status === "Concluído").length,
    em_andamento: filtrados.filter((r) => r.status === "Em andamento").length,
    cancelados: filtrados.filter((r) => r.status === "Cancelado").length,
    por_tipo: contar(filtrados, (r) => r.tipo || "Sem tipo"),
    por_dia: [...porDia].sort(([a], [b]) => porNome(a, b)).map(([dia, total]) => ({ dia, total })),
    tempo: {
      medio: media(concluidos.map((r) => min(r.tempo_produtivo_minutos))),
      produtivo_total: filtrados.reduce((s, r) => s + min(r.tempo_produtivo_minutos), 0),
      pausado_total: filtrados.reduce((s, r) => s + min(r.tempo_pausado_minutos), 0),
      base: concluidos.length,
      por_tipo: TIPOS_RECEBIMENTO.map((tipo) => {
        const deste = concluidos.filter((r) => r.tipo === tipo);
        return { tipo, media: media(deste.map((r) => min(r.tempo_produtivo_minutos))), total: deste.length };
      }),
    },
    ocorrencias: {
      total: ocorr.length,
      abertas: ocorr.filter((o) => !o.resolvido).length,
      resolvidas: ocorr.filter((o) => o.resolvido).length,
      por_tipo: contar(ocorr, (o) => o.tipo || "Sem tipo"),
    },
    equipe: [...equipe].map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => (b.total - a.total) || porNome(a.nome, b.nome)).slice(0, 8),
    calculado_no: "navegador",
  };
}
