const express = require('express');
const { requireAuth, requireEmailVerified } = require('../middleware/auth');
const {
  getMine,
  purchase,
  cancel,
  createOrder,
  verifyPayment,
} = require('../controllers/subscriptionController');

const router = express.Router();

router.use(requireAuth, requireEmailVerified);
router.get('/me', getMine);
router.post('/purchase', purchase);
router.post('/razorpay/order', createOrder);
router.post('/razorpay/verify', verifyPayment);
router.post('/cancel', cancel);

module.exports = router;
