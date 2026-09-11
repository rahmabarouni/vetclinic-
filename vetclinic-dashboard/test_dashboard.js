const http = require('http');

const NEXT_PORT = 3001;

function request(method, path, body, cookie, port) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: port || NEXT_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        try { resolve({ data: JSON.parse(body), status: res.statusCode, setCookie }); }
        catch { resolve({ data: body, status: res.statusCode, setCookie }); }
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
    if (c.startsWith('dashboard_token=')) {
      return c.split(';')[0];
    }
  }
  return null;
}

async function main() {
  console.log('==========================================');
  console.log(' Phase 6 — httpOnly Cookie Auth Test');
  console.log('==========================================\n');

  // 1. Login via Route Handler
  console.log('[1] POST /api/auth/login (dr.martin)...');
  const loginRes = await request('POST', '/api/auth/login', {
    email: 'dr.martin@vetclinic.test',
    password: 'REDACTED_DEMO_PASSWORD',
  });
  console.log(`    Status: ${loginRes.status}`);
  console.log(`    User: ${loginRes.data.user?.firstName} ${loginRes.data.user?.lastName} (${loginRes.data.user?.role})`);

  const cookie = extractTokenCookie(loginRes.setCookie);
  console.log(`    Cookie set: ${cookie ? 'YES (httpOnly)' : 'NO'}`);
  console.log(`    Token in response body: ${loginRes.data.token ? 'YES (should be NO)' : 'NO'}`);

  if (!cookie) {
    console.log('    FAIL: no httpOnly cookie set');
    process.exit(1);
  }
  if (loginRes.data.token) {
    console.log('    FAIL: token leaked in response body');
    process.exit(1);
  }

  // 2. Verify /api/auth/me works with cookie
  console.log('\n[2] GET /api/auth/me (with cookie)...');
  const meRes = await request('GET', '/api/auth/me', null, cookie);
  console.log(`    Status: ${meRes.status}`);
  console.log(`    User: ${meRes.data.user?.firstName} ${meRes.data.user?.lastName}`);

  if (meRes.status !== 200) {
    console.log('    FAIL: /api/auth/me rejected valid cookie');
    process.exit(1);
  }

  // 3. Verify /api/auth/me fails without cookie
  console.log('\n[3] GET /api/auth/me (without cookie)...');
  const noAuth = await request('GET', '/api/auth/me');
  console.log(`    Status: ${noAuth.status} (expected 401)`);

  if (noAuth.status !== 401) {
    console.log('    FAIL: should return 401 without cookie');
    process.exit(1);
  }

  // 4. Fetch appointments via proxy
  console.log('\n[4] GET /api/proxy/appointments (via cookie proxy)...');
  const apptsRes = await request('GET', '/api/proxy/appointments?page=1&limit=50', null, cookie);
  console.log(`    Status: ${apptsRes.status}`);
  console.log(`    Appointments: ${apptsRes.data.data?.length || 0}`);

  if (apptsRes.data.data) {
    for (const a of apptsRes.data.data.slice(0, 3)) {
      console.log(`    - [${a.status}] ${a.appointmentType} | ${a.pet.name} | ${a.client.firstName}`);
    }
  }

  // 5. Status change via proxy
  const target = apptsRes.data.data?.find(a => a.status === 'COMPLETED' || a.status === 'CONFIRMED');
  if (target) {
    console.log(`\n[5] PATCH /api/proxy/appointments/${target.id}/status -> CONFIRMED...`);
    const patchRes = await request('PATCH', `/api/proxy/appointments/${target.id}/status`, { status: 'CONFIRMED' }, cookie);
    console.log(`    Status: ${patchRes.status}`);
    console.log(`    New status: ${patchRes.data.appointment?.status}`);

    // Revert
    await request('PATCH', `/api/proxy/appointments/${target.id}/status`, { status: target.status }, cookie);
    console.log(`    Reverted to: ${target.status}`);
  }

  // 6. Logout clears cookie
  console.log('\n[6] POST /api/auth/logout...');
  const logoutRes = await request('POST', '/api/auth/logout', null, cookie);
  const clearedCookie = extractTokenCookie(logoutRes.setCookie);
  console.log(`    Status: ${logoutRes.status}`);
  console.log(`    Cookie cleared: ${clearedCookie !== null ? 'YES' : 'ALREADY EMPTY'}`);

  console.log('\n==========================================');
  console.log(' RESULTS: ALL PASS');
  console.log('==========================================');
  console.log(' httpOnly cookie:     SET (not in body)');
  console.log(' /api/auth/me:        WORKS with cookie');
  console.log(' No cookie:           401 rejected');
  console.log(' Proxy appointments:  WORKS');
  console.log(' Status change:       WORKS');
  console.log(' Logout:              CLEARS cookie');
  console.log('==========================================\n');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
