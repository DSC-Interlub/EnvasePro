import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { ocorrencia_id } = body;

    if (!ocorrencia_id) {
      return Response.json({ error: 'ocorrencia_id obrigatório' }, { status: 400 });
    }

    // Buscar a ocorrência
    const ocorrencias = await base44.asServiceRole.entities.EmpilhaOcorrencia.list();
    const ocorrencia = ocorrencias.find(o => o.id === ocorrencia_id);
    if (!ocorrencia) {
      return Response.json({ error: 'Ocorrência não encontrada' }, { status: 404 });
    }

    // Buscar admins
    const usuarios = await base44.asServiceRole.entities.User.list();
    const admins = usuarios.filter(u => u.role === 'admin' && u.email);

    if (admins.length === 0) {
      return Response.json({ notificados: 0, message: 'Nenhum admin com email encontrado' });
    }

    // Buscar dados da linha vinculada (se houver)
    let infoLinha = '';
    if (ocorrencia.linha_id) {
      const linhas = await base44.asServiceRole.entities.EmpilhaLinha.list();
      const linha = linhas.find(l => l.id === ocorrencia.linha_id);
      if (linha) {
        infoLinha = `\nProduto: ${linha.descricao_produto || 'N/A'}\nLocal: ${linha.rua_torre || 'N/A'} — ${linha.deposito || 'N/A'}`;
      }
    }

    const assunto = `Nova ocorrência registrada — ${ocorrencia.tipo || 'Ocorrência'} — ${ocorrencia.data} ${ocorrencia.hora}`;
    const corpo = `Uma nova ocorrência foi registrada no módulo Empilhadeira.

Tipo: ${ocorrencia.tipo || 'N/A'}
Descrição: ${ocorrencia.descricao || 'N/A'}
Registrado por: ${ocorrencia.registrado_por || 'N/A'} (${ocorrencia.registrado_por_funcao || 'N/A'})
Data/Hora: ${ocorrencia.data} ${ocorrencia.hora}${infoLinha}

Acesse o sistema para visualizar e resolver a ocorrência.`;

    let notificados = 0;
    for (const admin of admins) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: admin.email,
        subject: assunto,
        body: corpo,
      });
      notificados++;
    }

    return Response.json({ notificados, message: `E-mail enviado para ${notificados} admin(s)` });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});