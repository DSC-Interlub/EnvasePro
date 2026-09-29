import handler from '../api/tv-session.js';

// Mock request / response helpers
function createMockReq({ method = 'POST', headers = {}, body = {} } = {}) {
  return {
    method,
    headers: {
      'x-forwarded-for': '127.0.0.1',
      ...headers,
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('🧪 TESTES UNITÁRIOS DO ENDPOINT /api/tv-session');
  console.log('='.repeat(60));

  process.env.TV_KIOSK_SECRET = 'segredo-teste-kiosk-123';
  process.env.TV_USER_PASSWORD = 'senha-mock-teste';

  // Teste 1: Método inválido (GET)
  {
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();
    await handler(req, res);
    console.log('1. Requisição GET deve retornar 405:', res.statusCode === 405 ? '✅ PASSOU' : `❌ FALHOU (${res.statusCode})`);
  }

  // Teste 2: Sem cabeçalho x-kiosk-secret
  {
    const req = createMockReq({ method: 'POST', headers: {} });
    const res = createMockRes();
    await handler(req, res);
    console.log('2. Sem cabeçalho x-kiosk-secret deve retornar 401:', res.statusCode === 401 ? '✅ PASSOU' : `❌ FALHOU (${res.statusCode})`);
    console.log('   Mensagem:', res.body?.error);
  }

  // Teste 3: Cabeçalho com segredo incorreto
  {
    const req = createMockReq({ method: 'POST', headers: { 'x-kiosk-secret': 'segredo-errado' } });
    const res = createMockRes();
    await handler(req, res);
    console.log('3. Segredo incorreto deve retornar 401:', res.statusCode === 401 ? '✅ PASSOU' : `❌ FALHOU (${res.statusCode})`);
    console.log('   Mensagem:', res.body?.error);
  }

  // Teste 4: Rate limiting
  {
    console.log('4. Testando Rate Limiting (máx 10 por minuto por IP)...');
    let blockedAt429 = false;
    for (let i = 0; i < 15; i++) {
      const req = createMockReq({ method: 'POST', headers: { 'x-kiosk-secret': 'segredo-errado' } });
      const res = createMockRes();
      await handler(req, res);
      if (res.statusCode === 429) {
        blockedAt429 = true;
        console.log(`   Bloqueado no request #${i + 1} com status 429! ✅ PASSOU`);
        break;
      }
    }
    if (!blockedAt429) {
      console.log('   ❌ FALHOU: não bloqueou com 429 após 10 requisições');
    }
  }

  console.log('='.repeat(60));
}

runTests();
