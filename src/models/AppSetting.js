const mongoose = require('mongoose');

const appSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    freeLikeLimit: { type: Number, default: 10 },
    trialDays: { type: Number, default: 7 },
  },
  { timestamps: true },
);

module.exports = mongoose.model('AppSetting', appSettingSchema);
