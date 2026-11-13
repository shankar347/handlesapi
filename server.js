const http = require('http');
const app = require('./src/app');
const env = require('./src/config/env');
const { connectDatabase } = require('./src/config/database');
const { attachSocket } = require('./src/socket');
const { initFirebase } = require('./src/services/pushService');
const { ensureBotUser } = require('./src/services/botService');

const start = async () => {
  try {
    await connectDatabase();
    // eslint-disable-next-line no-console
    console.log('MongoDB connected');
    await ensureBotUser();
    // eslint-disable-next-line no-console
    console.log('Handles bot ready');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('MongoDB connection failed:', error.message);
    // eslint-disable-next-line no-console
    console.error('Server will still listen so /health can report database status.');
  }

  initFirebase();

  const host = env.host || '0.0.0.0';
  const server = http.createServer(app);
  const io = attachSocket(server);
  app.set('io', io);

  server.listen(env.port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`API + Socket.IO on http://${host}:${env.port}${env.apiPrefix}`);
  });
};

start();
