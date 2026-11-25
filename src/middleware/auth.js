const jwt = require('jsonwebtoken');
const { failure } = require('../utils/apiResponse');
const User = require('../models/User');
const env = require('../config/env');

const JWT_SECRET =
  env.jwtAccessSecret || process.env.JWT_ACCESS_SECRET || '';

const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return failure(res, { message: 'Authentication required', statusCode: 401 });
    }
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || user.status === 'banned') {
      return failure(res, { message: 'Invalid session', statusCode: 401 });
    }
    req.user = user;
    return next();
  } catch (error) {
    return failure(res, { message: 'Invalid or expired token', statusCode: 401 });
  }
};

const requireEmailVerified = (req, res, next) => {
  if (!req.user?.emailVerified) {
    return failure(res, {
      message: 'Verify your email before opening Home',
      statusCode: 403,
      data: { code: 'EMAIL_UNVERIFIED' },
    });
  }
  return next();
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin' || req.user.email === 'handles.bot@handles.app') {
    return failure(res, { message: 'Admin access required', statusCode: 403 });
  }
  return next();
};

module.exports = {
  requireAuth,
  requireEmailVerified,
  requireAdmin,
  JWT_SECRET,
};
