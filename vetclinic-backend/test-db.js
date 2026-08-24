const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1',
  port: 5433,
  user: 'vetclinic',
  password: 'REDACTED_DB_PASSWORD',
  database: 'vetclinic',
});

client.connect()
  .then(() => {
    console.log('✅ Connexion réussie !');
    return client.end();
  })
  .catch((err) => {
    console.error('❌ Erreur de connexion:', err.message);
  });