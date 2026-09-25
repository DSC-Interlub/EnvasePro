import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId, role } = await req.json();

    if (!userId || !role) {
      return Response.json({ error: 'userId e role são obrigatórios' }, { status: 400 });
    }

    // Impedir que o admin remova o próprio role
    if (userId === user.id && role !== 'admin') {
      return Response.json({ error: 'Não é possível remover o próprio acesso de admin' }, { status: 400 });
    }

    await base44.asServiceRole.entities.User.update(userId, { role });
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});