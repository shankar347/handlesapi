const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
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
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.isProduction ? 'combined' : 'dev'));

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
