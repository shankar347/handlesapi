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
    onboardingComplete: { type: Boolean, default: false },
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
