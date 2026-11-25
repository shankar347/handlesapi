const crypto = require('crypto');
const Razorpay = require('razorpay');

const getKeys = () => ({
  keyId: String(process.env.RAZORPAY_KEY_ID || '').trim(),
  keySecret: String(process.env.RAZORPAY_KEY_SECRET || '').trim(),
});

const isConfigured = () => {
  const { keyId, keySecret } = getKeys();
  return Boolean(keyId && keySecret);
};

const getClient = () => {
  const { keyId, keySecret } = getKeys();
  if (!keyId || !keySecret) {
    const error = new Error(
      'Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to backend/.env',
    );
    error.statusCode = 503;
    error.code = 'RAZORPAY_NOT_CONFIGURED';
    throw error;
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

const createOrder = async ({ amountInr, receipt, notes = {} }) => {
  const client = getClient();
  const amountPaise = Math.round(Number(amountInr) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    const error = new Error('Invalid payment amount');
    error.statusCode = 400;
    throw error;
  }
  const order = await client.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: String(receipt).slice(0, 40),
    notes,
  });
  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: getKeys().keyId,
    receipt: order.receipt,
  };
};

const verifySignature = ({ orderId, paymentId, signature }) => {
  const { keySecret } = getKeys();
  if (!keySecret) return false;
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(String(signature), 'utf8'));
  } catch (_) {
    return expected === signature;
  }
};

module.exports = {
  isConfigured,
  createOrder,
  verifySignature,
  getKeys,
};
