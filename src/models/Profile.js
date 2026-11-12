const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, trim: true, default: '' },
    birthday: { type: Date, default: null },
    gender: { type: String, default: '' },
    interestedIn: { type: [String], default: [] },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    intention: { type: String, default: '' },
    height: { type: String, default: '' },
    education: { type: String, default: '' },
    occupation: { type: String, default: '' },
    drinking: { type: String, default: '' },
    smoking: { type: String, default: '' },
    religion: { type: String, default: '' },
    languages: { type: [String], default: [] },
    interests: { type: [String], default: [] },
    prompt: { type: String, default: '' },
    bio: { type: String, default: '' },
    photos: { type: [String], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Profile', profileSchema);
