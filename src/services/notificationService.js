const AppNotification = require('../models/AppNotification');
const User = require('../models/User');
const { sendToUser } = require('./pushService');
const { emitToUser } = require('./ioHub');

const notifyOnce = async (userId, {
  dedupeKey,
  type,
  title,
  body,
  data = {},
  push = true,
}) => {
  if (!userId || !dedupeKey) return null;
  const user = await User.findById(userId).select('notificationPrefs').lean();
  if (!user) return null;
  const prefs = user.notificationPrefs || {};
  if (prefs.inApp === false && prefs.push === false) return null;

  try {
    const doc = await AppNotification.create({
      userId,
      type,
      title,
      body,
      data,
      dedupeKey,
      read: false,
    });

    const payload = {
      id: String(doc._id),
      type,
      title,
      body,
      data: { ...data, type, notificationId: String(doc._id) },
      createdAt: doc.createdAt,
    };

    // Realtime banner for users who are logged in / app open.
    if (prefs.inApp !== false) {
      emitToUser(userId, 'notification:new', payload);
    }

    if (push && prefs.push !== false) {
      await sendToUser(userId, {
        title,
        body,
        data: payload.data,
      });
    }
    return doc;
  } catch (error) {
    if (error && error.code === 11000) return null;
    throw error;
  }
};

/** Re-push recent unread alerts after an FCM token is registered (signup race). */
const flushPendingPushes = async (userId, { minutes = 30, limit = 8 } = {}) => {
  if (!userId) return { sent: 0 };
  const since = new Date(Date.now() - minutes * 60 * 1000);
  const rows = await AppNotification.find({
    userId,
    read: false,
    createdAt: { $gte: since },
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();

  let sent = 0;
  for (const row of rows) {
    const result = await sendToUser(userId, {
      title: row.title,
      body: row.body,
      data: {
        ...(row.data || {}),
        type: row.type,
        notificationId: String(row._id),
      },
    });
    if (result?.sent > 0) sent += result.sent;
  }
  return { sent, queued: rows.length };
};

module.exports = { notifyOnce, flushPendingPushes };
