const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    planId: { type: String, required: true },
    planName: { type: String, default: '' },
    status: {
      type: String,
      enum: ['trial', 'active', 'expired', 'cancelled'],
      required: true,
    },
    startsAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    cancelledAt: { type: Date, default: null },
    renewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

subscriptionSchema.index({ userId: 1, expiresAt: -1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
