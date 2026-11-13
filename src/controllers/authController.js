const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Profile = require('../models/Profile');
const { success, failure } = require('../utils/apiResponse');
const { JWT_SECRET } = require('../middleware/auth');

const signToken = (user) =>
  jwt.sign(
    { sub: user._id.toString(), email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '7d' },
  );

const publicUser = (user, profile) => ({
  id: user._id,
  email: user.email,
  phone: user.phone,
  onboardingComplete: user.onboardingComplete,
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
    const user = await User.create({
      email: String(email).toLowerCase().trim(),
      passwordHash,
      phone: phone || null,
    });
    await Profile.create({ userId: user._id });
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
      data: { token, user: publicUser(user, profile) },
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
    const profile = await Profile.findOne({ userId: user._id });
    const token = signToken(user);
    return success(res, {
      message: 'Logged in',
      data: { token, user: publicUser(user, profile) },
    });
  } catch (error) {
    return next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    return success(res, {
      message: 'Session loaded',
      data: { user: publicUser(req.user, profile) },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { register, login, me };
