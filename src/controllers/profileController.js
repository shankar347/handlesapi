const Profile = require('../models/Profile');
const User = require('../models/User');
const { success, failure } = require('../utils/apiResponse');

const PROFILE_FIELDS = [
  'name',
  'birthday',
  'gender',
  'interestedIn',
  'city',
  'state',
  'intention',
  'height',
  'education',
  'occupation',
  'drinking',
  'smoking',
  'religion',
  'languages',
  'interests',
  'prompt',
  'bio',
  'photos',
];

const getMyProfile = async (req, res, next) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) {
      return failure(res, { message: 'Profile not found', statusCode: 404 });
    }
    return success(res, { message: 'Profile loaded', data: { profile } });
  } catch (error) {
    return next(error);
  }
};

const updateMyProfile = async (req, res, next) => {
  try {
    const updates = {};
    for (const key of PROFILE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        updates[key] = req.body[key];
      }
    }
    if (updates.birthday) {
      updates.birthday = new Date(updates.birthday);
    }
    if (typeof updates.languages === 'string') {
      updates.languages = updates.languages
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    const profile = await Profile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: updates },
      { new: true, upsert: true },
    );

    const requiredDone =
      Boolean(profile.name) &&
      Boolean(profile.birthday) &&
      Boolean(profile.gender) &&
      Boolean(profile.city);

    if (requiredDone && !req.user.onboardingComplete) {
      await User.findByIdAndUpdate(req.user._id, { onboardingComplete: true });
    }

    return success(res, {
      message: 'Profile updated',
      data: {
        profile,
        onboardingComplete: requiredDone || req.user.onboardingComplete,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getMyProfile, updateMyProfile };
