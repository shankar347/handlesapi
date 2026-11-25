const DeviceToken = require('../models/DeviceToken');
const AppNotification = require('../models/AppNotification');
const User = require('../models/User');
const { success, failure } = require('../utils/apiResponse');
const {
  notifyWelcome,
  notifyProfileTip,
  sendToUser,
} = require('../services/pushService');
const { flushPendingPushes } = require('../services/notificationService');

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

    // Signup/login often creates alerts before FCM is registered — deliver them now.
    const flushed = await flushPendingPushes(req.user._id).catch(() => ({ sent: 0 }));

    return success(res, {
      message: 'Device registered for push notifications',
      data: { registered: true, flushed },
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

const listNotifications = async (req, res, next) => {
  try {
    const rows = await AppNotification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return success(res, {
      message: 'Notifications loaded',
      data: {
        notifications: rows.map((row) => ({
          id: String(row._id),
          type: row.type,
          title: row.title,
          body: row.body,
          data: row.data,
          read: row.read,
          createdAt: row.createdAt,
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
};

const markRead = async (req, res, next) => {
  try {
    await AppNotification.updateOne(
      { _id: req.params.id, userId: req.user._id },
      { $set: { read: true } },
    );
    return success(res, { message: 'Notification read' });
  } catch (error) {
    return next(error);
  }
};

const updatePreferences = async (req, res, next) => {
  try {
    const current = req.user.notificationPrefs || { push: true, inApp: true };
    const nextPrefs = {
      push: req.body?.push == null ? current.push !== false : Boolean(req.body.push),
      inApp: req.body?.inApp == null ? current.inApp !== false : Boolean(req.body.inApp),
    };
    await User.findByIdAndUpdate(req.user._id, { notificationPrefs: nextPrefs });
    return success(res, { message: 'Preferences saved', data: { notificationPrefs: nextPrefs } });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  registerDevice,
  unregisterDevice,
  sendTestPush,
  listNotifications,
  markRead,
  updatePreferences,
};
