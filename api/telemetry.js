const { getDb, preflight } = require('./_db');

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const data = typeof req.body === 'object' && req.body ? { ...req.body } : {};
    data.receivedAt = Date.now();
    const db = await getDb();
    await db.collection('telemetry').insertOne(data);
    res.status(200).json({ success: true, message: 'Telemetry synchronized with backend' });
  } catch (err) {
    console.error('telemetry error:', err.message);
    res.status(500).json({ error: 'Failed to store telemetry' });
  }
};
