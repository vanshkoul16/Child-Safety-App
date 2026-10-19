const { getDb, preflight } = require('./_db');

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  try {
    const db = await getDb();
    const col = db.collection('app_state');
    if (req.method === 'GET') {
      const doc = await col.findOne({ _id: 'global' });
      return res.status(200).json({ state: doc ? doc.state : null, status: 'synced' });
    }
    if (req.method === 'POST') {
      const state = typeof req.body === 'object' && req.body ? req.body : {};
      await col.updateOne({ _id: 'global' }, { $set: { state, updatedAt: Date.now() } }, { upsert: true });
      return res.status(200).json({ success: true, message: 'State synced to server' });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('state error:', err.message);
    res.status(500).json({ error: 'Failed to sync state' });
  }
};
