/**
 * src/lib/datas.js — formatação de datas à prova de valor nulo ou inválido.
 *
 * POR QUE ISTO EXISTE
 *
 * O padrão espalhado pelo código era:
 *
 *   format(new Date(valor + 'T00:00:00'), "dd/MM/yyyy")
 *
 * Quando `valor` é null, a concatenação produz a string "nullT00:00:00", que
 * vira uma Data Inválida, e o date-fns lança `RangeError: Invalid time value`.
 * Como isso acontece durante o render, o React desmonta a árvore inteira e a
 * PÁGINA FICA EM BRANCO — não é um campo vazio, é a tela toda que some.
 *
 * Não é hipotético: em 07/10/2026 um item de check-out sem `data_entrega`
 * (coluna anulável) apagava a tela de check-out inteira. Foi encontrado pelos
 * testes de interface da Fase 3.
 *
 * O sufixo 'T00:00:00' existe de propósito: sem ele, `new Date('2026-10-07')`
 * é interpretado como UTC e, em fuso negativo como o do Brasil, a data exibida
 * volta um dia. Com o sufixo, é interpretada como horário local.
 */

import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Converte um valor do banco em Date, ou null se não der.
 * Aceita "AAAA-MM-DD", ISO completo e objetos Date.
 */
export function paraData(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return isValid(valor) ? valor : null;
  if (typeof valor !== 'string') return null;

  const texto = valor.trim();
  if (!texto) return null;

  // Data pura ("AAAA-MM-DD") recebe o horário local para não voltar um dia.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(texto)
    ? new Date(`${texto}T00:00:00`)
    : new Date(texto);

  return isValid(d) ? d : null;
}

/**
 * Formata uma data com segurança.
 * @param {*} valor      valor vindo do banco
 * @param {string} forma padrão do date-fns (default "dd/MM/yyyy")
 * @param {string} vazio texto devolvido quando não há data válida
 */
export function formatarData(valor, forma = 'dd/MM/yyyy', vazio = '—') {
  const d = paraData(valor);
  if (!d) return vazio;
  return format(d, forma, { locale: ptBR });
}

/** Data por extenso, ex.: "quarta-feira, 7 de outubro de 2026". */
export function formatarDataExtenso(valor, vazio = '—') {
  return formatarData(valor, "EEEE, d 'de' MMMM 'de' yyyy", vazio);
}

/** Competência "AAAA-MM", usada nos agrupamentos por mês. */
export function competenciaMes(valor, vazio = '') {
  return formatarData(valor, 'yyyy-MM', vazio);
}

/**
 * Comparação segura: devolve null quando a data não é válida, para que quem
 * chama decida (filtrar fora, ignorar) em vez de comparar com NaN — comparar
 * com NaN é sempre falso e some com a linha sem avisar.
 */
export function tempoDe(valor) {
  const d = paraData(valor);
  return d ? d.getTime() : null;
}
