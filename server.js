const http = require('http');
const app = require('./src/app');
const env = require('./src/config/env');
const { connectDatabase } = require('./src/config/database');
const { attachSocket } = require('./src/socket');
const { initFirebase } = require('./src/services/pushService');
const { ensurePlatform } = require('./src/services/platformService');
const { runSubscriptionCycle } = require('./src/services/subscriptionService');
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
  ensurePlatform().catch((error) => {
    // eslint-disable-next-line no-console
    console.warn('Platform seed skipped', error.message);
  });
  const cycle = () => {
    runSubscriptionCycle().catch((error) => {
      // eslint-disable-next-line no-console
      console.warn('Subscription cycle failed', error.message);
    });
  };
  cycle();
  setInterval(cycle, 60 * 1000);

  const host = env.host || '0.0.0.0';
  const server = http.createServer(app);
  const io = attachSocket(server);
  app.set('io', io);
  // eslint-disable-next-line global-require
  require('./src/services/ioHub').setIo(io);

  server.listen(env.port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`API + Socket.IO on http://${host}:${env.port}${env.apiPrefix}`);
  });
};

start();
