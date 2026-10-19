/**
 * Metas diárias — a regra de "meta vigente", igual à de
 * `public.metas_do_dia(dia)` (migration 20261019000006_metas_diarias.sql).
 *
 * Decidido pelo dono em 19/10/2026:
 *  - envase tem DUAS metas (unidades produzidas e envases concluídos), uma
 *    por sala; check-out (pedidos concluídos) e empilhadeira (linhas
 *    concluídas) têm uma cada;
 *  - a meta é um valor fixo que vale a partir de uma data, até ser trocada; o
 *    histórico fica, para dias passados usarem a meta da época.
 *
 * Meta vigente num dia = a linha de vigente_desde mais recente que não seja
 * posterior ao dia. Sem linha, a meta é null — e as telas mostram o que
 * mostravam antes de existir meta.
 *
 * Sem dependências: roda no navegador e no Node.
 */

/** Tudo o que pode ter meta, na ordem em que a tela de metas mostra. */
export const ITENS_META = [
  { modulo: "envase", indicador: "unidades", sala: "Bio", rotulo: "Envase · unidades · Sala Bio", unidade: "un." },
  { modulo: "envase", indicador: "unidades", sala: "Industrial", rotulo: "Envase · unidades · Sala Industrial", unidade: "un." },
  { modulo: "envase", indicador: "envases", sala: "Bio", rotulo: "Envase · envases concluídos · Sala Bio", unidade: "envases" },
  { modulo: "envase", indicador: "envases", sala: "Industrial", rotulo: "Envase · envases concluídos · Sala Industrial", unidade: "envases" },
  { modulo: "checkout", indicador: "pedidos", sala: null, rotulo: "Check-out · pedidos concluídos", unidade: "pedidos" },
  { modulo: "empilhadeira", indicador: "linhas", sala: null, rotulo: "Empilhadeira · linhas concluídas", unidade: "linhas" },
];

export const chaveMeta = (x) => `${x.modulo}|${x.indicador}|${x.sala ?? ""}`;

/** A linha vigente de cada item em `dia` ("AAAA-MM-DD"), ou undefined. */
export function vigentes(linhas, dia) {
  const melhor = new Map();
  for (const l of linhas) {
    if (!l.vigente_desde || l.vigente_desde > dia) continue;
    const k = chaveMeta(l);
    const atual = melhor.get(k);
    if (!atual || l.vigente_desde > atual.vigente_desde) melhor.set(k, l);
  }
  return melhor;
}

/** O objeto que a RPC devolve: valores ou null. */
export function metasDoDia(linhas, dia) {
  const v = vigentes(linhas, dia);
  const valor = (modulo, indicador, sala = null) => {
    const l = v.get(chaveMeta({ modulo, indicador, sala }));
    return l ? Number(l.valor) : null;
  };
  return {
    envase: {
      unidades: { Bio: valor("envase", "unidades", "Bio"), Industrial: valor("envase", "unidades", "Industrial") },
      envases: { Bio: valor("envase", "envases", "Bio"), Industrial: valor("envase", "envases", "Industrial") },
    },
    checkout: { pedidos: valor("checkout", "pedidos") },
    empilhadeira: { linhas: valor("empilhadeira", "linhas") },
  };
}

/** Soma as metas das duas salas; null se nenhuma das duas tem meta. */
export function somaSalas(porSala) {
  const vs = [porSala?.Bio, porSala?.Industrial].filter((x) => x != null);
  return vs.length ? vs.reduce((a, b) => a + Number(b), 0) : null;
}
