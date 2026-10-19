const { getDb, preflight } = require('./_db');

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  const base = { service: 'SafeHaven Core Backend', version: '3.0.0', timestamp: Date.now() };
  try {
    const db = await getDb();
    const [alerts, telemetry] = await Promise.all([
      db.collection('alerts').countDocuments(),
      db.collection('telemetry').countDocuments()
    ]);
    res.status(200).json({ ...base, status: 'online', database: 'mongodb-atlas', activeAlertsCount: alerts, telemetryPointsCount: telemetry });
  } catch (err) {
    console.error('health error:', err.message);
    res.status(503).json({ ...base, status: 'degraded', database: 'unavailable' });
  }
};
