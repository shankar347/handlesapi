const Like = require('../models/Like');
const Match = require('../models/Match');
const Profile = require('../models/Profile');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { notifyOnce } = require('./notificationService');
const {
  freeLikeLimitForUser,
  currentSubscription,
  isEligible,
} = require('./platformService');

const pairKeyFor = (a, b) => [String(a), String(b)].sort().join(':');

const likesUsed = (userId) => Like.countDocuments({ fromUser: userId, consumedFree: true });

const entitlementFor = async (userId) => {
  const [quota, used, profile, subscription] = await Promise.all([
    freeLikeLimitForUser(userId),
    likesUsed(userId),
    Profile.findOne({ userId }).select('faceVerified faceSkipped gender').lean(),
    currentSubscription(userId),
  ]);
  const eligible = isEligible(subscription);
  const limit = quota.limit;
  const remaining = Math.max(0, limit - used);
  return {
    faceVerified: Boolean(profile?.faceVerified),
    faceSkipped: Boolean(profile?.faceSkipped),
    gender: profile?.gender || '',
    limit,
    used,
    remaining,
    canLike: Boolean(profile?.faceVerified) && (used < limit || eligible),
    subscription: subscription
      ? {
          planId: subscription.planId,
          planName: subscription.planName,
          status: isEligible(subscription) ? subscription.status : 'expired',
          startsAt: subscription.startsAt,
          expiresAt: subscription.expiresAt,
          eligible,
        }
      : null,
  };
};

const openMatchConversation = async (userA, userB) => {
  let conversation = await Conversation.findOne({
    isBot: { $ne: true },
    participants: { $all: [userA, userB], $size: 2 },
  });
  if (!conversation) {
    conversation = await Conversation.create({
      participants: [userA, userB],
      isBot: false,
      lastMessageText: 'You matched. Say hello.',
      lastMessageAt: new Date(),
    });
  }
  return conversation;
};

const createLike = async (fromUserId, toUserId) => {
  if (!toUserId || String(fromUserId) === String(toUserId)) {
    const error = new Error('Choose another profile');
    error.statusCode = 400;
    throw error;
  }
  const target = await User.findById(toUserId).select('_id role email').lean();
  if (!target || target.role === 'admin') {
    const error = new Error('Profile not found');
    error.statusCode = 404;
    throw error;
  }

  const existing = await Like.findOne({ fromUser: fromUserId, toUser: toUserId });
  if (existing) {
    const matched = await Match.exists({ pairKey: pairKeyFor(fromUserId, toUserId) });
    return { like: existing, created: false, matched: Boolean(matched), entitlement: await entitlementFor(fromUserId) };
  }

  const profile = await Profile.findOne({ userId: fromUserId });
  if (!profile?.faceVerified) {
    const error = new Error('Verify your face before liking profiles');
    error.statusCode = 403;
    error.code = 'FACE_REQUIRED';
    throw error;
  }

  const subscription = await currentSubscription(fromUserId);
  const eligible = isEligible(subscription);
  const { limit: freeLikeLimit } = await freeLikeLimitForUser(fromUserId);
  const used = await likesUsed(fromUserId);
  let consumedFree = false;
  if (used < freeLikeLimit) {
    consumedFree = true;
  } else if (!eligible) {
    const error = new Error('Your free likes are exhausted. Upgrade to keep liking profiles.');
    error.statusCode = 402;
    error.code = 'LIKES_EXHAUSTED';
    throw error;
  }

  let like;
  try {
    like = await Like.create({
      fromUser: fromUserId,
      toUser: toUserId,
      consumedFree,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      const raced = await Like.findOne({ fromUser: fromUserId, toUser: toUserId });
      return { like: raced, created: false, matched: false, entitlement: await entitlementFor(fromUserId) };
    }
    throw error;
  }

  if (consumedFree) {
    const usedNow = await likesUsed(fromUserId);
    if (usedNow > freeLikeLimit) {
      await Like.deleteOne({ _id: like._id });
      const error = new Error('Your free likes are exhausted. Upgrade to keep liking profiles.');
      error.statusCode = 402;
      error.code = 'LIKES_EXHAUSTED';
      throw error;
    }
    const remaining = freeLikeLimit - usedNow;
    if (remaining === 5 || remaining === 1) {
      await notifyOnce(fromUserId, {
        dedupeKey: `likes-remaining:${fromUserId}:${remaining}`,
        type: 'likes_remaining',
        title: `You have ${remaining} free like${remaining === 1 ? '' : 's'} remaining`,
        body: remaining === 1
          ? 'You have 1 free like remaining.'
          : 'You have 5 free likes remaining.',
        data: { route: 'Discover' },
      });
    }
    if (remaining === 0) {
      await notifyOnce(fromUserId, {
        dedupeKey: `likes-exhausted:${fromUserId}`,
        type: 'likes_exhausted',
        title: 'Your free likes are exhausted',
        body: 'Your free likes are exhausted.',
        data: { route: 'Subscription' },
      });
      await notifyOnce(fromUserId, {
        dedupeKey: `likes-upgrade:${fromUserId}`,
        type: 'likes_upgrade',
        title: 'Upgrade your package',
        body: 'Upgrade your package to continue liking profiles.',
        data: { route: 'Subscription' },
      });
    }
  }

  const likerProfile = await Profile.findOne({ userId: fromUserId }).select('name').lean();
  const likerName = likerProfile?.name?.trim() || 'Someone';

  await notifyOnce(toUserId, {
    dedupeKey: `liked-you:${like._id}`,
    type: 'liked_you',
    title: 'New like',
    body: `${likerName} liked your profile. Like them back to match.`,
    data: { route: 'Likes', fromUserId: String(fromUserId) },
  });

  let matched = false;
  const reciprocal = await Like.findOne({ fromUser: toUserId, toUser: fromUserId });
  if (reciprocal) {
    const key = pairKeyFor(fromUserId, toUserId);
    let match = await Match.findOne({ pairKey: key });
    if (!match) {
      const conversation = await openMatchConversation(fromUserId, toUserId);
      try {
        match = await Match.create({
          users: [fromUserId, toUserId],
          pairKey: key,
          conversationId: conversation._id,
        });
      } catch (error) {
        if (error && error.code === 11000) {
          match = await Match.findOne({ pairKey: key });
        } else {
          throw error;
        }
      }
      if (match) {
        const otherProfiles = await Profile.find({
          userId: { $in: [fromUserId, toUserId] },
        })
          .select('userId name')
          .lean();
        const nameOf = (id) =>
          otherProfiles.find((p) => String(p.userId) === String(id))?.name?.trim() || 'your match';

        await notifyOnce(fromUserId, {
          dedupeKey: `match:${key}:${fromUserId}`,
          type: 'new_match',
          title: 'It’s a match! 🎉',
          body: `You and ${nameOf(toUserId)} liked each other. Say hello.`,
          data: {
            route: 'Matches',
            conversationId: String(conversation._id),
            matchUserId: String(toUserId),
          },
        });
        await notifyOnce(toUserId, {
          dedupeKey: `match:${key}:${toUserId}`,
          type: 'new_match',
          title: 'It’s a match! 🎉',
          body: `You and ${nameOf(fromUserId)} liked each other. Say hello.`,
          data: {
            route: 'Matches',
            conversationId: String(conversation._id),
            matchUserId: String(fromUserId),
          },
        });
      }
    }
    matched = Boolean(match);
  }

  return {
    like,
    created: true,
    matched,
    entitlement: await entitlementFor(fromUserId),
  };
};

const assertChatAllowed = async (senderId, conversation) => {
  if (conversation.isBot) return { ok: true };
  const others = conversation.participants.filter((id) => String(id) !== String(senderId));
  const otherId = others[0];
  if (!otherId) return { ok: false, status: 403, code: 'MATCH_REQUIRED', message: 'Chat opens after you both like each other.' };
  const match = await Match.findOne({ pairKey: pairKeyFor(senderId, otherId) });
  if (!match) {
    return {
      ok: false,
      status: 403,
      code: 'MATCH_REQUIRED',
      message: 'Chat opens after you both like each other.',
    };
  }
  // Mutual like is enough for text chat (no images/docs on client).
  return { ok: true };
};

module.exports = {
  createLike,
  entitlementFor,
  assertChatAllowed,
  pairKeyFor,
};
