const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const Like = require('../models/Like');
const { notifyOnce } = require('./notificationService');
const {
  PLANS,
  getSettings,
  currentSubscription,
  isEligible,
  daysUntil,
  startTrial,
} = require('./platformService');
const razorpayService = require('./razorpayService');

const activatePaidPlan = async (userId, plan, paymentMeta = {}) => {
  const previous = await currentSubscription(userId);
  const hadPaid = previous && previous.planId !== 'trial';
  const startsAt = new Date();
  const base = previous && isEligible(previous) ? new Date(previous.expiresAt) : startsAt;
  const expiresAt = new Date(base.getTime() + plan.days * 24 * 60 * 60 * 1000);

  let subscription = previous;
  if (!subscription) {
    subscription = await Subscription.create({
      userId,
      planId: plan.id,
      planName: plan.name,
      status: 'active',
      startsAt,
      expiresAt,
    });
  } else {
    subscription.planId = plan.id;
    subscription.planName = plan.name;
    subscription.status = 'active';
    subscription.startsAt = subscription.startsAt || startsAt;
    subscription.expiresAt = expiresAt;
    subscription.cancelledAt = null;
    if (hadPaid) subscription.renewedAt = new Date();
    await subscription.save();
  }

  let payment = null;
  if (paymentMeta.paymentId) {
    payment = await Payment.findByIdAndUpdate(
      paymentMeta.paymentId,
      {
        $set: {
          status: 'paid',
          provider: paymentMeta.provider || 'razorpay',
          razorpayOrderId: paymentMeta.razorpayOrderId || '',
          razorpayPaymentId: paymentMeta.razorpayPaymentId || '',
          razorpaySignature: paymentMeta.razorpaySignature || '',
        },
      },
      { new: true },
    );
  }
  if (!payment) {
    payment = await Payment.create({
      userId,
      planId: plan.id,
      amount: plan.price,
      currency: 'INR',
      status: 'paid',
      provider: paymentMeta.provider || 'internal',
      razorpayOrderId: paymentMeta.razorpayOrderId || '',
      razorpayPaymentId: paymentMeta.razorpayPaymentId || '',
      razorpaySignature: paymentMeta.razorpaySignature || '',
    });
  }

  await notifyOnce(userId, {
    dedupeKey: `payment:${payment._id}`,
    type: 'payment_success',
    title: 'Payment successful',
    body: `${plan.name} is active. Enjoy unlimited likes and chat with your matches.`,
    data: { route: 'Subscription', planId: plan.id },
  });
  await notifyOnce(userId, {
    dedupeKey: `plan-active:${subscription._id}:${plan.id}:${expiresAt.toISOString()}`,
    type: 'plan_active',
    title: `${plan.name} unlocked`,
    body: hadPaid
      ? `Your ${plan.name} plan was renewed through ${expiresAt.toDateString()}.`
      : `Your ${plan.name} plan is live through ${expiresAt.toDateString()}.`,
    data: { route: 'Subscription', planId: plan.id },
  });
  if (hadPaid) {
    await notifyOnce(userId, {
      dedupeKey: `renewed:${subscription._id}:${expiresAt.toISOString()}`,
      type: 'subscription_renewed',
      title: 'Subscription renewed',
      body: `Your ${plan.name} subscription has been renewed.`,
      data: { route: 'Subscription' },
    });
  }
  return { subscription, payment };
};

/** Dev/internal purchase (no gateway). Prefer Razorpay when keys exist. */
const purchasePlan = async (userId, planId) => {
  const plan = PLANS[planId];
  if (!plan) {
    const error = new Error('Unknown package');
    error.statusCode = 400;
    throw error;
  }
  return activatePaidPlan(userId, plan, { provider: 'internal' });
};

const createRazorpayOrder = async (userId, planId) => {
  const plan = PLANS[planId];
  if (!plan) {
    const error = new Error('Unknown package');
    error.statusCode = 400;
    throw error;
  }
  if (!razorpayService.isConfigured()) {
    const error = new Error(
      'Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable checkout. Until then use the test purchase in development.',
    );
    error.statusCode = 503;
    error.code = 'RAZORPAY_NOT_CONFIGURED';
    throw error;
  }

  const payment = await Payment.create({
    userId,
    planId: plan.id,
    amount: plan.price,
    currency: 'INR',
    status: 'pending',
    provider: 'razorpay',
  });

  const order = await razorpayService.createOrder({
    amountInr: plan.price,
    receipt: `h_${String(payment._id).slice(-10)}`,
    notes: {
      userId: String(userId),
      planId: plan.id,
      paymentId: String(payment._id),
    },
  });

  payment.razorpayOrderId = order.orderId;
  await payment.save();

  return {
    plan,
    payment,
    order: {
      ...order,
      paymentId: String(payment._id),
      planId: plan.id,
      planName: plan.name,
      amountInr: plan.price,
    },
  };
};

const verifyRazorpayPayment = async (
  userId,
  { planId, razorpay_order_id, razorpay_payment_id, razorpay_signature },
) => {
  const plan = PLANS[planId];
  if (!plan) {
    const error = new Error('Unknown package');
    error.statusCode = 400;
    throw error;
  }
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    const error = new Error('Missing Razorpay payment fields');
    error.statusCode = 400;
    throw error;
  }

  const payment = await Payment.findOne({
    userId,
    planId: plan.id,
    razorpayOrderId: razorpay_order_id,
  });
  if (!payment) {
    const error = new Error('Payment order not found');
    error.statusCode = 404;
    throw error;
  }
  if (payment.status === 'paid') {
    const subscription = await currentSubscription(userId);
    return { subscription, payment, alreadyPaid: true };
  }

  const ok = razorpayService.verifySignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });
  if (!ok) {
    payment.status = 'failed';
    await payment.save();
    const error = new Error('Payment signature verification failed');
    error.statusCode = 400;
    error.code = 'INVALID_SIGNATURE';
    throw error;
  }

  return activatePaidPlan(userId, plan, {
    paymentId: payment._id,
    provider: 'razorpay',
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
  });
};

const cancelSubscription = async (userId) => {
  const subscription = await currentSubscription(userId);
  if (!subscription || !isEligible(subscription)) {
    const error = new Error('No active subscription to cancel');
    error.statusCode = 400;
    throw error;
  }
  subscription.status = 'cancelled';
  subscription.cancelledAt = new Date();
  await subscription.save();
  await notifyOnce(userId, {
    dedupeKey: `cancelled:${subscription._id}:${subscription.cancelledAt.toISOString()}`,
    type: 'subscription_cancelled',
    title: 'Subscription cancelled',
    body: 'Your plan stays active until the current period ends. Renew anytime to keep chatting.',
    data: { route: 'Subscription' },
  });
  return subscription;
};

const runSubscriptionCycle = async (now = new Date()) => {
  const rows = await Subscription.find({
    status: { $in: ['trial', 'active', 'cancelled'] },
  });
  for (const row of rows) {
    const days = daysUntil(row.expiresAt, now);
    const stamp = new Date(row.expiresAt).toISOString();
    const trial = row.status === 'trial' || row.planId === 'trial';
    if (days <= 0) {
      const expiredStatus = row.status === 'cancelled' ? 'cancelled' : 'expired';
      if (row.status !== 'cancelled') {
        row.status = 'expired';
        await row.save();
      }
      await notifyOnce(row.userId, {
        dedupeKey: `expired:${row._id}:${stamp}`,
        type: 'subscription_expired',
        title: 'Your subscription has expired',
        body: trial ? 'Your free trial has expired.' : 'Your subscription has expired.',
        data: { route: 'Subscription' },
      });
      await notifyOnce(row.userId, {
        dedupeKey: `renew-chat:${row.userId}:${stamp}`,
        type: 'renew_chat',
        title: 'Renew your subscription to continue chatting',
        body: 'Renew your subscription to continue chatting.',
        data: { route: 'Subscription' },
      });
      if (expiredStatus === 'cancelled') {
        // Status stays cancelled; expiry notification still fires once.
      }
      continue;
    }
    if (trial && days === 5) {
      await notifyOnce(row.userId, {
        dedupeKey: `trial-soon:${row._id}:${stamp}`,
        type: 'trial_ending',
        title: 'Your free trial is about to expire',
        body: 'Your free trial is about to expire.',
        data: { route: 'Subscription' },
      });
      await notifyOnce(row.userId, {
        dedupeKey: `trial-5d:${row._id}:${stamp}`,
        type: 'trial_5_days',
        title: 'Only 5 days left on your free trial',
        body: 'Your free trial expires in 5 days.',
        data: { route: 'Subscription' },
      });
    }
    if (trial && days === 1) {
      await notifyOnce(row.userId, {
        dedupeKey: `trial-tomorrow:${row._id}:${stamp}`,
        type: 'trial_tomorrow',
        title: 'Your free trial expires tomorrow',
        body: 'Your free trial expires tomorrow.',
        data: { route: 'Subscription' },
      });
    }
    if (!trial && days === 1) {
      await notifyOnce(row.userId, {
        dedupeKey: `sub-tomorrow:${row._id}:${stamp}`,
        type: 'subscription_tomorrow',
        title: 'Your subscription expires tomorrow',
        body: 'Your subscription expires tomorrow.',
        data: { route: 'Subscription' },
      });
    }
    if (!trial && days === 5) {
      await notifyOnce(row.userId, {
        dedupeKey: `sub-5d:${row._id}:${stamp}`,
        type: 'subscription_5_days',
        title: 'Your subscription is about to expire',
        body: 'Only 5 days left on your subscription.',
        data: { route: 'Subscription' },
      });
    }
  }
};

const grantTrial = async (userId) => {
  const subscription = await startTrial(userId);
  if (subscription?.planId === 'trial') {
    const { trialDays } = await getSettings();
    await notifyOnce(userId, {
      dedupeKey: `trial-started:${userId}`,
      type: 'trial_started',
      title: 'Your free trial has started',
      body: `You have ${trialDays} days of premium access — likes, matches, and chat included.`,
      data: { route: 'Subscription' },
    });
  }
  return subscription;
};

const purchasedAfterFreeLikes = async (userId, limit) => {
  const [used, paid] = await Promise.all([
    Like.countDocuments({ fromUser: userId, consumedFree: true }),
    Payment.exists({ userId, status: 'paid' }),
  ]);
  return used >= limit && Boolean(paid);
};

module.exports = {
  purchasePlan,
  createRazorpayOrder,
  verifyRazorpayPayment,
  cancelSubscription,
  runSubscriptionCycle,
  grantTrial,
  purchasedAfterFreeLikes,
  getSettings,
};
