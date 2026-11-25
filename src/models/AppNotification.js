const mongoose = require('mongoose');

const appNotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false },
    dedupeKey: { type: String, required: true },
  },
  { timestamps: true },
);

appNotificationSchema.index({ dedupeKey: 1 }, { unique: true });
appNotificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AppNotification', appNotificationSchema);
