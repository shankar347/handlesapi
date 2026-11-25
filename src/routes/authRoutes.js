const express = require('express');
const {
  register,
  login,
  me,
  verifyEmail,
  resendVerification,
  markHomeReached,
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', requireAuth, me);
router.post('/verify-email', requireAuth, verifyEmail);
router.post('/resend-verification', requireAuth, resendVerification);
router.post('/home-reached', requireAuth, markHomeReached);

module.exports = router;
