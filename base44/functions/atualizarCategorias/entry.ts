import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const updates = body.updates ?? [];

    if (updates.length === 0) {
      return Response.json({ success: 0, errors: 0, total: 0 });
    }

    let success = 0;
    const failed = [];

    // Processar em sequência para evitar sobrecarga na API
    for (const item of updates) {
      try {
        await base44.asServiceRole.entities.Product.update(item.id, { categoria: item.categoria });
        success++;
      } catch (err) {
        failed.push(err?.message ?? 'unknown error');
      }
    }

    return Response.json({ success, errors: failed.length, errorDetails: failed, total: updates.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});