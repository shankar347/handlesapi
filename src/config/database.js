const mongoose = require('mongoose');
const env = require('./env');

let connectionState = 'disconnected';

const connectDatabase = async () => {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    connectionState = 'connected';
  });
  mongoose.connection.on('disconnected', () => {
    connectionState = 'disconnected';
  });
  mongoose.connection.on('error', () => {
    connectionState = 'error';
  });

  await mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 5000,
  });

  connectionState = 'connected';
  return mongoose.connection;
};

const getDatabaseStatus = () => ({
  state: connectionState,
  readyState: mongoose.connection.readyState,
});

module.exports = {
  connectDatabase,
  getDatabaseStatus,
};
