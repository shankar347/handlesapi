require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const total = await User.countDocuments({});
  const members = await User.countDocuments({
    role: 'user',
    email: { $ne: 'handles.bot@handles.app' },
  });
  const admins = await User.countDocuments({ role: 'admin' });
  const verified = await User.countDocuments({
    emailVerified: true,
    role: 'user',
    email: { $ne: 'handles.bot@handles.app' },
  });
  const demo = await User.countDocuments({ email: /@handles\.local$/ });
  console.log(
    JSON.stringify(
      {
        total,
        members,
        admins,
        emailVerifiedMembers: verified,
        demoSeedAccounts: demo,
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
