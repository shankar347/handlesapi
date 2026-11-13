const DeviceToken = require('../models/DeviceToken');

let firebaseApp = null;

const initFirebase = () => {
  if (firebaseApp) return firebaseApp;
  try {
    // Prefer full service-account JSON path, or individual env vars.
    const {
      FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL,
      FIREBASE_PRIVATE_KEY,
      FIREBASE_SERVICE_ACCOUNT_JSON,
    } = process.env;

    if (!FIREBASE_PROJECT_ID && !FIREBASE_SERVICE_ACCOUNT_JSON) {
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

    let credential;
    if (FIREBASE_SERVICE_ACCOUNT_JSON) {
      credential = admin.credential.cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON));
    } else {
      credential = admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: String(FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      });
    }

    firebaseApp = admin.initializeApp({ credential });
    // eslint-disable-next-line no-console
    console.log('Push: Firebase Admin ready');
    return firebaseApp;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Push: Firebase init failed —', error.message);
    return null;
  }
};

const sendToUser = async (userId, { title, body, data = {} }) => {
  const tokens = await DeviceToken.find({ userId, active: true }).lean();
  if (!tokens.length) {
    return { sent: 0, reason: 'no_tokens' };
  }

  const app = initFirebase();
  if (!app) {
    // eslint-disable-next-line no-console
    console.log(`[push:dry-run] user=${userId} title="${title}" body="${body}"`);
    return { sent: 0, dryRun: true, tokens: tokens.length };
  }

  // eslint-disable-next-line global-require
  const admin = require('firebase-admin');
  const message = {
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)]),
    ),
    tokens: tokens.map((t) => t.token),
  };

  const result = await admin.messaging().sendEachForMulticast(message);
  return {
    sent: result.successCount,
    failed: result.failureCount,
  };
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

module.exports = {
  initFirebase,
  sendToUser,
  notifyNewMessage,
  notifyWelcome,
  notifyProfileTip,
  notifyMatch,
};
