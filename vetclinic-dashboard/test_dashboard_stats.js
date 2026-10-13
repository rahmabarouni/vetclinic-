const http = require('http');

const NEXT_PORT = 3001;

function request(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: NEXT_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => {
        let parsed = b;
        try { parsed = JSON.parse(b); } catch {}
        resolve({ data: parsed, raw: b, status: res.statusCode, setCookie: res.headers['set-cookie'] });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function extractTokenCookie(setCookie) {
  if (!setCookie) return null;
  for (const c of setCookie) {
    if (c.startsWith('dashboard_token=')) return c.split(';')[0];
  }
  return null;
}

async function main() {
  console.log('==========================================');
  console.log(' Phase 2 — Stats dashboard');
  console.log('==========================================\n');

  const login = await request('POST', '/api/auth/login', {
    email: 'dr.martin@vetclinic.test',
    password: 'REDACTED_DEMO_PASSWORD',
  });
  const cookie = extractTokenCookie(login.setCookie);
  console.log(`[1] Login dr.martin -> ${login.status}, cookie=${cookie ? 'YES' : 'NO'}`);
  if (!cookie) { console.log('FAIL: pas de cookie'); process.exit(1); }

  const res = await request('GET', '/api/proxy/dashboard/stats', null, cookie);
  console.log(`[2] GET /api/proxy/dashboard/stats -> ${res.status}`);
  if (res.status !== 200) { console.log('FAIL:', res.raw.slice(0, 300)); process.exit(1); }

  const s = res.data.stats;
  console.log('\n--- stats recues ---');
  console.log('appointmentsToday.total     =', s.appointmentsToday.total);
  console.log('appointmentsToday.byStatus  =', JSON.stringify(s.appointmentsToday.byStatus));
  console.log('newClientsLast30Days        =', s.newClientsLast30Days);
  console.log('cancellationRate            =', JSON.stringify(s.cancellationRate));
  console.log('appointmentTypesLast30Days  =', JSON.stringify(s.appointmentTypesLast30Days));
  console.log('unreadMessages              =', s.unreadMessages);
  console.log('\nJSON=' + JSON.stringify(s));
  console.log('\nRESULT: OK');
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
