// Regras da importação Base44 → Supabase: ordem, protocolos, pares nome→id,
// conversão de tipos. Sem acesso a banco nem a disco: só funções puras, para
// poderem ser testadas isoladamente.
import crypto from 'node:crypto';

// Ordem de carga (pais antes dos filhos — chaves estrangeiras).
export const ENTIDADES = [
  ['Product', 'products'],
  ['Embalagem', 'embalagens'],
  ['Operator', 'operators'],
  ['SapPedido', 'sap_pedidos'],
  ['EmpilhadeiraConfig', 'empilhadeira_configs'],
  ['RecebimentoFornecedor', 'recebimento_fornecedores'],
  ['LimpezaLocal', 'limpeza_locais'],
  ['CheckoutProgramacao', 'checkout_programacoes'],
  ['CheckoutItem', 'checkout_itens'],
  ['EnvaseRecord', 'envase_records'],
  ['EmpilhaProgramacao', 'empilha_programacoes'],
  ['EmpilhaLinha', 'empilha_linhas'],
  ['EmpilhaOcorrencia', 'empilha_ocorrencias'],
  ['EmpilhadeiraParada', 'empilhadeira_paradas'],
  ['EmpilhadeiraManutencao', 'empilhadeira_manutencoes'],
  ['LimpezaProgramacao', 'limpeza_programacoes'],
  ['Recebimento', 'recebimentos'],
  ['RecebimentoItem', 'recebimento_itens'],
  ['RecebimentoParticipante', 'recebimento_participantes'],
  ['RecebimentoOcorrencia', 'recebimento_ocorrencias'],
  ['ChecklistRecebimento', 'checklist_recebimentos'],
  ['NotaFiscalArquivo', 'nota_fiscal_arquivos'],
];
export const TABELAS = ENTIDADES.map(([, t]) => t);

// Protocolos: a Base44 não tinha. O importador grava explicitamente
// PREFIXO-AAAA-NNNNNN, com AAAA = ano de criação do registro (Brasília) e
// NNNNNN = ordem cronológica de criação, única na tabela. Depois da carga a
// sequence vai para o maior NNNNNN, e o próximo registro novo recebe +1.
export const PROTOCOLOS = {
  envase_records: { coluna: 'protocolo', prefixo: 'ENV', sequence: 'seq_envase_protocolo' },
  checkout_programacoes: { coluna: 'codigo_programacao', prefixo: 'CKO', sequence: 'seq_checkout_prog' },
  empilha_programacoes: { coluna: 'codigo_programacao', prefixo: 'EMP', sequence: 'seq_empilha_prog' },
  recebimentos: { coluna: 'protocolo_recebimento', prefixo: 'REC', sequence: 'seq_recebimento_protocolo' },
  checklist_recebimentos: { coluna: 'numero_checklist', prefixo: 'CHK', sequence: 'seq_checklist_recebimento' },
  nota_fiscal_arquivos: { coluna: 'protocolo_arquivo', prefixo: 'NFA', sequence: 'seq_nf_arquivo_protocolo' },
};

// Na Base44 o operador era guardado só pelo NOME; no banco novo há também o id.
// [coluna do nome, coluna do id]. O id é resolvido pelo cadastro de operadores.
export const PARES_OPERADOR = {
  envase_records: [['operador', 'operator_id']],
  checkout_itens: [['operador', 'operator_id']],
  empilha_programacoes: [['criado_por', 'criado_por_id']],
  empilha_linhas: [['operador_empilhadeira', 'operador_empilhadeira_id'], ['operador_ajudante', 'operador_ajudante_id']],
  empilha_ocorrencias: [['registrado_por', 'registrado_por_id']],
  empilhadeira_paradas: [['registrado_por', 'registrado_por_id']],
  limpeza_programacoes: [['criado_por', 'criado_por_id']],
  recebimento_ocorrencias: [['registrado_por', 'registrado_por_id']],
  nota_fiscal_arquivos: [['arquivado_por_nome', 'arquivado_por_id']],
  // checklist_recebimentos.criado_por_nome guarda a CONTA (operacoes.equipe,
  // pcp-brasil), não um operador: criado_por_id fica vazio, de propósito.
};

// Campos de controle da Base44 que não têm destino (contas não são importadas).
export const CAMPOS_SEM_DESTINO = new Set(['created_by', 'created_by_id', 'is_sample']);

// Id da Base44 (24 hex) → uuid determinístico. O MESMO id gera o MESMO uuid em
// toda carga: as referências entre tabelas se preservam e a reimportação no
// go-live produz os mesmos ids.
export function idBase44ParaUuid(id) {
  const s = String(id).trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) return s;
  if (/^[0-9a-f]{24}$/.test(s)) return `00000000-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 24)}`;
  return null;
}

// Uuid para registro CRIADO pela importação (ex.: operador histórico), estável.
export function uuidDerivado(chave) {
  const h = crypto.createHash('sha256').update(`importacao-base44:${chave}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const normalizarNome = (n) => String(n ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

// Data/hora da Base44 sem fuso é UTC (medido: em 97% dos envases o created_date
// em UTC bate com a hora de início em Brasília).
export function instanteBase44(v) {
  if (v === '' || v == null) return null;
  const s = String(v).trim();
  const comFuso = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}Z`;
  const d = new Date(comFuso);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export const diaEmBrasilia = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

// Apóstrofo que o exportador põe antes de valores que começam com - = + @
// (proteção contra fórmula em planilha), ex.: '-0:-30.
export const temApostrofoExportador = (v) => typeof v === 'string' && /^'[-=+@]/.test(v);

/**
 * Converte um valor do CSV para o tipo da coluna. Devolve { valor } ou { erro }.
 * '' vira NULL em qualquer tipo. Nunca "conserta" valor: o que não converte é erro.
 */
export function converter(bruto, col) {
  if (bruto === '' || bruto == null) return { valor: null };
  const v = String(bruto);
  switch (col.tipo) {
    case 'uuid': {
      const u = idBase44ParaUuid(v);
      return u ? { valor: u } : { erro: 'id em formato desconhecido' };
    }
    case 'boolean':
      if (v === 'true') return { valor: true };
      if (v === 'false') return { valor: false };
      return { erro: 'booleano diferente de true/false' };
    case 'integer': case 'smallint': case 'bigint': {
      const n = Number(v);
      return Number.isInteger(n) ? { valor: n } : { erro: 'número inteiro inválido' };
    }
    case 'numeric': case 'double precision': case 'real': {
      const n = Number(v);
      return v.trim() !== '' && Number.isFinite(n) ? { valor: n } : { erro: 'número inválido' };
    }
    case 'date': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { erro: 'data fora do formato AAAA-MM-DD' };
      const d = new Date(`${v}T12:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? { valor: v } : { erro: 'data inexistente' };
    }
    case 'time without time zone': {
      const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(v);
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3] || 0) > 59) return { erro: 'hora inválida' };
      return { valor: `${m[1].padStart(2, '0')}:${m[2]}:${m[3] || '00'}` };
    }
    case 'timestamp with time zone': {
      const i = instanteBase44(v);
      return i ? { valor: i } : { erro: 'data/hora inválida' };
    }
    case 'jsonb': case 'json':
      try { return { valor: JSON.parse(v) }; } catch { return { erro: 'JSON inválido' }; }
    case 'ARRAY': {
      try {
        const a = JSON.parse(v);
        if (!Array.isArray(a) || a.some((x) => typeof x !== 'string')) return { erro: 'lista que não é de textos' };
        return { valor: a };
      } catch { return { erro: 'lista em formato inválido' }; }
    }
    case 'USER-DEFINED':
      return col.dominio.includes(v) ? { valor: v } : { erro: `valor fora do domínio (${col.dominio.join(' | ')})` };
    default:
      return { valor: v };
  }
}
