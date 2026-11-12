const { success, failure } = require('../utils/apiResponse');
const { getDatabaseStatus } = require('../config/database');
const env = require('../config/env');

const getHealth = (req, res) => {
  const db = getDatabaseStatus();
  const healthy = db.readyState === 1;
  const payload = {
    service: 'handles-backend',
    environment: env.nodeEnv,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database: db,
  };

  if (!healthy) {
    return failure(res, {
      message: 'API is up; database is not ready',
      statusCode: 503,
      data: payload,
    });
  }

  return success(res, {
    message: 'API is healthy',
    data: payload,
  });
};

module.exports = {
  getHealth,
};
