/**
 * O painel da TV principal — no formato que a RPC `public.painel_televisao()`
 * devolve. É o RECUO para quando a função ainda não existe no banco (ver
 * src/lib/painelEmpilha.js, que segue a mesma ideia).
 *
 * As regras e as quatro correções estão documentadas na migration
 * 20261019000002_painel_televisao.sql. O teste
 * scripts/test-painel-televisao.mjs exige que esta função e a RPC devolvam o
 * mesmo objeto.
 *
 * Sem dependências: roda no navegador e no Node.
 */
import { TETO_OPERACOES } from "./painelEmpilha.js";

const soma = (lista) => lista.reduce((s, r) => s + (Number(r.quantidade_produzida) || 0), 0);
const porId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const instante = (t) => (t ? Date.parse(t) : 0);

/**
 * @param {object} p
 * @param {string} p.dia            "AAAA-MM-DD", o dia de Brasília
 * @param {object[]} p.envaseHoje   envase_records com data = dia
 * @param {object[]} p.envaseMes    envase_records do mês (sala, quantidade_produzida, codigo_produto)
 * @param {object[]} p.checkoutHoje checkout_itens das programações do dia
 * @param {object[]} p.produtos     products (codigo, categoria, halal, kosher, nsf_3h, nsf_h1)
 * @param {object}   p.painelEmpilha o resultado de calcularPainelEmpilha / da RPC de empilhadeira
 * @param {object[]} p.paradasHoje  empilhadeira_paradas com data = dia
 * @param {object[]} p.empilhadeiras empilhadeira_configs
 */
export function calcularPainelTelevisao({
  dia, envaseHoje, envaseMes, checkoutHoje, produtos, painelEmpilha, paradasHoje, empilhadeiras,
}) {
  const produto = new Map(produtos.map((p) => [p.codigo, p]));

  const envaseAtivo = envaseHoje.filter((r) => r.inicio
    && (r.sala === "Bio" ? r.material_retirado !== true : r.termino == null));
  const opsEnvase = [...envaseAtivo]
    .sort((a, b) => (instante(b.updated_at) - instante(a.updated_at)) || porId(a, b))
    .slice(0, TETO_OPERACOES)
    .map((r) => {
      const pr = produto.get(r.codigo_produto) || {};
      return {
        id: r.id, sala: r.sala ?? null, op: r.op ?? null, operador: r.operador ?? null,
        operator_id: r.operator_id ?? null, codigo_produto: r.codigo_produto ?? null,
        descricao_produto: r.descricao_produto ?? null,
        quantidade_produzida: r.quantidade_produzida ?? null,
        inicio: r.inicio ?? null, termino: r.termino ?? null,
        material_retirado: r.material_retirado ?? null,
        halal: !!pr.halal, kosher: !!pr.kosher, nsf_3h: !!pr.nsf_3h, nsf_h1: !!pr.nsf_h1,
        atualizado: r.updated_at ?? null,
      };
    });

  const checkoutAtivo = checkoutHoje.filter((i) =>
    i.hora_inicio && i.hora_termino == null && i.status === "Em Andamento");
  const opsCheckout = [...checkoutAtivo]
    .sort((a, b) => String(b.hora_inicio).localeCompare(String(a.hora_inicio)) || porId(a, b))
    .slice(0, TETO_OPERACOES)
    .map((i) => ({
      id: i.id, numero_pedido: i.numero_pedido ?? null, cliente: i.cliente ?? null,
      data_entrega: i.data_entrega ?? null, critico: i.critico ?? null,
      operador: i.operador ?? null, operator_id: i.operator_id ?? null, hora_inicio: i.hora_inicio ?? null,
    }));

  const ativa = [...empilhadeiras].filter((e) => e.ativa === true)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];

  const categoria = (r) => produto.get(r.codigo_produto)?.categoria;
  const bio = envaseMes.filter((r) => r.sala === "Bio");
  const ind = envaseMes.filter((r) => r.sala === "Industrial");

  return {
    dia,
    envase: {
      producao_dia: soma(envaseHoje),
      concluidos: envaseHoje.filter((r) => r.termino != null).length,
      lancados: envaseHoje.filter((r) => r.inicio != null || r.termino != null).length,
      em_andamento: envaseAtivo.length,
      operacoes: opsEnvase,
    },
    checkout: {
      total_dia: checkoutHoje.length,
      concluidos: checkoutHoje.filter((i) => i.status === "Concluído").length,
      pendentes: checkoutHoje.filter((i) => i.status !== "Concluído").length,
      em_andamento: checkoutAtivo.length,
      criticos: checkoutAtivo.filter((i) => i.critico === true).length,
      operacoes: opsCheckout,
    },
    empilha: {
      ...painelEmpilha,
      parada_ativa: paradasHoje.some((p) => p.hora_fim == null),
      empilhadeira: ativa ? { nome: ativa.nome ?? null, data_proxima_manutencao: ativa.data_proxima_manutencao ?? null } : null,
    },
    mes: {
      total: soma(envaseMes),
      bio: soma(bio),
      industrial: soma(ind),
      registros: envaseMes.length,
      bio_registros: bio.length,
      industrial_registros: ind.length,
      oleo: soma(envaseMes.filter((r) => categoria(r) === "Óleo")),
      graxa: soma(envaseMes.filter((r) => categoria(r) === "Graxa")),
      pasta: soma(envaseMes.filter((r) => categoria(r) === "Pasta")),
    },
    calculado_no: "navegador",
  };
}

/** Primeiro e último dia (exclusivo) do mês de `dia`, "AAAA-MM-DD". */
export function limitesDoMes(dia) {
  const [a, m] = dia.split("-").map(Number);
  const proximo = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  return { inicio: `${dia.slice(0, 7)}-01`, fim: proximo };
}
