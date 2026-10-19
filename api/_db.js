const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'safehaven';

// Reuse the connection across warm serverless invocations
let cached = global._safehavenMongo;
if (!cached) cached = global._safehavenMongo = { client: null, promise: null };

async function getDb() {
  if (!uri) throw new Error('MONGODB_URI is not set');
  if (!cached.promise) {
    cached.client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
    cached.promise = cached.client.connect().catch(err => {
      cached.promise = null;
      throw err;
    });
  }
  await cached.promise;
  return cached.client.db(dbName);
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
}

// Returns true if the request was fully handled (preflight)
function preflight(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

module.exports = { getDb, preflight };
