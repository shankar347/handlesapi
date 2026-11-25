const mongoose = require('mongoose');

const faceAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    success: { type: Boolean, required: true },
    reason: { type: String, default: '' },
  },
  { timestamps: true },
);

module.exports = mongoose.model('FaceAttempt', faceAttemptSchema);
