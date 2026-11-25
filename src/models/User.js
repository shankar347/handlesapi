const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    phone: { type: String, default: null },
    phoneVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    emailVerifyHash: { type: String, default: null },
    emailVerifyExpires: { type: Date, default: null },
    emailVerifySentAt: { type: Date, default: null },
    onboardingComplete: { type: Boolean, default: false },
    homeReachedAt: { type: Date, default: null },
    notificationPrefs: {
      push: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true },
    },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: {
      type: String,
      enum: ['active', 'paused', 'banned'],
      default: 'active',
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('User', userSchema);
