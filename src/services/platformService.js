const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Profile = require('../models/Profile');
const AppSetting = require('../models/AppSetting');
const Subscription = require('../models/Subscription');

const SETTINGS_KEY = 'platform';
const PLANS = {
  plus: { id: 'plus', name: 'Plus', price: 499, days: 30, allowsLikes: true, allowsChat: true },
  premium: { id: 'premium', name: 'Premium', price: 999, days: 30, allowsLikes: true, allowsChat: true },
};

let ready = null;

const ensurePlatform = async () => {
  if (!ready) {
    ready = (async () => {
      await AppSetting.findOneAndUpdate(
        { key: SETTINGS_KEY },
        { $setOnInsert: { key: SETTINGS_KEY, freeLikeLimit: 10, trialDays: 7 } },
        { upsert: true },
      );
      const email = (process.env.ADMIN_EMAIL || 'admin@hingeapp.local').toLowerCase();
      const existing = await User.findOne({ email });
      if (!existing) {
        const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Phase1Shell!', 10);
        const admin = await User.create({
          email,
          passwordHash,
          role: 'admin',
          emailVerified: true,
          onboardingComplete: true,
        });
        await Profile.create({ userId: admin._id, name: 'Handles Admin' });
      }
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
};

const getSettings = async () => {
  await ensurePlatform();
  const doc = await AppSetting.findOne({ key: SETTINGS_KEY });
  return {
    freeLikeLimit: Math.max(1, Number(doc?.freeLikeLimit) || 10),
    trialDays: Math.max(1, Number(doc?.trialDays) || 7),
  };
};

const updateSettings = async (patch) => {
  await ensurePlatform();
  const next = {};
  if (patch.freeLikeLimit != null) {
    const limit = Number(patch.freeLikeLimit);
    if (!Number.isFinite(limit) || limit < 1 || limit > 1000) {
      const error = new Error('Free like limit must be between 1 and 1000');
      error.statusCode = 400;
      throw error;
    }
    next.freeLikeLimit = Math.floor(limit);
  }
  if (patch.trialDays != null) {
    const days = Number(patch.trialDays);
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      const error = new Error('Trial days must be between 1 and 90');
      error.statusCode = 400;
      throw error;
    }
    next.trialDays = Math.floor(days);
  }
  await AppSetting.updateOne({ key: SETTINGS_KEY }, { $set: next });
  return getSettings();
};

const daysUntil = (date, now = new Date()) => {
  const ms = new Date(date).getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
};

const isEligible = (subscription, now = new Date()) => {
  if (!subscription) return false;
  if (!['trial', 'active', 'cancelled'].includes(subscription.status)) return false;
  return new Date(subscription.expiresAt).getTime() > now.getTime();
};

const currentSubscription = async (userId) => {
  const rows = await Subscription.find({ userId }).sort({ expiresAt: -1 }).limit(5);
  const live = rows.find((row) => isEligible(row));
  return live || rows[0] || null;
};

const startTrial = async (userId) => {
  const existing = await Subscription.findOne({ userId });
  if (existing) return existing;
  const { trialDays } = await getSettings();
  const startsAt = new Date();
  const expiresAt = new Date(startsAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
  return Subscription.create({
    userId,
    planId: 'trial',
    planName: 'Free trial',
    status: 'trial',
    startsAt,
    expiresAt,
  });
};

module.exports = {
  PLANS,
  ensurePlatform,
  getSettings,
  updateSettings,
  daysUntil,
  isEligible,
  currentSubscription,
  startTrial,
};
