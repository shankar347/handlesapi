const env = require('../config/env');
const { success, failure } = require('../utils/apiResponse');
const { currentSubscription, isEligible, PLANS } = require('../services/platformService');
const {
  purchasePlan,
  cancelSubscription,
  createRazorpayOrder,
  verifyRazorpayPayment,
} = require('../services/subscriptionService');
const razorpayService = require('../services/razorpayService');

const present = (subscription) => {
  if (!subscription) {
    return { status: 'free', eligible: false, planId: null, planName: null };
  }
  const eligible = isEligible(subscription);
  return {
    planId: subscription.planId,
    planName: subscription.planName,
    status: eligible ? subscription.status : 'expired',
    startsAt: subscription.startsAt,
    expiresAt: subscription.expiresAt,
    eligible,
    cancelledAt: subscription.cancelledAt,
  };
};

const getMine = async (req, res, next) => {
  try {
    const subscription = await currentSubscription(req.user._id);
    return success(res, {
      message: 'Subscription loaded',
      data: {
        subscription: present(subscription),
        plans: Object.values(PLANS),
        razorpayConfigured: razorpayService.isConfigured(),
      },
    });
  } catch (error) {
    return next(error);
  }
};

/** Internal/dev purchase — blocked in production when Razorpay is configured. */
const purchase = async (req, res, next) => {
  try {
    if (env.isProduction && razorpayService.isConfigured()) {
      return failure(res, {
        message: 'Use Razorpay checkout in production',
        statusCode: 400,
        data: { code: 'USE_RAZORPAY' },
      });
    }
    const { subscription, payment } = await purchasePlan(req.user._id, req.body?.planId);
    return success(res, {
      message: 'Payment was successful',
      statusCode: 201,
      data: {
        subscription: present(subscription),
        payment: { id: payment._id, amount: payment.amount, status: payment.status },
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return failure(res, { message: error.message, statusCode: error.statusCode });
    }
    return next(error);
  }
};

const createOrder = async (req, res, next) => {
  try {
    const { plan, order } = await createRazorpayOrder(req.user._id, req.body?.planId);
    return success(res, {
      message: 'Razorpay order created',
      statusCode: 201,
      data: {
        order,
        plan: { id: plan.id, name: plan.name, price: plan.price, days: plan.days },
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return failure(res, {
        message: error.message,
        statusCode: error.statusCode,
        data: { code: error.code },
      });
    }
    return next(error);
  }
};

const verifyPayment = async (req, res, next) => {
  try {
    const result = await verifyRazorpayPayment(req.user._id, {
      planId: req.body?.planId,
      razorpay_order_id: req.body?.razorpay_order_id,
      razorpay_payment_id: req.body?.razorpay_payment_id,
      razorpay_signature: req.body?.razorpay_signature,
    });
    return success(res, {
      message: 'Payment verified',
      data: {
        subscription: present(result.subscription),
        payment: {
          id: result.payment._id,
          amount: result.payment.amount,
          status: result.payment.status,
        },
        alreadyPaid: Boolean(result.alreadyPaid),
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return failure(res, {
        message: error.message,
        statusCode: error.statusCode,
        data: { code: error.code },
      });
    }
    return next(error);
  }
};

const cancel = async (req, res, next) => {
  try {
    const subscription = await cancelSubscription(req.user._id);
    return success(res, {
      message: 'Subscription cancelled',
      data: { subscription: present(subscription) },
    });
  } catch (error) {
    if (error.statusCode) {
      return failure(res, { message: error.message, statusCode: error.statusCode });
    }
    return next(error);
  }
};

module.exports = { getMine, purchase, cancel, createOrder, verifyPayment };
