const Profile = require('../models/Profile');
const User = require('../models/User');
const Like = require('../models/Like');
const { success, failure } = require('../utils/apiResponse');
const {
  mutualPreference,
  prefersGender,
  locationScore,
  ageFrom,
  toDiscoverCard,
} = require('../services/matchPreferences');

const parseAgeRange = (value) => {
  if (!value) return null;
  const match = String(value).match(/(\d+)\D+(\d+)/);
  if (!match) return null;
  return { min: Number(match[1]), max: Number(match[2]) };
};

const listDiscover = async (req, res, next) => {
  try {
    const me = await Profile.findOne({ userId: req.user._id }).lean();
    if (!me) {
      return success(res, { message: 'Discover loaded', data: { profiles: [] } });
    }

    const ageMin = Number(req.query.ageMin) || 18;
    const ageMax = Number(req.query.ageMax) || 99;
    const ageDealbreaker = String(req.query.ageDealbreaker || 'true') !== 'false';
    const genderFilter = String(req.query.gender || 'preferred');
    const intention = String(req.query.intention || 'Any');
    const cityFilter = String(req.query.city || '').trim();

    const alreadyLiked = await Like.find({ fromUser: req.user._id }).select('toUser').lean();
    const likedIds = new Set(alreadyLiked.map((row) => String(row.toUser)));

    // Show active members with a profile (email verify not required for discover pool).
    const users = await User.find({
      _id: { $ne: req.user._id },
      role: 'user',
      status: 'active',
      email: { $not: /handles\.bot@/i },
    })
      .select('_id')
      .limit(800)
      .lean();

    const ids = users.map((user) => user._id).filter((id) => !likedIds.has(String(id)));
    const profiles = await Profile.find({
      userId: { $in: ids },
      name: { $nin: ['', null] },
    }).lean();

    const matchesFilters = (profile, { requireMutual }) => {
      if (genderFilter === 'preferred' || genderFilter === '' || genderFilter === 'Any') {
        if (requireMutual && !mutualPreference(me, profile)) return false;
        if (!requireMutual && !prefersGender(me.interestedIn, profile.gender)) return false;
      } else if (genderFilter === 'Everyone') {
        // open
      } else if (!prefersGender([genderFilter], profile.gender)) {
        return false;
      } else if (requireMutual && !prefersGender(profile.interestedIn, me.gender)) {
        return false;
      }

      const age = ageFrom(profile.birthday);
      if (ageDealbreaker && age != null && (age < ageMin || age > ageMax)) {
        return false;
      }

      if (intention && intention !== 'Any') {
        const theirs = String(profile.intention || '').toLowerCase();
        const want = String(intention).toLowerCase().slice(0, 8);
        if (theirs && want && !theirs.includes(want)) return false;
      }

      if (cityFilter) {
        if (String(profile.city || '').toLowerCase() !== cityFilter.toLowerCase()) {
          return false;
        }
      }
      return true;
    };

    const scoreCard = (profile) => {
      let score = locationScore(me, profile);
      const age = ageFrom(profile.birthday);
      if (age != null && age >= ageMin && age <= ageMax) score += 15;
      if (profile.photos?.length) score += 10;
      if (profile.faceVerified) score += 5;
      return {
        score,
        card: toDiscoverCard(profile.userId, profile, score),
      };
    };

    let matched = profiles.filter((profile) => matchesFilters(profile, { requireMutual: true }));
    // Prefer a fuller deck: fall back to one-way prefs, then open pool with names.
    if (matched.length < 12) {
      const relaxed = profiles.filter((profile) => matchesFilters(profile, { requireMutual: false }));
      if (relaxed.length > matched.length) matched = relaxed;
    }
    if (matched.length < 8) {
      matched = profiles;
    }

    const cards = matched
      .map(scoreCard)
      .sort((a, b) => b.score - a.score || String(a.card.name).localeCompare(String(b.card.name)))
      .slice(0, 120)
      .map((row) => row.card);

    return success(res, {
      message: 'Discover loaded',
      data: {
        profiles: cards,
        meta: {
          count: cards.length,
          basedOn: {
            gender: me.gender || '',
            interestedIn: me.interestedIn || [],
            city: me.city || '',
            state: me.state || '',
            filters: {
              ageMin,
              ageMax,
              ageDealbreaker,
              gender: genderFilter,
              intention,
              city: cityFilter || null,
            },
          },
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

const getDiscoverProfile = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    if (!userId || String(userId) === String(req.user._id)) {
      return failure(res, { message: 'Profile not found', statusCode: 404 });
    }
    const user = await User.findOne({
      _id: userId,
      role: 'user',
      status: 'active',
    })
      .select('_id emailVerified')
      .lean();
    if (!user) {
      return failure(res, { message: 'Profile not found', statusCode: 404 });
    }
    const profile = await Profile.findOne({ userId }).lean();
    if (!profile) {
      return failure(res, { message: 'Profile not found', statusCode: 404 });
    }

    const me = await Profile.findOne({ userId: req.user._id }).lean();
    const liked = await Like.exists({ fromUser: req.user._id, toUser: userId });
    const likedYou = await Like.exists({ fromUser: userId, toUser: req.user._id });
    const Match = require('../models/Match');
    const { pairKeyFor } = require('../services/likeService');
    const match = await Match.findOne({ pairKey: pairKeyFor(req.user._id, userId) })
      .select('conversationId')
      .lean();

    return success(res, {
      message: 'Profile loaded',
      data: {
        profile: {
          ...toDiscoverCard(userId, profile, me ? locationScore(me, profile) : 0),
          bio: profile.bio || '',
          prompt: profile.prompt || '',
          height: profile.height || '',
          education: profile.education || '',
          occupation: profile.occupation || '',
          drinking: profile.drinking || '',
          smoking: profile.smoking || '',
          religion: profile.religion || '',
          languages: profile.languages || [],
          interests: profile.interests || [],
          intention: profile.intention || '',
          birthday: profile.birthday || null,
          age: ageFrom(profile.birthday) || '',
          likedByMe: Boolean(liked),
          likedMe: Boolean(likedYou),
          canChat: Boolean(liked && likedYou),
          conversationId: match?.conversationId ? String(match.conversationId) : null,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listDiscover, getDiscoverProfile, parseAgeRange };
