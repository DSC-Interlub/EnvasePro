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

/**
 * O dia de HOJE aqui, como "AAAA-MM-DD", para comparar com colunas `date`.
 *
 * POR QUE NÃO `toISOString().split('T')[0]`
 *
 * `toISOString()` devolve **UTC**. Em fuso negativo como o do Brasil (UTC-3),
 * das 21h à meia-noite o UTC já virou o dia: às 21h de 9/10, ele responde
 * "2026-10-10". Quem usa isso como "hoje" passa três horas por dia olhando
 * para amanhã.
 *
 * Não é teórico. No gráfico dos últimos 7 dias do painel, o RÓTULO da barra
 * vinha de `toLocaleDateString` (local) e o DADO vinha de `toISOString`
 * (UTC): depois das 21h os dois apontavam para dias diferentes, a produção
 * do dia caía na barra errada e a última barra ficava zerada.
 *
 * Esta função usa os componentes LOCAIS da data, que é o dia que o operador
 * tem no relógio. É o mesmo dia que a função `contadores_do_menu()` usa no
 * banco, lá via `(now() AT TIME ZONE 'America/Sao_Paulo')::date`.
 *
 * @param {Date} [quando] usado nos testes para simular um instante
 */
export function diaLocal(quando = new Date()) {
  const ano = quando.getFullYear();
  const mes = String(quando.getMonth() + 1).padStart(2, '0');
  const dia = String(quando.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}
