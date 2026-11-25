const mongoose = require('mongoose');
const env = require('./env');

/**
 * Serverless-safe Mongo connection.
 * Reuses the global connection across Vercel warm invocations so
 * `users.findOne()` does not hit Mongoose buffering timeouts.
 */
const globalCache = globalThis.__handlesMongo || {
  conn: null,
  promise: null,
};
globalThis.__handlesMongo = globalCache;

let connectionState = 'disconnected';

const connectDatabase = async () => {
  mongoose.set('strictQuery', true);
  mongoose.set('bufferCommands', false);

  if (globalCache.conn && mongoose.connection.readyState === 1) {
    connectionState = 'connected';
    return globalCache.conn;
  }

  if (!env.mongodbUri) {
    connectionState = 'error';
    throw new Error(
      'Missing MongoDB URI. Set MONGODB_URI or MONGO_URI in Vercel project env.',
    );
  }

  if (!globalCache.promise) {
    mongoose.connection.on('connected', () => {
      connectionState = 'connected';
    });
    mongoose.connection.on('disconnected', () => {
      connectionState = 'disconnected';
      globalCache.conn = null;
      globalCache.promise = null;
    });
    mongoose.connection.on('error', () => {
      connectionState = 'error';
    });

    globalCache.promise = mongoose
      .connect(env.mongodbUri, {
        // Atlas + Vercel cold starts need enough selection time.
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
        socketTimeoutMS: 45000,
        maxPoolSize: 5,
        // Prefer IPv4 first on some serverless networks.
        family: 4,
      })
      .then((m) => {
        connectionState = 'connected';
        return m;
      })
      .catch((error) => {
        globalCache.promise = null;
        connectionState = 'error';
        throw error;
      });
  }

  globalCache.conn = await globalCache.promise;
  return globalCache.conn;
};

const ensureDatabase = async () => {
  if (mongoose.connection.readyState === 1) {
    connectionState = 'connected';
    return mongoose.connection;
  }
  return connectDatabase();
};

const getDatabaseStatus = () => ({
  state: connectionState,
  readyState: mongoose.connection.readyState,
  hasUri: Boolean(env.mongodbUri),
});

module.exports = {
  connectDatabase,
  ensureDatabase,
  getDatabaseStatus,
};
