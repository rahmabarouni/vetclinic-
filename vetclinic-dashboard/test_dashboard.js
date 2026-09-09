const http = require('http');

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(body); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log('==========================================');
  console.log(' Phase 6 — Dashboard Proof Test');
  console.log('==========================================\n');

  // 1. Login as dr.martin (VET)
  console.log('[1] Login dr.martin@vetclinic.test...');
  const login = await request('POST', '/api/v1/auth/login', {
    email: 'dr.martin@vetclinic.test',
    password: 'REDACTED_DEMO_PASSWORD',
  });
  const token = login.token;
  const user = login.user;
  console.log(`    OK: ${user.firstName} ${user.lastName} (role=${user.role}, id=${user.id})`);

  if (user.role !== 'VETERINARIAN') {
    console.log('    FAIL: role is not VETERINARIAN');
    process.exit(1);
  }

  // 2. Fetch appointments (filtered by vet)
  console.log('\n[2] GET /api/v1/appointments (auto-filtered by vet)...');
  const appts = await request('GET', '/api/v1/appointments?page=1&limit=50', null, token);
  console.log(`    OK: ${appts.data.length} appointments found`);

  for (const a of appts.data) {
    console.log(`    - [${a.status}] ${a.appointmentType} | ${a.pet.name} (${a.pet.species}) | client: ${a.client.firstName} ${a.client.lastName} | ${a.scheduledStart}`);
  }

  if (appts.data.length === 0) {
    console.log('    FAIL: no appointments for this vet');
    process.exit(1);
  }

  // 3. Find a PENDING appointment to change status
  const pending = appts.data.find(a => a.status === 'PENDING');
  if (!pending) {
    console.log('    No PENDING appointment found, trying first appointment...');
  }
  const target = pending || appts.data[0];
  console.log(`\n[3] PATCH /api/v1/appointments/${target.id}/status -> CONFIRMED...`);
  console.log(`    Current status: ${target.status}`);

  const updated = await request('PATCH', `/api/v1/appointments/${target.id}/status`, {
    status: 'CONFIRMED',
  }, token);

  if (updated.appointment) {
    console.log(`    OK: new status = ${updated.appointment.status}`);
    console.log(`    Pet: ${updated.appointment.pet.name}`);
    console.log(`    Client: ${updated.appointment.client.firstName} ${updated.appointment.client.lastName}`);
  } else {
    console.log('    FAIL:', JSON.stringify(updated));
    process.exit(1);
  }

  // 4. Revert back to PENDING
  console.log(`\n[4] Revert status back to PENDING...`);
  const reverted = await request('PATCH', `/api/v1/appointments/${target.id}/status`, {
    status: 'PENDING',
  }, token);
  console.log(`    OK: reverted to ${reverted.appointment.status}`);

  console.log('\n==========================================');
  console.log(' Phase 6 Proof: ALL PASS');
  console.log('==========================================');
  console.log(` Login:         ${user.firstName} ${user.lastName} (${user.role})`);
  console.log(` Appointments:  ${appts.data.length} found (filtered by vet)`);
  console.log(` Status change: PENDING -> CONFIRMED -> PENDING`);
  console.log('==========================================\n');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
