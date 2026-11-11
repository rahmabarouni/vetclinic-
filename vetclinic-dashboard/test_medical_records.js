const http = require('http');

const NEXT_PORT = 3001;

const SEED_PASSWORD = process.env.SEED_PASSWORD;
if (!SEED_PASSWORD) {
  console.error('SEED_PASSWORD est requis pour ce script (mot de passe des comptes de démonstration).');
  process.exit(1);
}

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
  console.log(' Phase 1 — Dossiers medicaux (dashboard)');
  console.log('==========================================\n');

  const login = await request('POST', '/api/auth/login', {
    email: 'dr.martin@vetclinic.test',
    password: SEED_PASSWORD,
  });
  const cookie = extractTokenCookie(login.setCookie);
  console.log(`[1] Login dr.martin -> ${login.status}, cookie=${cookie ? 'YES' : 'NO'}, user=${login.data.user?.email} (${login.data.user?.role})`);
  if (!cookie) { console.log('FAIL: pas de cookie'); process.exit(1); }

  const appts = await request('GET', '/api/proxy/appointments?page=1&limit=50', null, cookie);
  const list = (appts.data && appts.data.data) || [];
  console.log(`[2] GET /api/proxy/appointments -> ${appts.status}, count=${list.length}`);
  if (!list.length) { console.log('FAIL: aucun RDV'); process.exit(1); }

  const recordsByPet = {};
  for (const petId of [...new Set(list.map((a) => a.petId))]) {
    const r = await request('GET', `/api/proxy/pets/${petId}/medical-records`, null, cookie);
    recordsByPet[petId] = r.status === 200 ? r.data : { medicalRecords: [], reminders: [], _status: r.status };
  }

  const existingApt = list.find((a) => (recordsByPet[a.petId].medicalRecords || []).length > 0);
  const newApt = list.find((a) => !(recordsByPet[a.petId].medicalRecords || []).some((r) => r.appointmentId === a.id));

  if (!existingApt) { console.log('FAIL: aucun animal avec dossier existant'); process.exit(1); }
  if (!newApt) { console.log('FAIL: aucun RDV sans note disponible'); process.exit(1); }

  const existing = recordsByPet[existingApt.petId];
  console.log(`\n[3] GET /api/proxy/pets/${existingApt.petId}/medical-records (animal avec dossier existant: ${existingApt.pet.name}) -> 200`);
  console.log(`    Notes existantes: ${existing.medicalRecords.length}`);
  for (const r of existing.medicalRecords.slice(0, 5)) {
    console.log(`      - [${r.recordType}] ${r.title} (${r.createdAt})`);
  }
  console.log(`    Rappels (nouveau champ): ${Array.isArray(existing.reminders) ? existing.reminders.length : 'ABSENT'}`);
  for (const rem of (existing.reminders || [])) {
    console.log(`      - [${rem.reminderType}] ${rem.title} — echeance ${rem.dueDate}`);
  }

  const vetId = newApt.veterinarianId || (newApt.veterinarian && newApt.veterinarian.id);
  console.log(`\n[4] Nouveau RDV sans note: ${newApt.id} (${newApt.appointmentType}/${newApt.status}, animal ${newApt.pet.name})`);
  console.log(`    Auteur derive du RDV -> veterinarianId=${vetId || 'ABSENT'} (user=${newApt.veterinarian ? newApt.veterinarian.userId : 'N/A'}, connecte=${login.data.user.id})`);
  if (!vetId) { console.log('FAIL: pas de veterinarianId sur le RDV'); process.exit(1); }

  const title = `Vaccination test dashboard ${new Date().toISOString().slice(0, 19)}`;
  const created = await request('POST', '/api/proxy/medical-records', {
    petId: newApt.petId,
    appointmentId: newApt.id,
    veterinarianId: vetId,
    recordType: 'VACCINATION',
    title,
    description: 'Note de test Phase 1 (dashboard).',
  }, cookie);
  console.log(`\n[5] POST /api/proxy/medical-records (VACCINATION) -> ${created.status}`);
  console.log(`    medicalRecord.id = ${created.data.medicalRecord?.id}`);
  console.log(`    medicalRecord.recordType = ${created.data.medicalRecord?.recordType}`);
  console.log(`    reminder = ${created.data.reminder ? JSON.stringify(created.data.reminder) : 'null'}`);
  if (created.status !== 201 && created.status !== 200) { console.log('FAIL: creation ->', created.raw.slice(0, 300)); process.exit(1); }
  if (!created.data.reminder) { console.log('FAIL: pas de rappel genere'); process.exit(1); }

  console.log(`\n    NOTE_ID=${created.data.medicalRecord.id}`);
  console.log(`    NOTE_PET_ID=${newApt.petId}`);
  console.log(`    NOTE_APPT_ID=${newApt.id}`);
  console.log(`    REMINDER_ID=${created.data.reminder.id}`);
  console.log(`    REMINDER_DUE=${created.data.reminder.dueDate}`);
  console.log('\n==========================================');
  console.log(' RESULT: ALL PASS');
  console.log('==========================================');
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
