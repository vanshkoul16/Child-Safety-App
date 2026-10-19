const { getDb, preflight } = require('./_db');

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const data = typeof req.body === 'object' && req.body ? { ...req.body } : {};
    data.type = 'checkin';
    data.alertId = 'chk-' + Date.now();
    data.timestamp = Date.now();
    const db = await getDb();
    await db.collection('alerts').insertOne(data);
    res.status(200).json({ success: true, message: 'Check-in recorded on server' });
  } catch (err) {
    console.error('checkin error:', err.message);
    res.status(500).json({ error: 'Failed to store check-in' });
  }
};
