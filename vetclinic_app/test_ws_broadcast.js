const http = require('http');
const WebSocket = require('ws');

const BASE = 'http://localhost:3000';

const SEED_PASSWORD = process.env.SEED_PASSWORD;
if (!SEED_PASSWORD) {
  console.error('SEED_PASSWORD est requis pour ce script (mot de passe des comptes de démonstration).');
  process.exit(1);
}

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function connectWS(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', (err) => reject(err));
  });
}

function waitForMessage(ws, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for message')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

async function main() {
  console.log('==========================================');
  console.log(' Phase 5 — WebSocket Broadcast Proof Test');
  console.log('==========================================\n');

  // 1. Login both users
  console.log('[1] Login CLIENT...');
  const cLogin = await post('/api/v1/auth/login', { email: 'jean.dupont@email.test', password: SEED_PASSWORD });
  const cToken = cLogin.token;
  const cUser = cLogin.user;
  console.log(`    OK: ${cUser.firstName} ${cUser.lastName} (id=${cUser.id})`);

  console.log('[2] Login VET...');
  const vLogin = await post('/api/v1/auth/login', { email: 'dr.martin@vetclinic.test', password: SEED_PASSWORD });
  const vToken = vLogin.token;
  const vUser = vLogin.user;
  console.log(`    OK: ${vUser.firstName} ${vUser.lastName} (id=${vUser.id})`);

  // 2. Get vet profile ID
  console.log('[3] Get vet profile ID...');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const vetProfile = await prisma.veterinarian.findFirst({ where: { userId: vUser.id }, select: { id: true } });
  await prisma.$disconnect();
  console.log(`    OK: vetProfileId=${vetProfile.id}`);

  // 3. Create conversation
  console.log('[4] Create conversation...');
  const conv = await post('/api/v1/conversations', { veterinarianId: vetProfile.id }, cToken);
  const convId = conv.conversation.id;
  console.log(`    OK: conversationId=${convId}`);

  // 4. Connect two WebSocket sessions
  console.log('[5] Connect CLIENT WebSocket...');
  const clientWs = await connectWS(`ws://localhost:3000/api/v1/ws/conversations/${convId}?token=${cToken}`);
  console.log('    OK: client WS connected');

  console.log('[6] Connect VET WebSocket...');
  const vetWs = await connectWS(`ws://localhost:3000/api/v1/ws/conversations/${convId}?token=${vToken}`);
  console.log('    OK: vet WS connected');

  // 5. CLIENT sends message → VET should receive
  console.log('\n--- TEST 1: CLIENT sends → VET receives ---');
  const vetReceive1 = waitForMessage(vetWs, 5000);

  const msg1Payload = JSON.stringify({ content: 'Bonjour Docteur, Rex va-t-il bien?' });
  console.log(`[7] CLIENT sends: ${msg1Payload}`);
  clientWs.send(msg1Payload);

  const vetReceived1 = await vetReceive1;
  console.log('[8] VET received:');
  console.log(JSON.stringify(vetReceived1, null, 2));

  // Validate structure
  const valid1 =
    vetReceived1.type === 'new_message' &&
    vetReceived1.message &&
    typeof vetReceived1.message.id === 'string' &&
    vetReceived1.message.conversationId === convId &&
    vetReceived1.message.senderId === cUser.id &&
    vetReceived1.message.content === 'Bonjour Docteur, Rex va-t-il bien?' &&
    vetReceived1.message.sender &&
    vetReceived1.message.sender.id === cUser.id &&
    vetReceived1.message.sender.firstName === cUser.firstName;

  console.log(`\n    VALIDATION: ${valid1 ? 'PASS' : 'FAIL'}`);
  if (!valid1) {
    console.log('    Expected: type=new_message, senderId=client, content matches, sender object present');
  }

  // 6. VET sends reply → CLIENT should receive
  console.log('\n--- TEST 2: VET sends → CLIENT receives ---');
  const clientReceive2 = waitForMessage(clientWs, 5000);

  const msg2Payload = JSON.stringify({ content: 'Bonjour Jean! Rex va tres bien.' });
  console.log(`[9] VET sends: ${msg2Payload}`);
  vetWs.send(msg2Payload);

  const clientReceived2 = await clientReceive2;
  console.log('[10] CLIENT received:');
  console.log(JSON.stringify(clientReceived2, null, 2));

  // Validate structure
  const valid2 =
    clientReceived2.type === 'new_message' &&
    clientReceived2.message &&
    typeof clientReceived2.message.id === 'string' &&
    clientReceived2.message.conversationId === convId &&
    clientReceived2.message.senderId === vUser.id &&
    clientReceived2.message.content === 'Bonjour Jean! Rex va tres bien.' &&
    clientReceived2.message.sender &&
    clientReceived2.message.sender.id === vUser.id &&
    clientReceived2.message.sender.firstName === vUser.firstName;

  console.log(`\n    VALIDATION: ${valid2 ? 'PASS' : 'FAIL'}`);
  if (!valid2) {
    console.log('    Expected: type=new_message, senderId=vet, content matches, sender object present');
  }

  // 7. Verify DB persistence
  console.log('\n--- TEST 3: DB persistence ---');
  const http = require('http');
  const dbCheck = await new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/v1/conversations/${convId}/messages?page=1&limit=10`,
      method: 'GET',
      headers: { Authorization: `Bearer ${cToken}` },
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.end();
  });

  console.log(`[11] DB messages count: ${dbCheck.data.length}`);
  for (const m of dbCheck.data) {
    const who = m.senderId === cUser.id ? 'CLIENT' : 'VET   ';
    console.log(`    [${who}] ${m.content}`);
  }
  const dbValid = dbCheck.data.length >= 2;
  console.log(`\n    VALIDATION: ${dbValid ? 'PASS' : 'FAIL'}`);

  // Cleanup
  clientWs.close();
  vetWs.close();

  console.log('\n==========================================');
  console.log(` RESULTS: ${valid1 && valid2 && dbValid ? 'ALL PASS' : 'SOME FAILED'}`);
  console.log('==========================================');
  console.log(` Test 1 (Client→Vet WS broadcast): ${valid1 ? 'PASS' : 'FAIL'}`);
  console.log(` Test 2 (Vet→Client WS broadcast): ${valid2 ? 'PASS' : 'FAIL'}`);
  console.log(` Test 3 (DB persistence):          ${dbValid ? 'PASS' : 'FAIL'}`);
  console.log('==========================================\n');

  process.exit(valid1 && valid2 && dbValid ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
