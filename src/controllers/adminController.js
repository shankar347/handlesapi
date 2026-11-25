const User = require('../models/User');
const Profile = require('../models/Profile');
const Like = require('../models/Like');
const Match = require('../models/Match');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const FaceAttempt = require('../models/FaceAttempt');
const { success, failure } = require('../utils/apiResponse');
const {
  getSettings,
  updateSettings,
  isEligible,
  daysUntil,
} = require('../services/platformService');
const { BOT_EMAIL } = require('../services/botService');
const { sendToAll } = require('../services/pushService');
const AppNotification = require('../models/AppNotification');
const { emitToUser } = require('../services/ioHub');

const memberQuery = { role: 'user', email: { $ne: BOT_EMAIL } };

const absoluteUpload = (req, relativePath) => {
  if (!relativePath) return '';
  if (/^https?:\/\//i.test(relativePath) || relativePath.startsWith('data:')) {
    return relativePath;
  }
  const origin = `${req.protocol}://${req.get('host')}`;
  return `${origin}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
};

const summary = async (req, res, next) => {
  try {
    const settings = await getSettings();
    const now = new Date();
    const users = await User.find(memberQuery).select('_id emailVerified onboardingComplete homeReachedAt createdAt').lean();
    const ids = users.map((user) => user._id);
    const profiles = await Profile.find({ userId: { $in: ids } })
      .select('userId faceVerified faceSkipped faceVerifiedAt')
      .lean();
    const profileByUser = new Map(profiles.map((profile) => [String(profile.userId), profile]));

    let emailVerified = 0;
    let onboardingComplete = 0;
    let homeReached = 0;
    let faceVerified = 0;
    let faceSkipped = 0;
    let faceIncomplete = 0;
    users.forEach((user) => {
      if (user.emailVerified) emailVerified += 1;
      if (user.onboardingComplete) onboardingComplete += 1;
      if (user.homeReachedAt) homeReached += 1;
      const profile = profileByUser.get(String(user._id));
      if (profile?.faceVerified) faceVerified += 1;
      else if (profile?.faceSkipped) faceSkipped += 1;
      else faceIncomplete += 1;
    });

    const [attempts, attemptSuccess, freeLikesUsed, totalLikes, totalMatches, activeConversations, totalMessages] =
      await Promise.all([
        FaceAttempt.countDocuments({ userId: { $in: ids } }),
        FaceAttempt.countDocuments({ userId: { $in: ids }, success: true }),
        Like.countDocuments({ consumedFree: true, fromUser: { $in: ids } }),
        Like.countDocuments({ fromUser: { $in: ids } }),
        Match.countDocuments({ users: { $in: ids } }),
        Conversation.countDocuments({ isBot: { $ne: true }, participants: { $in: ids } }),
        Message.countDocuments({ type: { $ne: 'bot' } }),
      ]);

    const subs = await Subscription.find({ userId: { $in: ids } }).lean();
    const tally = {
      trial: 0,
      active: 0,
      expired: 0,
      cancelled: 0,
      expiringIn5Days: 0,
      expiringTomorrow: 0,
      renewed: 0,
    };
    subs.forEach((sub) => {
      const days = daysUntil(sub.expiresAt, now);
      const live = isEligible(sub);
      if (sub.renewedAt) tally.renewed += 1;
      if (sub.status === 'cancelled') tally.cancelled += 1;
      if (!live || sub.status === 'expired') tally.expired += 1;
      else if (sub.status === 'trial') tally.trial += 1;
      else if (sub.status === 'active') tally.active += 1;
      if (live && days === 5) tally.expiringIn5Days += 1;
      if (live && days === 1) tally.expiringTomorrow += 1;
    });

    const freeLikeCounts = await Like.aggregate([
      { $match: { consumedFree: true, fromUser: { $in: ids } } },
      { $group: { _id: '$fromUser', used: { $sum: 1 } } },
    ]);
    const usedMap = new Map(freeLikeCounts.map((row) => [String(row._id), row.used]));
    const paidUserIds = new Set(
      (await Payment.find({ userId: { $in: ids }, status: 'paid' }).select('userId').lean()).map((row) =>
        String(row.userId),
      ),
    );
    let exhausted = 0;
    let remaining = 0;
    let purchasedAfterExhaust = 0;
    users.forEach((user) => {
      const profile = profileByUser.get(String(user._id));
      if (!profile?.faceVerified) return;
      const used = usedMap.get(String(user._id)) || 0;
      if (used >= settings.freeLikeLimit) {
        exhausted += 1;
        if (paidUserIds.has(String(user._id))) purchasedAfterExhaust += 1;
      } else {
        remaining += 1;
      }
    });

    return success(res, {
      message: 'Admin summary',
      data: {
        settings,
        onboarding: {
          registered: users.length,
          onboardingComplete,
          emailVerified,
          emailUnverified: users.length - emailVerified,
          faceVerified,
          faceSkipped,
          faceIncomplete,
          homeReached,
        },
        face: {
          verified: faceVerified,
          unverified: users.length - faceVerified,
          attempts,
          successful: attemptSuccess,
          failed: attempts - attemptSuccess,
        },
        swipes: {
          freeLikesUsed,
          exhausted,
          withRemaining: remaining,
          purchasedAfterExhaust,
          limit: settings.freeLikeLimit,
        },
        subscriptions: tally,
        matching: {
          likes: totalLikes,
          matches: totalMatches,
          activeConversations,
          messages: totalMessages,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const users = await User.find(memberQuery).sort({ createdAt: -1 }).limit(200).lean();
    const ids = users.map((user) => user._id);
    const profiles = await Profile.find({ userId: { $in: ids } })
      .select('userId name faceVerified faceSkipped facePhotoUrl photos city gender birthday')
      .lean();
    const byUser = new Map(profiles.map((profile) => [String(profile.userId), profile]));
    return success(res, {
      message: 'Users loaded',
      data: {
        users: users.map((user) => {
          const profile = byUser.get(String(user._id));
          const facePhoto = profile?.facePhotoUrl
            ? absoluteUpload(req, profile.facePhotoUrl)
            : profile?.photos?.[0]
              ? absoluteUpload(req, profile.photos[0])
              : '';
          return {
            id: String(user._id),
            email: user.email,
            name: profile?.name || '',
            city: profile?.city || '',
            gender: profile?.gender || '',
            createdAt: user.createdAt,
            emailVerified: user.emailVerified,
            onboardingComplete: user.onboardingComplete,
            homeReachedAt: user.homeReachedAt,
            faceVerified: Boolean(profile?.faceVerified),
            faceSkipped: Boolean(profile?.faceSkipped),
            facePhotoUrl: facePhoto,
            photos: (profile?.photos || []).map((photo) => absoluteUpload(req, photo)),
            status: user.status,
          };
        }),
      },
    });
  } catch (error) {
    return next(error);
  }
};

const userDetail = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.params.id, ...memberQuery }).lean();
    if (!user) return failure(res, { message: 'User not found', statusCode: 404 });
    const [profile, likesUsed, matchCount, subscription, payments, attempts] = await Promise.all([
      Profile.findOne({ userId: user._id }).lean(),
      Like.countDocuments({ fromUser: user._id, consumedFree: true }),
      Match.countDocuments({ users: user._id }),
      Subscription.findOne({ userId: user._id }).sort({ expiresAt: -1 }).lean(),
      Payment.find({ userId: user._id }).sort({ createdAt: -1 }).limit(5).lean(),
      FaceAttempt.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10).select('success reason createdAt').lean(),
    ]);
    const settings = await getSettings();
    const trial = subscription && subscription.planId === 'trial' ? subscription : null;
    return success(res, {
      message: 'User loaded',
      data: {
        user: {
          id: String(user._id),
          email: user.email,
          name: profile?.name || '',
          city: profile?.city || '',
          gender: profile?.gender || '',
          registeredAt: user.createdAt,
          emailVerified: user.emailVerified,
          faceVerified: Boolean(profile?.faceVerified),
          faceVerifiedAt: profile?.faceVerifiedAt || null,
          faceSkipped: Boolean(profile?.faceSkipped),
          faceSkippedAt: profile?.faceSkippedAt || null,
          facePhotoUrl: profile?.facePhotoUrl
            ? absoluteUpload(req, profile.facePhotoUrl)
            : '',
          photos: (profile?.photos || []).map((photo) => absoluteUpload(req, photo)),
          onboardingComplete: user.onboardingComplete,
          homeReachedAt: user.homeReachedAt,
          freeLikesUsed: likesUsed,
          freeLikesRemaining: Math.max(0, settings.freeLikeLimit - likesUsed),
          freeLikeLimit: settings.freeLikeLimit,
          subscription: subscription
            ? {
                planId: subscription.planId,
                planName: subscription.planName,
                status: isEligible(subscription) ? subscription.status : 'expired',
                startsAt: subscription.startsAt,
                expiresAt: subscription.expiresAt,
              }
            : { status: 'free', planName: null, startsAt: null, expiresAt: null },
          trialStartsAt: trial?.startsAt || null,
          trialExpiresAt: trial?.expiresAt || null,
          matchCount,
          accountStatus: user.status,
          payments: payments.map((payment) => ({
            id: String(payment._id),
            planId: payment.planId,
            amount: payment.amount,
            status: payment.status,
            createdAt: payment.createdAt,
          })),
          faceAttempts: attempts.map((attempt) => ({
            success: attempt.success,
            reason: attempt.reason,
            createdAt: attempt.createdAt,
          })),
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

const broadcastPush = async (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || req.body?.message || '').trim();
    if (!title || !body) {
      return failure(res, {
        message: 'Title and message are required',
        statusCode: 400,
      });
    }
    if (title.length > 80 || body.length > 240) {
      return failure(res, {
        message: 'Keep title under 80 characters and message under 240',
        statusCode: 400,
      });
    }

    const members = await User.find(memberQuery).select('_id').lean();
    const result = await sendToAll({
      title,
      body,
      data: { type: 'admin_broadcast', route: 'Notifications' },
    });

    // Also store an in-app alert for each member (best-effort, capped).
    const stamp = Date.now();
    const docs = members.slice(0, 500).map((user) => ({
      userId: user._id,
      type: 'admin_broadcast',
      title,
      body,
      data: { route: 'Notifications' },
      dedupeKey: `admin-broadcast:${stamp}:${user._id}`,
      read: false,
    }));
    if (docs.length) {
      await AppNotification.insertMany(docs, { ordered: false }).catch(() => {});
      members.slice(0, 500).forEach((user) => {
        emitToUser(user._id, 'notification:new', {
          type: 'admin_broadcast',
          title,
          body,
          data: { type: 'admin_broadcast', route: 'Notifications' },
        });
      });
    }

    return success(res, {
      message: 'Broadcast queued',
      data: {
        ...result,
        usersTargeted: members.length,
        title,
        body,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const listSubscriptions = async (req, res, next) => {
  try {
    const rows = await Subscription.find().sort({ expiresAt: 1 }).limit(200).lean();
    const ids = rows.map((row) => row.userId);
    const users = await User.find({ _id: { $in: ids } }).select('email').lean();
    const byId = new Map(users.map((user) => [String(user._id), user.email]));
    return success(res, {
      message: 'Subscriptions loaded',
      data: {
        subscriptions: rows.map((row) => ({
          id: String(row._id),
          userId: String(row.userId),
          email: byId.get(String(row.userId)) || '',
          planName: row.planName,
          status: isEligible(row) ? row.status : row.status === 'cancelled' ? 'cancelled' : 'expired',
          startsAt: row.startsAt,
          expiresAt: row.expiresAt,
          daysLeft: daysUntil(row.expiresAt),
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
};

const listMatches = async (req, res, next) => {
  try {
    const matches = await Match.find().sort({ createdAt: -1 }).limit(100).lean();
    return success(res, {
      message: 'Matches loaded',
      data: {
        matches: matches.map((match) => ({
          id: String(match._id),
          users: match.users.map(String),
          createdAt: match.createdAt,
          conversationId: match.conversationId ? String(match.conversationId) : null,
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
};

const patchSettings = async (req, res, next) => {
  try {
    const settings = await updateSettings(req.body || {});
    return success(res, { message: 'Settings saved', data: { settings } });
  } catch (error) {
    if (error.statusCode) {
      return failure(res, { message: error.message, statusCode: error.statusCode });
    }
    return next(error);
  }
};

module.exports = {
  summary,
  listUsers,
  userDetail,
  listSubscriptions,
  listMatches,
  patchSettings,
  broadcastPush,
};
