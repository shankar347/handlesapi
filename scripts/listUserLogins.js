require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Profile = require('../src/models/Profile');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const users = await User.find({})
    .select('email role emailVerified onboardingComplete status createdAt')
    .sort({ createdAt: 1 })
    .lean();
  const profiles = await Profile.find({
    userId: { $in: users.map((u) => u._id) },
  })
    .select('userId name city gender')
    .lean();
  const byUser = new Map(profiles.map((p) => [String(p.userId), p]));

  const DEMO_PASS = 'DemoPass123!';
  const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@hingeapp.local').toLowerCase();
  const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'Phase1Shell!';

  const rows = users.map((u) => {
    const profile = byUser.get(String(u._id));
    const email = u.email;
    let password = null;
    let note = 'password unknown (hashed)';
    if (/@handles\.local$/i.test(email) && email.startsWith('demo.')) {
      password = DEMO_PASS;
      note = 'demo seed';
    } else if (email === 'handles.bot@handles.app') {
      password = null;
      note = 'system bot — do not login';
    } else if (email === ADMIN_EMAIL || (u.role === 'admin' && email.includes('admin'))) {
      password = email === ADMIN_EMAIL ? ADMIN_PASS : null;
      note = email === ADMIN_EMAIL ? 'platform admin' : 'admin (password unknown)';
    }
    return {
      email,
      password,
      role: u.role,
      name: profile?.name || '',
      city: profile?.city || '',
      gender: profile?.gender || '',
      emailVerified: Boolean(u.emailVerified),
      onboardingComplete: Boolean(u.onboardingComplete),
      note,
    };
  });

  console.log(JSON.stringify(rows, null, 2));
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
