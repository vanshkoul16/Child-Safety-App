// Vercel function: /app-config.js
// All logic lives in server/liveApi.js (shared with local-server.js).
const liveApi = require('../server/liveApi');

module.exports = async (req, res) => {
  const handled = await liveApi.dispatch('/app-config.js', req, res);
  if (!handled && !res.headersSent) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'not_found' }));
  }
};
