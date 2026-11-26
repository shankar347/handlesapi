const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Profile = require('../models/Profile');
const AppSetting = require('../models/AppSetting');
const Subscription = require('../models/Subscription');
const { genderBucket } = require('./matchPreferences');

const SETTINGS_KEY = 'platform';

/** Paid packages shown in-app + Razorpay checkout. */
const PLANS = {
  pro: {
    id: 'pro',
    name: 'Handles Pro',
    price: 499,
    days: 30,
    allowsLikes: true,
    allowsChat: true,
    badge: 'Starter',
    tagline: 'Keep liking and chatting after free likes run out.',
    perks: [
      'Unlimited likes while subscribed',
      'Chat with mutual matches',
      'See who liked you',
      'Standard Discover ranking',
      'Cancel anytime',
    ],
  },
  premium: {
    id: 'premium',
    name: 'Handles Premium',
    price: 999,
    days: 30,
    allowsLikes: true,
    allowsChat: true,
    badge: 'Most popular',
    tagline: 'Priority likes and smarter matching for serious dating.',
    perks: [
      'Everything in Handles Pro',
      'Priority likes in Discover',
      'Advanced filters that stick',
      'See likes before they expire',
      'Faster match notifications',
    ],
  },
  platinum: {
    id: 'platinum',
    name: 'Handles Platinum',
    price: 1499,
    days: 30,
    allowsLikes: true,
    allowsChat: true,
    badge: 'Best value',
    tagline: 'Maximum visibility and control for people ready to meet.',
    perks: [
      'Everything in Handles Premium',
      'Top placement in Discover',
      'Undo last pass',
      'Incognito browsing',
      'Priority support',
    ],
  },
};

const DEFAULT_FREE_LIKES = {
  woman: 50,
  man: 10,
  nonbinary: 10,
  unknown: 10,
};

let ready = null;

const ensurePlatform = async () => {
  if (!ready) {
    ready = (async () => {
      await AppSetting.findOneAndUpdate(
        { key: SETTINGS_KEY },
        {
          $setOnInsert: {
            key: SETTINGS_KEY,
            freeLikeLimit: 10,
            freeLikeLimitWoman: 50,
            freeLikeLimitMan: 10,
            trialDays: 7,
          },
        },
        { upsert: true },
      );
      // Keep gender defaults current for existing installs.
      await AppSetting.updateOne(
        { key: SETTINGS_KEY },
        {
          $set: {
            freeLikeLimitWoman: 50,
            freeLikeLimitMan: 10,
          },
        },
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
    freeLikeLimitWoman: Math.max(1, Number(doc?.freeLikeLimitWoman) || DEFAULT_FREE_LIKES.woman),
    freeLikeLimitMan: Math.max(1, Number(doc?.freeLikeLimitMan) || DEFAULT_FREE_LIKES.man),
    trialDays: Math.max(1, Number(doc?.trialDays) || 7),
  };
};

const freeLikeLimitForGender = (settings, gender) => {
  const bucket = genderBucket(gender);
  if (bucket === 'woman') return settings.freeLikeLimitWoman;
  if (bucket === 'man') return settings.freeLikeLimitMan;
  return settings.freeLikeLimitMan;
};

const freeLikeLimitForUser = async (userId) => {
  const [settings, profile] = await Promise.all([
    getSettings(),
    Profile.findOne({ userId }).select('gender').lean(),
  ]);
  return {
    settings,
    limit: freeLikeLimitForGender(settings, profile?.gender),
    gender: profile?.gender || '',
  };
};

const updateSettings = async (patch) => {
  await ensurePlatform();
  const next = {};
  const clamp = (value, label) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1 || n > 1000) {
      const error = new Error(`${label} must be between 1 and 1000`);
      error.statusCode = 400;
      throw error;
    }
    return Math.floor(n);
  };
  if (patch.freeLikeLimit != null) next.freeLikeLimit = clamp(patch.freeLikeLimit, 'Free like limit');
  if (patch.freeLikeLimitWoman != null) {
    next.freeLikeLimitWoman = clamp(patch.freeLikeLimitWoman, 'Women free like limit');
  }
  if (patch.freeLikeLimitMan != null) {
    next.freeLikeLimitMan = clamp(patch.freeLikeLimitMan, 'Men free like limit');
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
  DEFAULT_FREE_LIKES,
  ensurePlatform,
  getSettings,
  freeLikeLimitForGender,
  freeLikeLimitForUser,
  updateSettings,
  daysUntil,
  isEligible,
  currentSubscription,
  startTrial,
};
