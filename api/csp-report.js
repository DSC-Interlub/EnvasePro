/**
 * Vercel Serverless Function — CSP Violation Report Endpoint
 * 
 * Recebe violações de Content Security Policy enviadas pelos navegadores
 * via diretiva `report-uri /api/csp-report;`.
 * 
 * Onde ler os relatórios:
 * - Vercel Dashboard -> Projeto "envase-pro" -> Aba "Logs" ou "Runtime Logs"
 * - Filtre pelo termo: "[CSP-VIOLATION]"
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    let reportData = req.body;
    
    // Se o corpo veio como string bruta
    if (typeof reportData === 'string') {
      try {
        reportData = JSON.parse(reportData);
      } catch {
        // mantém string
      }
    }

    const violation = reportData?.['csp-report'] || reportData;
    console.warn('[CSP-VIOLATION]', JSON.stringify({
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'unknown',
      blockedUri: violation?.['blocked-uri'] || violation?.blockedURI,
      violatedDirective: violation?.['violated-directive'] || violation?.violatedDirective,
      effectiveDirective: violation?.['effective-directive'] || violation?.effectiveDirective,
      documentUri: violation?.['document-uri'] || violation?.documentURI,
      sourceFile: violation?.['source-file'] || violation?.sourceFile,
      lineNumber: violation?.['line-number'] || violation?.lineNumber,
      originalPolicy: violation?.['original-policy']
    }));

    // Navegadores esperam 204 No Content para relatórios de CSP
    return res.status(204).end();
  } catch (err) {
    console.error('[CSP-VIOLATION-ERROR]', err);
    return res.status(204).end();
  }
}
