const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Profile = require('../models/Profile');
const { success, failure } = require('../utils/apiResponse');
const { JWT_SECRET } = require('../middleware/auth');
const { issueEmailCode, codeMatches } = require('../services/emailService');
const { notifyOnce } = require('../services/notificationService');
const { ensurePlatform } = require('../services/platformService');
const { grantTrial } = require('../services/subscriptionService');
const { entitlementFor } = require('../services/likeService');

const signToken = (user) =>
  jwt.sign(
    { sub: user._id.toString(), email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '7d' },
  );

const publicUser = (user, profile, entitlement = null) => ({
  id: user._id,
  email: user.email,
  phone: user.phone,
  role: user.role,
  emailVerified: Boolean(user.emailVerified),
  onboardingComplete: user.onboardingComplete,
  homeReachedAt: user.homeReachedAt,
  faceVerified: Boolean(profile?.faceVerified),
  faceSkipped: Boolean(profile?.faceSkipped),
  likes: entitlement,
  profile: profile
    ? {
        name: profile.name,
        birthday: profile.birthday,
        gender: profile.gender,
        interestedIn: profile.interestedIn,
        city: profile.city,
        state: profile.state,
        intention: profile.intention,
        height: profile.height,
        education: profile.education,
        occupation: profile.occupation,
        drinking: profile.drinking,
        smoking: profile.smoking,
        religion: profile.religion,
        languages: profile.languages,
        interests: profile.interests,
        prompt: profile.prompt,
        bio: profile.bio,
        photos: profile.photos,
      }
    : null,
});

const register = async (req, res, next) => {
  try {
    const { email, password, phone } = req.body || {};
    if (!email || !password || String(password).length < 6) {
      return failure(res, {
        message: 'Email and password (min 6 chars) are required',
        statusCode: 400,
      });
    }
    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) {
      return failure(res, { message: 'Email already registered', statusCode: 409 });
    }
    const passwordHash = await bcrypt.hash(String(password), 10);
    await ensurePlatform();
    const user = await User.create({
      email: String(email).toLowerCase().trim(),
      passwordHash,
      phone: phone || null,
    });
    await Profile.create({ userId: user._id });
    const verification = await issueEmailCode(user);
    await grantTrial(user._id);
    await notifyOnce(user._id, {
      dedupeKey: `welcome:${user._id}`,
      type: 'welcome',
      title: 'Welcome to Handles 👋',
      body: 'Glad you’re here. Finish your profile and we’ll help you meet people nearby.',
      data: { route: 'Discover' },
    });
    await notifyOnce(user._id, {
      dedupeKey: `verify-email:${user._id}`,
      type: 'verify_email',
      title: 'Verify your email',
      body: 'Confirm your email so you can unlock Home and start matching.',
      data: { route: 'EmailVerify' },
    });
    const token = signToken(user);
    const profile = await Profile.findOne({ userId: user._id });

    // Welcome bot + push (non-blocking)
    setImmediate(() => {
      try {
        // eslint-disable-next-line global-require
        const { onboardNewUser } = require('../services/botService');
        const io = req.app.get('io');
        onboardNewUser(user._id, io);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Onboard bot failed', error.message);
      }
    });

    return success(res, {
      message: 'Account created',
      statusCode: 201,
      data: { token, user: publicUser(user, profile), devCode: verification.devCode },
    });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return failure(res, { message: 'Email and password are required', statusCode: 400 });
    }
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      return failure(res, { message: 'Invalid email or password', statusCode: 401 });
    }
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      return failure(res, { message: 'Invalid email or password', statusCode: 401 });
    }
    await ensurePlatform();
    const profile = await Profile.findOne({ userId: user._id });
    const entitlement = await entitlementFor(user._id);
    const token = signToken(user);
    return success(res, {
      message: 'Logged in',
      data: { token, user: publicUser(user, profile, entitlement) },
    });
  } catch (error) {
    return next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    const entitlement = await entitlementFor(req.user._id);
    return success(res, {
      message: 'Session loaded',
      data: { user: publicUser(req.user, profile, entitlement) },
    });
  } catch (error) {
    return next(error);
  }
};

const verifyEmail = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (user.emailVerified) {
      return success(res, { message: 'Email already verified', data: { emailVerified: true } });
    }
    if (!codeMatches(user, req.body?.code)) {
      return failure(res, { message: 'That code is invalid or expired', statusCode: 400 });
    }
    user.emailVerified = true;
    user.emailVerifyHash = null;
    user.emailVerifyExpires = null;
    await user.save();
    return success(res, { message: 'Email verified', data: { emailVerified: true } });
  } catch (error) {
    return next(error);
  }
};

const resendVerification = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (user.emailVerified) {
      return success(res, { message: 'Email already verified', data: { emailVerified: true } });
    }
    if (user.emailVerifySentAt && Date.now() - user.emailVerifySentAt.getTime() < 30000) {
      return failure(res, { message: 'Wait a few seconds before requesting another code', statusCode: 429 });
    }
    const verification = await issueEmailCode(user);
    await notifyOnce(user._id, {
      dedupeKey: `verify-email:${user._id}`,
      type: 'verify_email',
      title: 'Please verify your email',
      body: 'Please verify your email.',
      data: { route: 'EmailVerify' },
    });
    return success(res, {
      message: 'Verification email sent',
      data: { sent: true, devCode: verification.devCode },
    });
  } catch (error) {
    return next(error);
  }
};

const markHomeReached = async (req, res, next) => {
  try {
    if (!req.user.emailVerified) {
      return failure(res, {
        message: 'Verify your email before opening Home',
        statusCode: 403,
        data: { code: 'EMAIL_UNVERIFIED' },
      });
    }
    if (!req.user.homeReachedAt) {
      req.user.homeReachedAt = new Date();
      await req.user.save();
    }
    return success(res, {
      message: 'Home reached',
      data: { homeReachedAt: req.user.homeReachedAt },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  register,
  login,
  me,
  verifyEmail,
  resendVerification,
  markHomeReached,
};
