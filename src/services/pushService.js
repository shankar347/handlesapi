const fs = require('fs');
const path = require('path');
const DeviceToken = require('../models/DeviceToken');

let firebaseApp = null;

const loadServiceAccount = () => {
  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
    FIREBASE_SERVICE_ACCOUNT_JSON,
    FIREBASE_SERVICE_ACCOUNT_PATH,
    GOOGLE_APPLICATION_CREDENTIALS,
  } = process.env;

  if (FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  const filePath =
    FIREBASE_SERVICE_ACCOUNT_PATH ||
    GOOGLE_APPLICATION_CREDENTIALS ||
    path.resolve(__dirname, '../../firebase-service-account.json');

  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    return {
      project_id: FIREBASE_PROJECT_ID,
      client_email: FIREBASE_CLIENT_EMAIL,
      private_key: String(FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n'),
    };
  }

  return null;
};

const initFirebase = () => {
  if (firebaseApp) return firebaseApp;
  try {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      // eslint-disable-next-line no-console
      console.log('Push: Firebase not configured — tokens stored, pushes logged only.');
      return null;
    }

    // Lazy require so the API boots even without firebase credentials.
    // eslint-disable-next-line global-require
    const admin = require('firebase-admin');
    if (admin.apps.length) {
      firebaseApp = admin.app();
      return firebaseApp;
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID,
    });
    // eslint-disable-next-line no-console
    console.log('Push: Firebase Admin ready');
    return firebaseApp;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Push: Firebase init failed —', error.message);
    return null;
  }
};

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
]);

const deactivateBadTokens = async (tokens, responses = []) => {
  const bad = [];
  responses.forEach((entry, index) => {
    if (entry.success) return;
    const code = entry.error?.code || '';
    if (INVALID_TOKEN_CODES.has(code) || /registration-token|not-registered/i.test(code)) {
      bad.push(tokens[index]);
    }
  });
  if (!bad.length) return;
  await DeviceToken.updateMany({ token: { $in: bad } }, { active: false });
};

const sendToUser = async (userId, { title, body, data = {} }) => {
  const rows = await DeviceToken.find({ userId, active: true }).lean();
  if (!rows.length) {
    // eslint-disable-next-line no-console
    console.log(`[push] skip user=${userId} reason=no_tokens title="${title}"`);
    return { sent: 0, reason: 'no_tokens' };
  }

  const app = initFirebase();
  if (!app) {
    // eslint-disable-next-line no-console
    console.log(`[push:dry-run] user=${userId} title="${title}" body="${body}"`);
    return { sent: 0, dryRun: true, tokens: rows.length };
  }

  // eslint-disable-next-line global-require
  const admin = require('firebase-admin');
  const stringData = Object.fromEntries(
    Object.entries({
      ...data,
      title: title || '',
      body: body || '',
    }).map(([k, v]) => [k, String(v ?? '')]),
  );

  // notification + data → system tray when app is background/killed;
  // foreground is handled by the app with Notifee (same look as other dating apps).
  const message = {
    notification: {
      title: title || 'Handles',
      body: body || '',
    },
    data: stringData,
    android: {
      priority: 'high',
      ttl: 3600 * 1000,
      notification: {
        channelId: 'handles_default',
        icon: 'ic_stat_handles',
        color: '#00ABBB',
        defaultSound: true,
        defaultVibrateTimings: true,
        priority: 'high',
        visibility: 'public',
        notificationCount: 1,
        tag: stringData.notificationId || stringData.type || 'handles',
      },
    },
    apns: {
      payload: {
        aps: {
          alert: { title: title || 'Handles', body: body || '' },
          sound: 'default',
          badge: 1,
        },
      },
    },
    tokens: rows.map((t) => t.token),
  };

  try {
    const result = await admin.messaging().sendEachForMulticast(message);
    await deactivateBadTokens(
      rows.map((t) => t.token),
      result.responses,
    );
    if (result.failureCount) {
      const sample = result.responses.find((r) => !r.success);
      // eslint-disable-next-line no-console
      console.warn(
        `[push] user=${userId} sent=${result.successCount} failed=${result.failureCount}` +
          (sample?.error ? ` err=${sample.error.code}` : ''),
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`[push] user=${userId} sent=${result.successCount} title="${title}"`);
    }
    return {
      sent: result.successCount,
      failed: result.failureCount,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[push] user=${userId} error=${error.message}`);
    return { sent: 0, error: error.message };
  }
};

const notifyNewMessage = async (recipientId, { senderName, text, conversationId }) =>
  sendToUser(recipientId, {
    title: senderName || 'New message',
    body: text?.slice(0, 120) || 'You have a new message',
    data: {
      type: 'chat_message',
      conversationId: String(conversationId),
    },
  });

const notifyWelcome = async (userId) =>
  sendToUser(userId, {
    title: 'Welcome to Handles',
    body: 'You’re new here — complete your profile and say hello to someone nearby.',
    data: { type: 'welcome' },
  });

const notifyProfileTip = async (userId) =>
  sendToUser(userId, {
    title: 'Tip for more likes',
    body: 'Profiles with 3+ photos and a prompt get noticed faster.',
    data: { type: 'engagement_tip' },
  });

const notifyMatch = async (userId, { name }) =>
  sendToUser(userId, {
    title: 'It’s a match!',
    body: `You and ${name || 'someone'} liked each other. Start the chat.`,
    data: { type: 'match' },
  });

/** Admin broadcast — send the same push to every active device token (chunks of 500). */
const sendToAll = async ({ title, body, data = {} }) => {
  const rows = await DeviceToken.find({ active: true }).lean();
  if (!rows.length) {
    return { sent: 0, failed: 0, devices: 0, reason: 'no_tokens' };
  }

  const app = initFirebase();
  if (!app) {
    // eslint-disable-next-line no-console
    console.log(`[push:broadcast:dry-run] devices=${rows.length} title="${title}"`);
    return { sent: 0, dryRun: true, devices: rows.length };
  }

  // eslint-disable-next-line global-require
  const admin = require('firebase-admin');
  const stringData = Object.fromEntries(
    Object.entries({
      ...data,
      type: data.type || 'admin_broadcast',
      title: title || '',
      body: body || '',
    }).map(([k, v]) => [k, String(v ?? '')]),
  );

  let sent = 0;
  let failed = 0;
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const message = {
      notification: {
        title: title || 'Handles',
        body: body || '',
      },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          channelId: 'handles_default',
          icon: 'ic_stat_handles',
          color: '#00ABBB',
          defaultSound: true,
          defaultVibrateTimings: true,
          priority: 'high',
          visibility: 'public',
        },
      },
      tokens: chunk.map((row) => row.token),
    };
    // eslint-disable-next-line no-await-in-loop
    const result = await admin.messaging().sendEachForMulticast(message);
    sent += result.successCount;
    failed += result.failureCount;
    // eslint-disable-next-line no-await-in-loop
    await deactivateBadTokens(
      chunk.map((row) => row.token),
      result.responses,
    );
  }

  // eslint-disable-next-line no-console
  console.log(`[push:broadcast] devices=${rows.length} sent=${sent} failed=${failed}`);
  return { sent, failed, devices: rows.length };
};

module.exports = {
  initFirebase,
  sendToUser,
  sendToAll,
  notifyNewMessage,
  notifyWelcome,
  notifyProfileTip,
  notifyMatch,
};
