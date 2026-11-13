const DeviceToken = require('../models/DeviceToken');
const { success, failure } = require('../utils/apiResponse');
const {
  notifyWelcome,
  notifyProfileTip,
  sendToUser,
} = require('../services/pushService');

const registerDevice = async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    const platform = req.body?.platform || 'android';
    if (!token) {
      return failure(res, { message: 'FCM device token required', statusCode: 400 });
    }

    await DeviceToken.findOneAndUpdate(
      { token },
      {
        userId: req.user._id,
        token,
        platform,
        active: true,
      },
      { upsert: true, new: true },
    );

    return success(res, {
      message: 'Device registered for push notifications',
      data: { registered: true },
    });
  } catch (error) {
    return next(error);
  }
};

const unregisterDevice = async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (token) {
      await DeviceToken.updateOne({ token }, { active: false });
    }
    return success(res, { message: 'Device unregistered' });
  } catch (error) {
    return next(error);
  }
};

/** Dev/helper: fire a sample notification to the current user. */
const sendTestPush = async (req, res, next) => {
  try {
    const type = req.body?.type || 'welcome';
    let result;
    if (type === 'tip') {
      result = await notifyProfileTip(req.user._id);
    } else if (type === 'custom') {
      result = await sendToUser(req.user._id, {
        title: req.body?.title || 'Handles',
        body: req.body?.body || 'Test notification',
        data: { type: 'custom' },
      });
    } else {
      result = await notifyWelcome(req.user._id);
    }
    return success(res, { message: 'Push queued', data: result });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  registerDevice,
  unregisterDevice,
  sendTestPush,
};
