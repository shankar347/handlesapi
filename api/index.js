/**
 * Vercel serverless entry — exports the Express app.
 * DB connection is ensured per-request in src/app.js (cached globally).
 */
const app = require('../src/app');
const { initFirebase } = require('../src/services/pushService');

initFirebase();

module.exports = app;
