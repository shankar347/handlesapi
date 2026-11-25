const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const { ensureDatabase } = require('./config/database');
const apiRoutes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(
  helmet({
    // Mobile clients hit the API over LAN HTTP during development.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
app.use(
  cors({
    origin: (origin, callback) => {
      // React Native often sends no Origin; Metro / Flipper may send one.
      if (
        !origin
        || env.corsOrigins.includes(origin)
        || env.corsOrigins.includes('*')
        || !env.isProduction
      ) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  }),
);
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.isProduction ? 'combined' : 'dev'));
app.use(
  '/uploads',
  express.static(path.resolve(__dirname, '../uploads'), {
    maxAge: env.isProduction ? '1d' : 0,
    fallthrough: true,
  }),
);

// Connect (or reuse) Mongo before any route that uses Mongoose.
app.use(async (req, res, next) => {
  if (req.path === '/' || req.path === `${env.apiPrefix}/health`) {
    try {
      await ensureDatabase();
    } catch (_) {
      // Health reports DB status; root stays reachable.
    }
    return next();
  }

  try {
    await ensureDatabase();
    return next();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('MongoDB unavailable:', error.message);
    return res.status(503).json({
      success: false,
      message:
        'Database unavailable. Set MONGO_URI / MONGODB_URI on Vercel and allow 0.0.0.0/0 in Atlas Network Access.',
      data: { error: error.message },
      pagination: null,
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Handles dating platform API',
    data: {
      version: 'v1',
      health: `${env.apiPrefix}/health`,
    },
    pagination: null,
  });
});

app.use(env.apiPrefix, apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
