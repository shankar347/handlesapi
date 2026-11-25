const assert = require('assert');
const mongoose = require('mongoose');
const request = require('supertest');
const { PNG } = require('pngjs');

const expect = (received) => ({
  toBe: (expected) => assert.strictEqual(received, expected),
  toBeGreaterThan: (expected) => assert.ok(received > expected, `${received} <= ${expected}`),
  toBeGreaterThanOrEqual: (expected) => assert.ok(received >= expected, `${received} < ${expected}`),
  toBeTruthy: () => assert.ok(received),
  not: {
    toMatch: (pattern) => assert.equal(pattern.test(received), false),
  },
});

let app;

const paintFace = () => {
  const width = 160;
  const height = 200;
  const png = new PNG({ width, height });
  const inEllipse = (x, y, cx, cy, rx, ry) => {
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const eye = inEllipse(x, y, 62, 78, 7, 5) || inEllipse(x, y, 98, 78, 7, 5);
      const mouth = inEllipse(x, y, 80, 118, 10, 4);
      let rgb = [72, 96, 128];
      if (inEllipse(x, y, 80, 96, 42, 58)) rgb = [214, 156, 120];
      if (eye || mouth) rgb = [20, 16, 14];
      const i = (y * width + x) * 4;
      png.data[i] = rgb[0];
      png.data[i + 1] = rgb[1];
      png.data[i + 2] = rgb[2];
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png).toString('base64');
};

const registerUser = async (email) => {
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: 'secret12' });
  expect(response.status).toBe(201);
  return {
    token: response.body.data.token,
    code: response.body.data.devCode,
    id: response.body.data.user.id,
  };
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const main = async () => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/handles_rules_test';
  process.env.JWT_ACCESS_SECRET = 'test-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh';
  // eslint-disable-next-line global-require
  app = require('../src/app');
    const anna = await registerUser('anna@example.com');
    const ben = await registerUser('ben@example.com');

    const blocked = await request(app)
      .get('/api/v1/discover')
      .set(auth(anna.token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.data.code).toBe('EMAIL_UNVERIFIED');

    const wrong = await request(app)
      .post('/api/v1/auth/verify-email')
      .set(auth(anna.token))
      .send({ code: '000000' });
    expect(wrong.status).toBe(400);

    const verified = await request(app)
      .post('/api/v1/auth/verify-email')
      .set(auth(anna.token))
      .send({ code: anna.code });
    expect(verified.body.data.emailVerified).toBe(true);
    await request(app)
      .post('/api/v1/auth/verify-email')
      .set(auth(ben.token))
      .send({ code: ben.code });

    const home = await request(app)
      .post('/api/v1/auth/home-reached')
      .set(auth(anna.token));
    expect(home.status).toBe(200);

    const skipped = await request(app)
      .post('/api/v1/face/skip')
      .set(auth(anna.token));
    expect(skipped.body.data.faceVerified).toBe(false);

    const browse = await request(app)
      .get('/api/v1/discover')
      .set(auth(anna.token));
    expect(browse.status).toBe(200);

    const cannotLike = await request(app)
      .post('/api/v1/likes')
      .set(auth(anna.token))
      .send({ toUserId: ben.id });
    expect(cannotLike.status).toBe(403);
    expect(cannotLike.body.data.code).toBe('FACE_REQUIRED');

    const flat = Buffer.alloc(80 * 80 * 4, 180);
    const { PNG } = require('pngjs');
    const blank = new PNG({ width: 80, height: 80 });
    blank.data = flat;
    const rejected = await request(app)
      .post('/api/v1/face/verify')
      .set(auth(anna.token))
      .send({ consent: true, imageBase64: PNG.sync.write(blank).toString('base64') });
    expect(rejected.status).toBe(422);

    const noConsent = await request(app)
      .post('/api/v1/face/verify')
      .set(auth(anna.token))
      .send({ consent: false, imageBase64: paintFace() });
    expect(noConsent.status).toBe(400);

    const face = paintFace();
    const passed = await request(app)
      .post('/api/v1/face/verify')
      .set(auth(anna.token))
      .send({ consent: true, imageBase64: face });
    expect(passed.status).toBe(200);
    expect(passed.body.data.faceVerified).toBe(true);
    await request(app)
      .post('/api/v1/face/verify')
      .set(auth(ben.token))
      .send({ consent: true, imageBase64: face });

    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hingeapp.local', password: 'Phase1Shell!' });
    expect(adminLogin.status).toBe(200);
    await request(app)
      .patch('/api/v1/admin/settings')
      .set(auth(adminLogin.body.data.token))
      .send({ freeLikeLimit: 1 })
      .expect(200);

    const Subscription = require('../src/models/Subscription');
    await Subscription.updateMany({}, {
      $set: { status: 'expired', expiresAt: new Date(Date.now() - 1000) },
    });

    const cara = await registerUser('cara@example.com');
    await request(app)
      .post('/api/v1/auth/verify-email')
      .set(auth(cara.token))
      .send({ code: cara.code });

    const first = await request(app)
      .post('/api/v1/likes')
      .set(auth(anna.token))
      .send({ toUserId: ben.id });
    expect(first.status).toBe(201);
    expect(first.body.data.entitlement.used).toBe(1);

    const duplicate = await request(app)
      .post('/api/v1/likes')
      .set(auth(anna.token))
      .send({ toUserId: ben.id });
    expect(duplicate.body.data.created).toBe(false);
    expect(duplicate.body.data.entitlement.used).toBe(1);

    const exhausted = await request(app)
      .post('/api/v1/likes')
      .set(auth(anna.token))
      .send({ toUserId: cara.id });
    expect(exhausted.status).toBe(402);
    expect(exhausted.body.data.code).toBe('LIKES_EXHAUSTED');

    const upgrade = await request(app)
      .post('/api/v1/subscriptions/purchase')
      .set(auth(anna.token))
      .send({ planId: 'premium' });
    expect(upgrade.status).toBe(201);

    const afterUpgrade = await request(app)
      .post('/api/v1/likes')
      .set(auth(anna.token))
      .send({ toUserId: cara.id });
    expect(afterUpgrade.status).toBe(201);

    const mutual = await request(app)
      .post('/api/v1/likes')
      .set(auth(ben.token))
      .send({ toUserId: anna.id });
    expect(mutual.body.data.matched).toBe(true);

    const Match = require('../src/models/Match');
    const match = await Match.findOne({ users: anna.id });
    const chatBlocked = await request(app)
      .post(`/api/v1/chat/conversations/${match.conversationId}/messages`)
      .set(auth(anna.token))
      .send({ text: 'hello' });
    expect(chatBlocked.status).toBe(402);

    await request(app)
      .post('/api/v1/subscriptions/purchase')
      .set(auth(anna.token))
      .send({ planId: 'plus' });
    await request(app)
      .post('/api/v1/subscriptions/purchase')
      .set(auth(ben.token))
      .send({ planId: 'plus' });

    const chatOk = await request(app)
      .post(`/api/v1/chat/conversations/${match.conversationId}/messages`)
      .set(auth(anna.token))
      .send({ text: 'hello' });
    expect(chatOk.status).toBe(201);

    const history = await request(app)
      .get(`/api/v1/chat/conversations/${match.conversationId}/messages`)
      .set(auth(ben.token));
    expect(history.status).toBe(200);
    expect(history.body.data.messages.some((row) => row.text === 'hello')).toBe(true);

    const { runSubscriptionCycle } = require('../src/services/subscriptionService');
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await Subscription.updateMany({ userId: anna.id, planId: 'plus' }, { $set: { status: 'active', expiresAt: soon } });
    await runSubscriptionCycle(new Date());
    await runSubscriptionCycle(new Date());

    const AppNotification = require('../src/models/AppNotification');
    const fiveDay = await AppNotification.countDocuments({
      userId: anna.id,
      type: 'subscription_5_days',
    });
    expect(fiveDay).toBe(1);

    const welcome = await AppNotification.countDocuments({
      userId: anna.id,
      type: 'welcome',
    });
    expect(welcome).toBe(1);

    const adminSummary = await request(app)
      .get('/api/v1/admin/summary')
      .set(auth(adminLogin.body.data.token));
    expect(adminSummary.status).toBe(200);
    expect(adminSummary.body.data.onboarding.emailVerified).toBeGreaterThanOrEqual(2);
    expect(adminSummary.body.data.face.successful).toBeGreaterThanOrEqual(2);
    expect(adminSummary.body.data.matching.matches).toBeGreaterThanOrEqual(1);

    const detail = await request(app)
      .get(`/api/v1/admin/users/${anna.id}`)
      .set(auth(adminLogin.body.data.token));
    expect(detail.status).toBe(200);
    expect(detail.body.data.user.emailVerified).toBe(true);
    expect(detail.body.data.user.faceVerified).toBe(true);
    expect(detail.body.data.user.faceAttempts.length).toBeGreaterThan(0);
    expect(detail.body.data.user.faceAttempts[0].reason).toBeTruthy();
    expect(JSON.stringify(detail.body.data.user)).not.toMatch(/imageBase64/);
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
  // eslint-disable-next-line no-console
  console.log('journey ok');
};

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  try {
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  } catch (cleanupError) {
    // ignore
  }
  process.exit(1);
});
