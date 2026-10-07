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
        lowerKey === 'id'
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
        let query = supabase.from(table).select('*');
        if (sort) query = query.order(sort.column, { ascending: sort.ascending });
        query = query.range(0, limit - 1);
        const { data, error } = await query;
        if (error) throw error;
        const res = normalizarRetorno(data || []);
        return entityName === 'Operator' ? await resolverFotosOperadores(res) : res;
      }

      // Paginação real em lotes de 1000 até exaurir ou atingir o limite
      while (true) {
        let query = supabase.from(table).select('*');
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
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .maybeSingle();

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
      const { data: created, error } = await supabase
        .from(table)
        .insert(payload)
        .select()
        .single();

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
      const { data: updated, error } = await supabase
        .from(table)
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      const res = normalizarRetorno(updated);
      return entityName === 'Operator' ? await resolverFotosOperadores(res) : res;
    },

    /**
     * Remove um registro pelo ID.
     */
    async delete(id) {
      await this.aguardarSessao();
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', id);

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
        const { data, error } = await supabase
          .from(table)
          .insert(chunk)
          .select();
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
      if (!file) throw new Error('Arquivo não fornecido para upload.');

      // ── Item 11: Validação real de tipo MIME e tamanho ──────────────────────
      const ALLOWED_MIME_IMAGES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
      const ALLOWED_MIME_DOCS   = ['application/pdf'];
      const ALL_ALLOWED         = [...ALLOWED_MIME_IMAGES, ...ALLOWED_MIME_DOCS];
      const MAX_IMAGE_BYTES     = 10 * 1024 * 1024;  // 10 MB
      const MAX_PDF_BYTES       = 20 * 1024 * 1024;  // 20 MB

      const fileMime = file.type || '';
      if (!ALL_ALLOWED.includes(fileMime)) {
        throw new Error(`Tipo de arquivo não permitido: "${fileMime}". Envie imagens (JPG, PNG, WebP) ou PDF.`);
      }
      const isImageMime = ALLOWED_MIME_IMAGES.includes(fileMime);
      const maxBytes = isImageMime ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
      if (file.size > maxBytes) {
        const limitMb = maxBytes / (1024 * 1024);
        throw new Error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite: ${limitMb} MB.`);
      }
      // ────────────────────────────────────────────────────────────────────────

      const fileExt = file.name.split('.').pop() || 'bin';
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

      // Determina bucket correto baseado no DDL:
      // fotos de operadores -> fotos-operadores (público)
      // notas fiscais / documentos -> notas-fiscais (privado)
      let bucketName = bucket;
      if (!bucketName) {
        const isDoc = fileExt.toLowerCase() === 'pdf' || (file.type && file.type.includes('pdf'));
        bucketName = isDoc ? 'notas-fiscais' : 'fotos-operadores';
      }

      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) {
        console.error(`Erro no upload para Supabase Storage [${bucketName}]:`, error);
        throw error;
      }

      // Se for bucket privado (notas-fiscais), retorna apenas o caminho do arquivo
      if (bucketName === 'notas-fiscais') {
        return {
          file_url: fileName,
          file_path: fileName,
          bucket: bucketName
        };
      }

      // Se for fotos-operadores (privado), gera URL assinada para visualização imediata
      if (bucketName === 'fotos-operadores') {
        const { data: signedData } = await supabase.storage
          .from('fotos-operadores')
          .createSignedUrl(fileName, 86400); // 24 horas

        return {
          file_url: signedData?.signedUrl || fileName,
          file_path: fileName,
          bucket: bucketName
        };
      }

      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(fileName);

      return {
        file_url: publicUrl,
        file_path: fileName,
        bucket: bucketName
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
