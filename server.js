const app = require('./src/app');
const env = require('./src/config/env');
const { connectDatabase } = require('./src/config/database');

const start = async () => {
  try {
    await connectDatabase();
    // eslint-disable-next-line no-console
    console.log('MongoDB connected');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('MongoDB connection failed:', error.message);
    // eslint-disable-next-line no-console
    console.error('Server will still listen so /health can report database status.');
  }

  // Bind all interfaces so physical phones on LAN can reach the API.
  const host = env.host || '0.0.0.0';
  app.listen(env.port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://${host}:${env.port}${env.apiPrefix}`);
  });
};

start();
