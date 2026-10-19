/**
 * Camada de Dados Nativa Supabase (Drop-in Replacement para o @base44/sdk)
 * 
 * Este adaptador substitui completamente o SDK do Base44, mantendo a interface:
 * base44.entities.<Entity>.(list, filter, get, create, update, delete, bulkCreate, bulkUpdate)
 * base44.functions.*
 * base44.integrations.Core.UploadFile
 * base44.auth.*
 * 
 * Principais Regras e Lições do TechControl:
 * - Paginação real com PostgREST (supera o limite de 1000 linhas via .range() automático).
 * - Conversão de strings vazias em campos de data/hora para NULL (Lição 6).
 * - Resolução e injeção transparente de operator_id via UUID (Lição 3).
 * - Aliases bidirecionais created_at <-> created_date e updated_at <-> updated_date.
 */

import { supabase } from '../lib/supabaseClient.js';
import { validarUpload, tipoRealDoArquivo, ErroDeUpload, mensagemDeErroSegura, registrarErro } from '@/lib/uploadSeguro';
import { executarComRenovacao as repetirSeSessao } from '@/lib/sessaoRetry';
import { calcularPainelEmpilha, hojeEmBrasilia } from '@/lib/painelEmpilha';
import { calcularPainelTelevisao, limitesDoMes } from '@/lib/painelTelevisao';
import { calcularPainelGeral, limitesDaSemana } from '@/lib/painelGeral';
import { calcularIndicadoresEmpilha } from '@/lib/indicadoresEmpilha';
import { calcularIndicadoresRecebimento } from '@/lib/indicadoresRecebimento';
import { metasDoDia } from '@/lib/metas';

/**
 * Colunas que sao chave estrangeira de TEXTO (referenciam `products.codigo`,
 * `embalagens.codigo`). Vazio nelas tem de virar NULL.
 */
const FKS_DE_TEXTO = new Set([
  'codigo_produto',
  'codigo_embalagem',
  'produto_codigo',
]);

const TABELAS_MAPEAMENTO = {
  Product: 'products',
  Embalagem: 'embalagens',
  Operator: 'operators',
  EnvaseRecord: 'envase_records',
  CheckoutProgramacao: 'checkout_programacoes',
  CheckoutItem: 'checkout_itens',
  EmpilhadeiraConfig: 'empilhadeira_configs',
  EmpilhaProgramacao: 'empilha_programacoes',
  EmpilhaLinha: 'empilha_linhas',
  EmpilhaOcorrencia: 'empilha_ocorrencias',
  EmpilhadeiraParada: 'empilhadeira_paradas',
  EmpilhadeiraManutencao: 'empilhadeira_manutencoes',
  LimpezaLocal: 'limpeza_locais',
  LimpezaProgramacao: 'limpeza_programacoes',
  RecebimentoFornecedor: 'recebimento_fornecedores',
  Recebimento: 'recebimentos',
  RecebimentoItem: 'recebimento_itens',
  RecebimentoParticipante: 'recebimento_participantes',
  RecebimentoOcorrencia: 'recebimento_ocorrencias',
  SapPedido: 'sap_pedidos',
  ChecklistRecebimento: 'checklist_recebimentos',
  NotaFiscalArquivo: 'nota_fiscal_arquivos',
  User: 'user_profiles',
  NotificacaoDestinatario: 'notificacao_destinatarios'
};

// Cache de operadores para resolução rápida de operator_id
let cacheOperadores = null;
let cacheOperadoresTimestamp = 0;

async function obterMapaOperadores() {
  const agora = Date.now();
  if (cacheOperadores && (agora - cacheOperadoresTimestamp < 60000)) {
    return cacheOperadores;
  }
  const { data } = await supabase.from('operators').select('id, nome, ativo');
  const mapa = new Map();
  if (data) {
    // Conta quantos operadores existem por nome normalizado ANTES de montar o mapa.
    // Nome repetido torna a resolucao por nome ambigua: 'mapa.set' sobrescrevia em
    // silencio e atribuia um id arbitrario, que e o errado em 12 de 13 casos quando
    // ha homonimos (hoje existem 13 'Operador Teste Funcional QA' em producao).
    const contagem = new Map();
    const normalizar = (nome) =>
      nome.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    data.forEach(op => {
      if (op.nome) {
        const norm = normalizar(op.nome);
        contagem.set(norm, (contagem.get(norm) || 0) + 1);
      }
    });

    data.forEach(op => {
      if (!op.nome) return;
      const norm = normalizar(op.nome);
      if (contagem.get(norm) > 1) {
        // Ambiguo: NAO resolve. Prefere falhar de forma visivel (coluna fica nula e
        // o CHECK do banco recusa) a gravar a autoria da pessoa errada em silencio.
        if (!mapa.has(norm)) {
          console.warn(
            `[base44Client] Nome de operador ambiguo ("${op.nome}": ${contagem.get(norm)} cadastros). ` +
            'Resolucao por nome desativada para ele; envie operator_id direto do select.'
          );
          mapa.set(norm, null);
        }
        return;
      }
      mapa.set(norm, op);
    });
  }
  cacheOperadores = mapa;
  cacheOperadoresTimestamp = agora;
  return mapa;
}

function obterOperadorAtivoLocalStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('envase_current_operator');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Normaliza os dados antes de gravar no banco:
 * - Datas e horários com string vazia "" viram NULL (Lição 6).
 * - Remove campos gerenciados pelo banco (created_date, updated_date).
 * - Injeta operator_id quando necessário (Lição 3).
 */
async function sanitizarPayload(tabela, data, isCreate = false) {
  if (!data || typeof data !== 'object') return data;
  const clone = { ...data };

  // Remove aliases de data do Base44 para não quebrar insert
  delete clone.created_date;
  delete clone.updated_date;

  // Converte strings vazias em datas/horas para null (Lição 6)
  for (const [key, val] of Object.entries(clone)) {
    if (typeof val === 'string' && val.trim() === '') {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('data') ||
        lowerKey.includes('vencimento') ||
        lowerKey.includes('datetime') ||
        lowerKey.includes('inicio') ||
        lowerKey.includes('termino') ||
        lowerKey.includes('hora') ||
        lowerKey.includes('created_at') ||
        lowerKey.includes('updated_at') ||
        lowerKey.endsWith('_id') ||
        lowerKey === 'id' ||
        // Chaves estrangeiras de TEXTO. String vazia NAO e "em branco" para o
        // Postgres: e um valor, e como '' nao existe em `products` nem em
        // `embalagens`, o insert morre com 23503 ("Key is not present in
        // table"), que o PostgREST devolve como HTTP 409.
        //
        // Era o que fazia o autosave do envase falhar EM SILENCIO (so no
        // console) sempre que os 4 ultimos digitos do produto nao casavam com
        // embalagem nenhuma do cadastro: o rascunho nunca chegava ao banco e o
        // operador so descobria ao tentar finalizar. Encontrado pelo
        // test-envase-m2 em 15/10/2026.
        FKS_DE_TEXTO.has(lowerKey)
      ) {
        clone[key] = null;
      }
    }
  }

  // Resolução de operador para tabelas operacionais (Lição 3)
  // Regra: Em create(), injeta o operador ativo de localStorage se não fornecido.
  // Em update(), NÃO injeta de localStorage (não altera autoria por acidente),
  // MAS NÃO apaga valores que o usuário enviou explicitamente (permite atribuição manual/edição legítima).
  if (tabela === 'envase_records' || tabela === 'checkout_itens') {
    if (isCreate) {
      if (!clone.operator_id) {
        const operadorAtivo = obterOperadorAtivoLocalStorage();
        if (operadorAtivo && operadorAtivo.id) {
          clone.operator_id = operadorAtivo.id;
          if (!clone.operador) clone.operador = operadorAtivo.nome;
        } else if (clone.operador) {
          const mapa = await obterMapaOperadores();
          const norm = clone.operador.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const encontrado = mapa.get(norm);
          if (encontrado) {
            clone.operator_id = encontrado.id;
          }
        }
      }
    } else {
      // Em update(): NÃO injeta de localStorage, mas se o usuário enviou 'operador' e não 'operator_id',
      // resolve o operator_id correspondente para manter integridade com as FKs/CHECKs
      if (clone.operador && !clone.operator_id) {
        const mapa = await obterMapaOperadores();
        const norm = clone.operador.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const encontrado = mapa.get(norm);
        if (encontrado) {
          clone.operator_id = encontrado.id;
        }
      }
    }
  }

  // Resolução para empilha_linhas: garantir que operador_empilhadeira_id e operador_ajudante_id sejam preenchidos
  if (tabela === 'empilha_linhas') {
    if (clone.operador_empilhadeira && !clone.operador_empilhadeira_id) {
      const mapa = await obterMapaOperadores();
      const norm = clone.operador_empilhadeira.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const encontrado = mapa.get(norm);
      if (encontrado) {
        clone.operador_empilhadeira_id = encontrado.id;
      }
    }
    if (clone.operador_ajudante && !clone.operador_ajudante_id && clone.operador_ajudante !== 'nenhum') {
      const mapa = await obterMapaOperadores();
      const norm = clone.operador_ajudante.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const encontrado = mapa.get(norm);
      if (encontrado) {
        clone.operador_ajudante_id = encontrado.id;
      }
    }
  }

  return clone;
}

/**
 * Normaliza o registro retornado do Supabase adicionando os aliases
 * esperados pelo frontend (created_date, updated_date).
 */
function normalizarRetorno(item) {
  if (!item || typeof item !== 'object') return item;
  if (Array.isArray(item)) return item.map(normalizarRetorno);
  return {
    ...item,
    created_date: item.created_at,
    updated_date: item.updated_at
  };
}

/**
 * Resolve URLs assinadas para operadores quando o bucket fotos-operadores é privado.
 * Suporta tanto caminhos relativos de arquivo quanto URLs antigas herdadas.
 */
async function resolverFotosOperadores(items) {
  if (!items) return items;
  const isArray = Array.isArray(items);
  const list = isArray ? items : [items];

  const itemsComFoto = list.filter(op => op && op.foto_url);
  if (itemsComFoto.length === 0) return items;

  const paths = itemsComFoto.map(op => {
    let raw = op.foto_url;
    if (raw.includes('/fotos-operadores/')) {
      raw = raw.split('/fotos-operadores/')[1].split('?')[0];
    } else if (raw.startsWith('http')) {
      raw = raw.split('/').pop().split('?')[0];
    }
    return raw;
  });

  try {
    const { data, error } = await supabase.storage
      .from('fotos-operadores')
      .createSignedUrls(paths, 86400); // 24 horas de validade

    if (data && !error) {
      data.forEach((res, i) => {
        if (res.signedUrl && itemsComFoto[i]) {
          itemsComFoto[i].foto_url = res.signedUrl;
        }
      });
    }
  } catch (err) {
    console.warn('Aviso ao resolver URLs assinadas de fotos de operadores:', err);
  }

  return isArray ? list : list[0];
}

/**
 * Converte string de ordenação no formato Base44 ("-data" ou "nome")
 * para parâmetros do Supabase { column, ascending }.
 */
function parseOrderBy(orderBy) {
  if (!orderBy || typeof orderBy !== 'string') return null;
  const isDesc = orderBy.startsWith('-');
  let col = isDesc ? orderBy.slice(1) : orderBy;
  if (col === 'created_date') col = 'created_at';
  if (col === 'updated_date') col = 'updated_at';
  return { column: col, ascending: !isDesc };
}

/**
 * Cria a interface de CRUD para uma entidade, com suporte a paginação real via .range()
 */
/**
 * Repete UMA vez quando a falha for de sessao. A regra vive em
 * src/lib/sessaoRetry.js; aqui so se injeta COMO renovar a sessao.
 */
const executarComRenovacao = (construir) =>
  repetirSeSessao(construir, () => supabase.auth.refreshSession());

/**
 * A função SQL não existe no banco? (PGRST202: o PostgREST não a encontrou;
 * 42883: existe com outra assinatura.) É o único caso em que as telas de TV
 * recuam para o cálculo no navegador. Falta de permissão (42501) NÃO é: essa
 * tem de aparecer como falha.
 */
const funcaoAusente = (error) => error?.code === 'PGRST202' || error?.code === '42883';

/** Lê todas as páginas de uma consulta (o PostgREST corta em 1.000 linhas). */
async function lerTudo(construir) {
  const linhas = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await executarComRenovacao(() => construir().range(de, de + 999));
    if (error) throw error;
    linhas.push(...data);
    if (data.length < 1000) return linhas;
  }
}

/**
 * As metas vigentes num dia, lidas da tabela (recuo de metas_do_dia). Se a
 * TABELA ainda não existe no banco (o código subiu antes da migration), é o
 * mesmo que não haver meta: as telas mostram o que mostravam antes.
 */
async function metasNoNavegador(dia) {
  const { data, error } = await executarComRenovacao(() => supabase.from('metas_diarias')
    .select('modulo, indicador, sala, valor, vigente_desde').lte('vigente_desde', dia));
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return metasDoDia([], dia);
    throw error;
  }
  return metasDoDia(data, dia);
}

/** O painel da empilhadeira calculado no navegador — recuo das duas TVs. */
async function painelEmpilhaNoNavegador(dia, metas) {
  const progs = await lerTudo(() => supabase.from('empilha_programacoes').select('id').eq('data_programada', dia));
  const ids = progs.map((p) => p.id);
  const [linhas, ocorr] = await Promise.all([
    ids.length ? lerTudo(() => supabase.from('empilha_linhas').select('*').in('programacao_id', ids)) : [],
    lerTudo(() => supabase.from('empilha_ocorrencias').select('tipo, hora, resolvido, created_at').eq('data', dia)),
  ]);
  return calcularPainelEmpilha(linhas, ocorr, dia, metas ?? await metasNoNavegador(dia));
}

function createEntityAdapter(entityName) {
  const table = TABELAS_MAPEAMENTO[entityName] || entityName.toLowerCase();

  return {
    /**
     * Garante que a sessão já foi lida do armazenamento antes de consultar.
     *
     * O supabase-js carrega a sessão de forma assíncrona na inicialização. Uma
     * consulta disparada nessa janela sai SEM o cabeçalho Authorization, como
     * `anon`. Antes isso passava despercebido: `anon` tinha GRANT e o RLS
     * devolvia lista vazia, então a tela só aparecia sem dados. Depois que o
     * `anon` perdeu todos os privilégios (migration 20261007000002), o mesmo
     * caso virou um 401 visível — foi assim que o problema apareceu, de forma
     * intermitente, logo após o login.
     *
     * `getSession()` resolve essa leitura e fica em cache, então o custo é
     * pago uma vez por carregamento de página.
     */
    async aguardarSessao() {
      try {
        await supabase.auth.getSession();
      } catch {
        // Sem sessão o RLS decide; não é este o lugar de tratar login.
      }
    },

    /**
     * Lista registros com ordenação e limite.
     * Se limit for omitido ou > 1000, pagina automaticamente via .range()
     * até trazer a lista completa (Ajuste Obrigatório 1 - Paginação Real).
     */
    async list(orderBy, limit = null) {
      await this.aguardarSessao();
      const sort = parseOrderBy(orderBy);
      const pageSize = 1000;
      let from = 0;
      const allRows = [];

      // Se foi solicitado um limite pequeno (<= 1000), busca diretamente
      if (limit && limit <= pageSize) {
        const { data, error } = await executarComRenovacao(() => {
          let q = supabase.from(table).select('*');
          if (sort) q = q.order(sort.column, { ascending: sort.ascending });
          return q.range(0, limit - 1);
        });
        if (error) throw error;
        const res = normalizarRetorno(data || []);
        return entityName === 'Operator' ? await resolverFotosOperadores(res) : res;
      }

      // Paginação real em lotes de 1000 até exaurir ou atingir o limite
      while (true) {
        const to = limit ? Math.min(from + pageSize - 1, limit - 1) : from + pageSize - 1;
        const { data, error } = await executarComRenovacao(() => {
          let q = supabase.from(table).select('*');
          if (sort) q = q.order(sort.column, { ascending: sort.ascending });
          return q.range(from, to);
        });
        if (error) throw error;
        if (!data || data.length === 0) break;

        allRows.push(...data);
        if (data.length < pageSize || (limit && allRows.length >= limit)) break;
        from += pageSize;
      }

      const res = normalizarRetorno(allRows);
      return entityName === 'Operator' ? await resolverFotosOperadores(res) : res;
    },

    /**
     * Filtra registros com condições, ordenação e suporte à paginação real.
     */
    async filter(conditions = {}, orderBy = null, limit = null) {
      await this.aguardarSessao();
      const sort = parseOrderBy(orderBy);
      const pageSize = 1000;
      let from = 0;
      const allRows = [];

      const aplicarCondicoes = (q) => {
        let builder = q;
        for (const [key, val] of Object.entries(conditions)) {
          if (val === undefined || val === null) continue;
          let dbCol = key;
          if (dbCol === 'created_date') dbCol = 'created_at';
          if (dbCol === 'updated_date') dbCol = 'updated_at';

          if (Array.isArray(val)) {
            builder = builder.in(dbCol, val);
          } else {
            builder = builder.eq(dbCol, val);
          }
        }
        return builder;
      };

      if (limit && limit <= pageSize) {
        let query = supabase.from(table).select('*');
        query = aplicarCondicoes(query);
        if (sort) query = query.order(sort.column, { ascending: sort.ascending });
        query = query.range(0, limit - 1);
        const { data, error } = await query;
        if (error) throw error;
        const res = normalizarRetorno(data || []);
        return entityName === 'Operator' ? await resolverFotosOperadores(res) : res;
      }

      while (true) {
        let query = supabase.from(table).select('*');
        query = aplicarCondicoes(query);
        if (sort) query = query.order(sort.column, { ascending: sort.ascending });

        const to = limit ? Math.min(from + pageSize - 1, limit - 1) : from + pageSize - 1;
        query = query.range(from, to);

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;

        allRows.push(...data);
        if (data.length < pageSize || (limit && allRows.length >= limit)) break;
        from += pageSize;
      }

      const res = normalizarRetorno(allRows);
      return entityName === 'Operator' ? await resolverFotosOperadores(res) : res;
    },

    /**
     * Busca um único registro pelo ID.
     */
    async get(id) {
      await this.aguardarSessao();
      const { data, error } = await executarComRenovacao(() => supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .maybeSingle());

      if (error) throw error;
      const res = normalizarRetorno(data);
      return entityName === 'Operator' ? await resolverFotosOperadores(res) : res;
    },

    /**
     * Cria um novo registro aplicando sanitização de datas e injeção de operator_id.
     */
    async create(data) {
      await this.aguardarSessao();
      const payload = await sanitizarPayload(table, data, true);
      const { data: created, error } = await executarComRenovacao(() => supabase
        .from(table)
        .insert(payload)
        .select()
        .single());

      if (error) throw error;
      const res = normalizarRetorno(created);
      return entityName === 'Operator' ? await resolverFotosOperadores(res) : res;
    },

    /**
     * Atualiza um registro existente pelo ID.
     */
    async update(id, data) {
      await this.aguardarSessao();
      const payload = await sanitizarPayload(table, data, false);
      const { data: updated, error } = await executarComRenovacao(() => supabase
        .from(table)
        .update(payload)
        .eq('id', id)
        .select()
        .single());

      if (error) throw error;
      const res = normalizarRetorno(updated);
      return entityName === 'Operator' ? await resolverFotosOperadores(res) : res;
    },

    /**
     * Remove um registro pelo ID.
     */
    async delete(id) {
      await this.aguardarSessao();
      const { error } = await executarComRenovacao(() => supabase
        .from(table)
        .delete()
        .eq('id', id));

      if (error) throw error;
      return { success: true };
    },

    /**
     * Cria múltiplos registros em lote.
     */
    async bulkCreate(items) {
      if (!items || items.length === 0) return [];
      const sanitized = [];
      for (const item of items) {
        sanitized.push(await sanitizarPayload(table, item, true));
      }

      const chunkSize = 500;
      const results = [];
      for (let i = 0; i < sanitized.length; i += chunkSize) {
        const chunk = sanitized.slice(i, i + chunkSize);
        const { data, error } = await executarComRenovacao(() => supabase
          .from(table)
          .insert(chunk)
          .select());
        if (error) throw error;
        if (data) results.push(...data);
      }
      return normalizarRetorno(results);
    },

    /**
     * Atualiza múltiplos registros via UPSERT.
     */
    async bulkUpdate(items) {
      if (!items || items.length === 0) return [];
      const sanitized = [];
      for (const item of items) {
        sanitized.push(await sanitizarPayload(table, item));
      }

      const chunkSize = 500;
      const results = [];
      for (let i = 0; i < sanitized.length; i += chunkSize) {
        const chunk = sanitized.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from(table)
          .upsert(chunk)
          .select();
        if (error) throw error;
        if (data) results.push(...data);
      }
      return normalizarRetorno(results);
    }
  };
}

// Proxy para instanciar dinamicamente qualquer entidade chamada
const entitiesProxy = new Proxy({}, {
  get(target, prop) {
    if (!target[prop]) {
      target[prop] = createEntityAdapter(prop);
    }
    return target[prop];
  }
});

/**
 * Adaptador de Funções do Backend
 */
const functionsAdapter = {
  /**
   * Dispara a rota serverless de notificação de ocorrência (Lição 5).
   */
  async notificarOcorrencia(params) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/notificarOcorrencia', {
        method: 'POST',
        headers,
        body: JSON.stringify(params)
      });
      return await res.json();
    } catch (err) {
      console.warn('Aviso ao chamar /api/notificarOcorrencia (em dev local pode não rodar serverless):', err.message);
      return { notificados: 0, message: err.message };
    }
  },

  /**
   * Atualiza a categoria dos produtos em lote.
   */
  async atualizarCategorias({ produtos }) {
    if (!produtos || produtos.length === 0) return { atualizados: 0 };
    let count = 0;
    for (const p of produtos) {
      if (p.codigo && p.categoria) {
        await supabase
          .from('products')
          .update({ categoria: p.categoria })
          .eq('codigo', p.codigo);
        count++;
      }
    }
    return { atualizados: count };
  },

  /**
   * Lista todos os usuários cadastrados em user_profiles.
   */
  async listarUsuarios() {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('email');
    if (error) throw error;
    return normalizarRetorno(data || []);
  },

  /**
   * Lista todos os usuários com papel de admin.
   */
  async listarAdmins() {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('role', 'admin')
      .order('email');
    if (error) throw error;
    return normalizarRetorno(data || []);
  },

  /**
   * Atualiza o papel de um usuário (admin / operator).
   */
  async atualizarRoleUsuario({ userId, role }) {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ role })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return normalizarRetorno(data);
  },

  /**
   * Contadores dos selos do menu, contados NO BANCO.
   *
   * Antes o menu baixava sete tabelas inteiras a cada 60 segundos e contava
   * no navegador. A regra de cada contador está na função SQL
   * `public.contadores_do_menu()` — ela roda com os direitos de quem chama,
   * então o RLS continua valendo igual.
   *
   * Lança em caso de erro, de propósito: o chamador precisa poder mostrar que
   * os números estão velhos. Antes, um `catch {}` escondia a falha e o menu
   * exibia um número desatualizado como se fosse o atual.
   */
  async contadoresDoMenu() {
    const { data, error } = await executarComRenovacao(() =>
      supabase.rpc('contadores_do_menu'));
    if (error) throw error;
    const linha = Array.isArray(data) ? data[0] : data;
    if (!linha) throw new Error('contadores_do_menu não devolveu nenhuma linha');
    return linha;
  },

  /**
   * Painel da TV de empilhadeira, calculado NO BANCO (Etapa 2).
   *
   * Antes a tela baixava todas as programações, 200 linhas e todas as
   * ocorrências a cada 10–15s. Agora é uma chamada só.
   *
   * RECUO: se a função ainda não existe no banco (o código pode ser publicado
   * antes da migration), calcula o mesmo painel no navegador a partir das
   * linhas do DIA, já filtradas. Qualquer OUTRO erro é lançado: a TV precisa
   * saber que falhou para avisar, em vez de mostrar número velho como atual.
   */
  async painelTelevisaoEmpilha() {
    const { data, error } = await executarComRenovacao(() =>
      supabase.rpc('painel_televisao_empilha'));
    if (!error) return { ...data, calculado_no: 'banco' };
    if (!funcaoAusente(error)) throw error;

    return painelEmpilhaNoNavegador(hojeEmBrasilia());
  },

  /**
   * Painel da TV principal (/Televisao), calculado NO BANCO (Etapa 2):
   * envase, check-out, empilhadeira e mês numa chamada. Antes eram 12
   * consultas, três delas de tabelas inteiras a cada minuto.
   *
   * Mesmo recuo da empilhadeira: só quando a função não existe no banco.
   */
  async painelTelevisao() {
    const { data, error } = await executarComRenovacao(() => supabase.rpc('painel_televisao'));
    if (!error) return { ...data, calculado_no: 'banco' };
    if (!funcaoAusente(error)) throw error;

    const dia = hojeEmBrasilia();
    const { inicio, fim } = limitesDoMes(dia);
    const [progs, metas] = await Promise.all([
      lerTudo(() => supabase.from('checkout_programacoes').select('id').eq('data_programada', dia)),
      metasNoNavegador(dia),
    ]);
    const ids = progs.map((p) => p.id);
    const [envaseHoje, envaseMes, checkoutHoje, painelEmpilha, paradasHoje, empilhadeiras] = await Promise.all([
      lerTudo(() => supabase.from('envase_records').select('*').eq('data', dia)),
      lerTudo(() => supabase.from('envase_records').select('sala, quantidade_produzida, codigo_produto')
        .gte('data', inicio).lt('data', fim)),
      ids.length ? lerTudo(() => supabase.from('checkout_itens').select('*').in('programacao_id', ids)) : [],
      painelEmpilhaNoNavegador(dia, metas),
      lerTudo(() => supabase.from('empilhadeira_paradas').select('hora_fim').eq('data', dia)),
      lerTudo(() => supabase.from('empilhadeira_configs').select('nome, ativa, data_proxima_manutencao, created_at')),
    ]);
    // Só os produtos que aparecem no dia e no mês — não o catálogo inteiro
    // (1.599 linhas) a cada 30 s. Em lotes de 150 códigos, para a URL caber.
    const codigos = [...new Set([...envaseHoje, ...envaseMes].map((r) => r.codigo_produto).filter(Boolean))];
    const produtos = [];
    for (let i = 0; i < codigos.length; i += 150) {
      produtos.push(...await lerTudo(() => supabase.from('products')
        .select('codigo, categoria, halal, kosher, nsf_3h, nsf_h1').in('codigo', codigos.slice(i, i + 150))));
    }
    return calcularPainelTelevisao({
      dia, envaseHoje, envaseMes, checkoutHoje, produtos, painelEmpilha, paradasHoje, empilhadeiras, metas,
    });
  },

  /**
   * Painel geral (/Painel), calculado NO BANCO (Etapa 2). Antes eram 16
   * consultas, cada uma com um teto de linhas, e "semana" era contada dentro
   * desses tetos. Mesmo recuo das TVs: só quando a função não existe.
   */
  async painelGeral() {
    const { data, error } = await executarComRenovacao(() => supabase.rpc('painel_geral'));
    if (!error) return { ...data, calculado_no: 'banco' };
    if (!funcaoAusente(error)) throw error;

    const dia = hojeEmBrasilia();
    const { semana, semanaFim } = limitesDaSemana(dia);
    // Meia-noite de segunda em Brasília, como instante. Brasília não tem
    // horário de verão desde 2019; a função SQL usa o fuso nomeado.
    const desdeSegunda = `${semana}T00:00:00-03:00`;
    const ha3dias = new Date(Date.now() - 3 * 86400000).toISOString();
    const contar = async (construir) => {
      const { count, error: e } = await executarComRenovacao(() => construir());
      if (e) throw e;
      return count ?? 0;
    };
    const cabeca = { count: 'exact', head: true };

    const [progsCk, progsEmp] = await Promise.all([
      lerTudo(() => supabase.from('checkout_programacoes').select('id').eq('data_programada', dia)),
      lerTudo(() => supabase.from('empilha_programacoes').select('id').eq('data_programada', dia)),
    ]);
    const idsCk = progsCk.map((x) => x.id);
    const idsEmp = progsEmp.map((x) => x.id);

    const [
      envaseSemana, checkoutHoje, checkoutConcluidosSemana, linhasConcluidasSemana, empilhaAtivasHoje,
      linhasSemAssinatura, recSemana, recAtivos, recSemLider, checklistsSemana,
      limpSemana, limpAtrasadas, limpAguardando, nfsSemana, nfsSemArquivo3dias,
      ocorrenciasEmpilha, ocorrenciasRecebimento, paradasHoje, empilhadeiras,
    ] = await Promise.all([
      lerTudo(() => supabase.from('envase_records').select('*').gte('data', semana).lte('data', dia)),
      idsCk.length ? lerTudo(() => supabase.from('checkout_itens').select('*').in('programacao_id', idsCk)) : [],
      lerTudo(() => supabase.from('checkout_itens').select('id').eq('status', 'Concluído').gte('updated_at', desdeSegunda)),
      lerTudo(() => supabase.from('empilha_linhas').select('id').eq('status', 'Concluído').gte('updated_at', desdeSegunda)),
      idsEmp.length
        ? lerTudo(() => supabase.from('empilha_linhas').select('*').in('programacao_id', idsEmp).eq('status', 'Em Andamento'))
        : [],
      contar(() => supabase.from('empilha_linhas').select('id', cabeca).eq('status', 'Concluído').not('assinatura_lider', 'is', true)),
      lerTudo(() => supabase.from('recebimentos').select('*').gte('created_at', desdeSegunda)),
      lerTudo(() => supabase.from('recebimentos').select('*').eq('status', 'Em andamento')),
      lerTudo(() => supabase.from('recebimentos').select('*').eq('status', 'Concluído').not('assinatura_lider', 'is', true)),
      lerTudo(() => supabase.from('checklist_recebimentos').select('id, nota_final, created_at').gte('created_at', desdeSegunda)),
      lerTudo(() => supabase.from('limpeza_programacoes').select('*').gte('data_prevista', semana).lte('data_prevista', semanaFim)),
      lerTudo(() => supabase.from('limpeza_programacoes').select('*').lt('data_prevista', dia).neq('status', 'Concluído')),
      lerTudo(() => supabase.from('limpeza_programacoes').select('*').eq('status', 'Concluído')
        .eq('assinatura_responsavel', true).not('assinatura_lider', 'is', true)),
      contar(() => supabase.from('nota_fiscal_arquivos').select('id', cabeca).gte('created_at', desdeSegunda)),
      // Sem arquivo = NULL ou texto vazio. Duas contagens em vez de .or():
      // a revisão de injeção (CLAUDE.md §2.2) registrou zero .or() no app.
      Promise.all([
        contar(() => supabase.from('nota_fiscal_arquivos').select('id', cabeca)
          .is('arquivo_url', null).lt('created_at', ha3dias)),
        contar(() => supabase.from('nota_fiscal_arquivos').select('id', cabeca)
          .eq('arquivo_url', '').lt('created_at', ha3dias)),
      ]).then(([a, b]) => a + b),
      lerTudo(() => supabase.from('empilha_ocorrencias').select('id, tipo, descricao, registrado_por, created_at').not('resolvido', 'is', true)),
      lerTudo(() => supabase.from('recebimento_ocorrencias').select('id, tipo, descricao, registrado_por, created_at').not('resolvido', 'is', true)),
      lerTudo(() => supabase.from('empilhadeira_paradas').select('tipo, hora_inicio, hora_fim, created_at').eq('data', dia)),
      lerTudo(() => supabase.from('empilhadeira_configs').select('data_proxima_manutencao')),
    ]);

    // Junta as três buscas de recebimento sem repetir linha.
    const recebimentos = [...new Map([...recSemana, ...recAtivos, ...recSemLider].map((r) => [r.id, r])).values()];
    const limpezas = [...new Map([...limpSemana, ...limpAtrasadas, ...limpAguardando].map((l) => [l.id, l])).values()];
    const idsAtivos = recAtivos.map((r) => r.id);
    const participantes = idsAtivos.length
      ? await lerTudo(() => supabase.from('recebimento_participantes').select('*').in('recebimento_id', idsAtivos))
      : [];

    return calcularPainelGeral({
      dia, envaseSemana, checkoutHoje, checkoutConcluidosSemana, linhasConcluidasSemana, empilhaAtivasHoje,
      linhasSemAssinatura, recebimentos, participantes, checklistsSemana, limpezas, nfsSemana,
      nfsSemArquivo3dias, ocorrenciasEmpilha, ocorrenciasRecebimento, paradasHoje, empilhadeiras,
    });
  },

  /**
   * Indicadores da empilhadeira num período, calculados NO BANCO (Etapa 2,
   * passo 4). Antes as telas baixavam todo o histórico de linhas,
   * programações, paradas e ocorrências para mostrar um período.
   * Mesmo recuo das TVs: só quando a função não existe no banco.
   */
  async indicadoresEmpilhadeira(de, ate) {
    const { data, error } = await executarComRenovacao(() =>
      supabase.rpc('indicadores_empilhadeira', { de, ate }));
    if (!error) return { ...data, calculado_no: 'banco' };
    if (!funcaoAusente(error)) throw error;

    const programacoes = await lerTudo(() => supabase.from('empilha_programacoes')
      .select('id, data_programada').gte('data_programada', de).lte('data_programada', ate));
    const ids = programacoes.map((p) => p.id);
    const linhas = [];
    // Em lotes: 100 ids de programação por consulta, para a URL caber.
    for (let i = 0; i < ids.length; i += 100) {
      linhas.push(...await lerTudo(() => supabase.from('empilha_linhas')
        .select('programacao_id, tipo_linha, status, tempo_total, operador_empilhadeira, operador_ajudante')
        .in('programacao_id', ids.slice(i, i + 100))));
    }
    const [paradas, ocorrencias, configs] = await Promise.all([
      lerTudo(() => supabase.from('empilhadeira_paradas').select('tipo, data, tempo_total').gte('data', de).lte('data', ate)),
      lerTudo(() => supabase.from('empilha_ocorrencias').select('tipo, data, resolvido, registrado_por').gte('data', de).lte('data', ate)),
      lerTudo(() => supabase.from('empilhadeira_configs').select('id, ativa, duracao_turno_horas, created_at')),
    ]);
    const ativa = configs.filter((c) => c.ativa === true)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || (a.id < b.id ? -1 : 1))[0];
    return calcularIndicadoresEmpilha({
      de, ate, programacoes, linhas, paradas, ocorrencias, duracaoTurnoHoras: ativa?.duracao_turno_horas,
    });
  },

  /**
   * Indicadores de recebimento num período, calculados NO BANCO (Etapa 2,
   * passo 4). Antes a página baixava todo o histórico de recebimentos,
   * ocorrências e participantes. Mesmo recuo das outras telas.
   */
  async indicadoresRecebimento(de, ate) {
    const { data, error } = await executarComRenovacao(() =>
      supabase.rpc('indicadores_recebimento', { de, ate }));
    if (!error) return { ...data, calculado_no: 'banco' };
    if (!funcaoAusente(error)) throw error;

    // A data que vale é a de chegada, senão a prevista: busca pelas duas
    // (sem .or(), ver §2.2 do CLAUDE.md) e junta sem repetir.
    const campos = 'id, tipo, status, data_chegada, data_prevista, tempo_produtivo_minutos, tempo_pausado_minutos';
    const [porChegada, porPrevista] = await Promise.all([
      lerTudo(() => supabase.from('recebimentos').select(campos).gte('data_chegada', de).lte('data_chegada', ate)),
      lerTudo(() => supabase.from('recebimentos').select(campos).is('data_chegada', null).gte('data_prevista', de).lte('data_prevista', ate)),
    ]);
    const recebimentos = [...new Map([...porChegada, ...porPrevista].map((r) => [r.id, r])).values()];
    const ids = recebimentos.map((r) => r.id);
    const participantes = [];
    const ocorrencias = [];
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      const [p, o] = await Promise.all([
        lerTudo(() => supabase.from('recebimento_participantes').select('recebimento_id, operator_nome').in('recebimento_id', lote)),
        lerTudo(() => supabase.from('recebimento_ocorrencias').select('recebimento_id, tipo, resolvido').in('recebimento_id', lote)),
      ]);
      participantes.push(...p);
      ocorrencias.push(...o);
    }
    return calcularIndicadoresRecebimento({ de, ate, recebimentos, participantes, ocorrencias });
  },

  /**
   * Os checklists de um período, por data de entrega. Os indicadores de
   * checklist continuam no navegador (as faixas moram em src/lib/checklist.js),
   * mas a página buscava os 500 mais recentes e filtrava — agora busca o
   * período.
   */
  async checklistsDoPeriodo(de, ate) {
    return lerTudo(() => supabase.from('checklist_recebimentos').select('*')
      .gte('data_entrega', de).lte('data_entrega', ate));
  },

  /**
   * Envases de uma faixa de datas, do mais recente para o mais antigo — o
   * mesmo formato do list("-data") de antes, mas só a faixa (o Dashboard
   * baixava a tabela inteira). Sem `de` nem `ate`, devolve tudo.
   */
  async envasesDaFaixa(de, ate) {
    const linhas = await lerTudo(() => {
      let q = supabase.from('envase_records').select('*');
      if (de) q = q.gte('data', de);
      if (ate) q = q.lte('data', ate);
      return q.order('data', { ascending: false }).order('id');
    });
    return linhas.map(normalizarRetorno);
  },

  /**
   * Programações de limpeza de uma faixa de data prevista, em ordem de data —
   * o list("data_prevista") de antes, mas só a faixa.
   */
  async limpezasDaFaixa(de, ate) {
    const linhas = await lerTudo(() => supabase.from('limpeza_programacoes').select('*')
      .gte('data_prevista', de).lte('data_prevista', ate)
      .order('data_prevista', { ascending: true }).order('id'));
    return linhas.map(normalizarRetorno);
  },

  /** Todas as metas diárias (tabela pequena: uma linha por troca de meta). */
  async metasDiarias() {
    return lerTudo(() => supabase.from('metas_diarias').select('*')
      .order('vigente_desde', { ascending: false }).order('id'));
  },

  /** Lança uma meta. Só admin (RLS). */
  async lancarMeta(meta) {
    const { data, error } = await executarComRenovacao(() =>
      supabase.from('metas_diarias').insert(meta).select().single());
    if (error) throw error;
    return data;
  },

  /**
   * Apaga uma meta. O RLS só deixa apagar a que começa hoje ou depois; se a
   * linha não sumiu, é porque o banco recusou — vira erro, não silêncio.
   */
  async apagarMeta(id) {
    const { data, error } = await executarComRenovacao(() =>
      supabase.from('metas_diarias').delete().eq('id', id).select('id'));
    if (error) throw error;
    if (!data?.length) throw Object.assign(new Error('meta não apagada'), { code: '42501' });
    return true;
  },

  /** Quantos envases existem — sem baixar nenhum. */
  async contarEnvases() {
    const { count, error } = await executarComRenovacao(() =>
      supabase.from('envase_records').select('id', { count: 'exact', head: true }));
    if (error) throw error;
    return count ?? 0;
  },

  /**
   * Ponto de entrada dinâmico para invocar funções do adaptador
   * Mantém compatibilidade total com o Base44 SDK: base44.functions.invoke(name, params)
   */
  async invoke(functionName, params = {}) {
    if (typeof this[functionName] === 'function') {
      const result = await this[functionName](params);
      if (functionName === 'listarUsuarios') {
        return { data: { users: result } };
      }
      if (functionName === 'listarAdmins') {
        return { data: { admins: result } };
      }
      return { data: result };
    }
    throw new Error(`Função "${functionName}" não encontrada no adaptador.`);
  }
};

/**
 * Adaptador de Integrações / Upload de Arquivos
 */
const integrationsAdapter = {
  Core: {
    async UploadFile({ file, bucket }) {
      // O bucket vinha do chamador sem nenhuma restricao. Agora so os dois que
      // o sistema usa sao aceitos, e as regras de tipo e tamanho estao em
      // src/lib/uploadSeguro.js, iguais as do storage.buckets.
      //
      // Quando a tela nao informa o bucket, o destino e deduzido do tipo REAL
      // do arquivo (assinatura de bytes), nao da extensao, que e forjavel.
      let bucketName = bucket;
      if (!bucketName) {
        const real = await tipoRealDoArquivo(file).catch(() => null);
        bucketName = real === 'application/pdf' ? 'notas-fiscais' : 'fotos-operadores';
      }

      const fileName = await validarUpload(file, bucketName);

      const { error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (error) {
        registrarErro('upload de arquivo', error);
        throw new ErroDeUpload(mensagemDeErroSegura(error, 'enviar o arquivo'));
      }

      // Os dois buckets sao PRIVADOS desde a migration 20261006150002, logo
      // nao existe mais URL publica. O que vai para o banco e sempre o
      // CAMINHO; a URL assinada e so para exibir agora e expira em 24h.
      let urlAssinada = null;
      try {
        const { data: assinada } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(fileName, 86400);
        urlAssinada = assinada?.signedUrl || null;
      } catch (e) {
        registrarErro('assinatura de URL apos upload', e);
      }

      return {
        file_url: fileName,      // caminho: e isto que deve ser gravado
        file_path: fileName,
        preview_url: urlAssinada, // so para exibicao imediata
        bucket: bucketName,
      };
    },

    /**
     * Gera URL assinada sob demanda para arquivos em buckets privados (ex: notas-fiscais).
     * Padrão: 3600 segundos (1 hora).
     */
    async createSignedUrl(bucket, filePath, expiresIn = 3600) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, expiresIn);
      if (error) throw error;
      return data?.signedUrl;
    },

    async SendEmail({ to, subject, body }) {
      console.log(`[SendEmail Simulado] Para: ${to} | Assunto: ${subject}`);
      return { success: true };
    }
  }
};

/**
 * Adaptador de Autenticação Supabase
 */
const authAdapter = {
  async me() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    return {
      id: session.user.id,
      email: session.user.email,
      role: profile?.role || 'operator',
      full_name: profile?.full_name || session.user.email?.split('@')[0],
      created_date: session.user.created_at
    };
  },

  async logout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('envase_current_operator');
    }
    await supabase.auth.signOut();
  },

  redirectToLogin() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('envase_open_login_modal'));
    }
  }
};

/**
 * Objeto unificado exportado com o mesmo nome e assinatura do cliente antigo
 */
export const base44 = {
  entities: entitiesProxy,
  functions: functionsAdapter,
  integrations: integrationsAdapter,
  auth: authAdapter,
  asServiceRole: {
    entities: entitiesProxy,
    functions: functionsAdapter,
    integrations: integrationsAdapter
  }
};

export default base44;
