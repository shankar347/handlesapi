/**
 * Seeds 8 demo members (Chennai / TN / nearby) for discover matching.
 * Usage: node scripts/seedDemoProfiles.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');
const Profile = require('../src/models/Profile');
const { grantTrial } = require('../src/services/subscriptionService');

const PASSWORD = 'DemoPass123!';

const DEMO = [
  {
    email: 'demo.priya@handles.local',
    name: 'Priya',
    gender: 'Woman',
    interestedIn: ['Men'],
    city: 'Chennai',
    state: 'Tamil Nadu',
    birthday: '1998-04-12',
    height: `5'4"`,
    education: 'Masters',
    occupation: 'Product designer',
    intention: 'Long-term',
    religion: 'Hindu',
    languages: ['Tamil', 'English'],
    interests: ['Cafes', 'Travel', 'Film'],
    prompt: 'A life goal of mine',
    bio: 'Chennai-based designer who loves marina walks and filter coffee.',
    photos: [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&q=80',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&q=80',
    ],
  },
  {
    email: 'demo.ananya@handles.local',
    name: 'Ananya',
    gender: 'Woman',
    interestedIn: ['Men'],
    city: 'Chennai',
    state: 'Tamil Nadu',
    birthday: '1996-09-03',
    height: `5'5"`,
    education: 'Bachelors',
    occupation: 'Software engineer',
    intention: 'Dating',
    religion: 'Hindu',
    languages: ['Tamil', 'English', 'Hindi'],
    interests: ['Books', 'Running', 'Cooking'],
    prompt: 'I go crazy for',
    bio: 'Engineer by day, weekend baker. Looking for thoughtful conversations.',
    photos: [
      'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800&q=80',
      'https://images.unsplash.com/photo-1524504388940-b1c17226555e?w=800&q=80',
    ],
  },
  {
    email: 'demo.meera@handles.local',
    name: 'Meera',
    gender: 'Woman',
    interestedIn: ['Men', 'Everyone'],
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    birthday: '1999-01-21',
    height: `5'3"`,
    education: 'Masters',
    occupation: 'Teacher',
    intention: 'Long-term',
    religion: 'Christian',
    languages: ['Tamil', 'English'],
    interests: ['Music', 'Hiking'],
    prompt: 'Together we could',
    bio: 'From Coimbatore. Love hills, carnatic music, and honest first dates.',
    photos: [
      'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=800&q=80',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&q=80',
    ],
  },
  {
    email: 'demo.divya@handles.local',
    name: 'Divya',
    gender: 'Woman',
    interestedIn: ['Men'],
    city: 'Madurai',
    state: 'Tamil Nadu',
    birthday: '1997-07-18',
    height: `5'6"`,
    education: 'Bachelors',
    occupation: 'Doctor',
    intention: 'Long-term',
    religion: 'Hindu',
    languages: ['Tamil', 'English'],
    interests: ['Temple visits', 'Food'],
    prompt: 'Typical Sunday',
    bio: 'Madurai roots, Chennai weekends. Looking for kindness over flash.',
    photos: [
      'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=800&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&q=80',
    ],
  },
  {
    email: 'demo.arjun@handles.local',
    name: 'Arjun',
    gender: 'Man',
    interestedIn: ['Women'],
    city: 'Chennai',
    state: 'Tamil Nadu',
    birthday: '1995-11-02',
    height: `5'10"`,
    education: 'Masters',
    occupation: 'Architect',
    intention: 'Dating',
    religion: 'Hindu',
    languages: ['Tamil', 'English'],
    interests: ['Design', 'Cycling'],
    prompt: 'Green flags I look for',
    bio: 'Architect who sketches on the beach. Let’s talk cities and coffee.',
    photos: [
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&q=80',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&q=80',
    ],
  },
  {
    email: 'demo.karthik@handles.local',
    name: 'Karthik',
    gender: 'Man',
    interestedIn: ['Women'],
    city: 'Chennai',
    state: 'Tamil Nadu',
    birthday: '1994-03-14',
    height: `5'11"`,
    education: 'Bachelors',
    occupation: 'Founder',
    intention: 'Long-term',
    religion: 'Hindu',
    languages: ['Tamil', 'English', 'Hindi'],
    interests: ['Startups', 'Cricket'],
    prompt: 'I geek out on',
    bio: 'Building things and eating well. Prefer slow dates over small talk.',
    photos: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80',
      'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=800&q=80',
    ],
  },
  {
    email: 'demo.sara@handles.local',
    name: 'Sara',
    gender: 'Woman',
    interestedIn: ['Men'],
    city: 'Delhi',
    state: 'Delhi',
    birthday: '1997-05-11',
    height: `5'5"`,
    education: 'Masters',
    occupation: 'Journalist',
    intention: 'Dating',
    religion: 'Muslim',
    languages: ['Hindi', 'English'],
    interests: ['Politics', 'Poetry'],
    prompt: 'I geek out on',
    bio: 'Delhi evenings, long walks in Lodhi Garden, and honest conversations.',
    photos: [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&q=80',
      'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800&q=80',
    ],
  },
  {
    email: 'demo.aisha@handles.local',
    name: 'Aisha',
    gender: 'Woman',
    interestedIn: ['Men'],
    city: 'Delhi',
    state: 'Delhi',
    birthday: '1999-08-22',
    height: `5'3"`,
    education: 'Bachelors',
    occupation: 'Lawyer',
    intention: 'Long-term',
    religion: 'Hindu',
    languages: ['Hindi', 'English'],
    interests: ['Courts', 'Travel'],
    prompt: 'Green flags I look for',
    bio: 'Based in Delhi. Looking for kindness, ambition, and good humour.',
    photos: [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&q=80',
      'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=800&q=80',
    ],
  },
  {
    email: 'demo.nisha@handles.local',
    name: 'Nisha',
    gender: 'Woman',
    interestedIn: ['Men'],
    city: 'Bengaluru',
    state: 'Karnataka',
    birthday: '1998-12-09',
    height: `5'4"`,
    education: 'Masters',
    occupation: 'UX researcher',
    intention: 'Dating',
    religion: 'Hindu',
    languages: ['Kannada', 'English', 'Tamil'],
    interests: ['Podcasts', 'Art'],
    prompt: 'Best travel story',
    bio: 'Bengaluru nights, Chennai family. Looking for curiosity and humour.',
    photos: [
      'https://images.unsplash.com/photo-1524504388940-b1c17226555e?w=800&q=80',
      'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800&q=80',
    ],
  },
  {
    email: 'demo.rahul@handles.local',
    name: 'Rahul',
    gender: 'Man',
    interestedIn: ['Women'],
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    birthday: '1996-06-25',
    height: `5'9"`,
    education: 'Bachelors',
    occupation: 'Civil engineer',
    intention: 'Long-term',
    religion: 'Hindu',
    languages: ['Tamil', 'English'],
    interests: ['Travel', 'Photography'],
    prompt: 'I want someone who',
    bio: 'Coimbatore based. Road trips and old temples are my love language.',
    photos: [
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=800&q=80',
      'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=800&q=80',
    ],
  },
  {
    email: 'demo.kavya@handles.local',
    name: 'Kavya',
    gender: 'Woman',
    interestedIn: ['Men'],
    city: 'Bengaluru',
    state: 'Karnataka',
    birthday: '1997-02-14',
    height: `5'5"`,
    education: 'Masters',
    occupation: 'Data analyst',
    intention: 'Long-term',
    religion: 'Hindu',
    languages: ['Kannada', 'English'],
    interests: ['Hiking', 'Board games'],
    prompt: 'A perfect first date',
    bio: 'Bengaluru weekends mean cafes in Indiranagar and a long walk.',
    photos: [
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&q=80',
      'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=800&q=80',
    ],
  },
  {
    email: 'demo.sneha@handles.local',
    name: 'Sneha',
    gender: 'Woman',
    interestedIn: ['Men'],
    city: 'Bengaluru',
    state: 'Karnataka',
    birthday: '1995-10-08',
    height: `5'6"`,
    education: 'Bachelors',
    occupation: 'Marketing lead',
    intention: 'Dating',
    religion: 'Hindu',
    languages: ['Kannada', 'English', 'Hindi'],
    interests: ['Startups', 'Food'],
    prompt: 'I geek out on',
    bio: 'Marketing by weekdays, brunch explorer by weekends.',
    photos: [
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&q=80',
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&q=80',
    ],
  },
  {
    email: 'demo.isha@handles.local',
    name: 'Isha',
    gender: 'Woman',
    interestedIn: ['Men', 'Everyone'],
    city: 'Bengaluru',
    state: 'Karnataka',
    birthday: '1999-04-30',
    height: `5'3"`,
    education: 'Masters',
    occupation: 'Psychologist',
    intention: 'Long-term',
    religion: 'Agnostic',
    languages: ['English', 'Hindi'],
    interests: ['Therapy memes', 'Pottery'],
    prompt: 'Together we could',
    bio: 'Curious about people. Soft humour preferred over flashy first dates.',
    photos: [
      'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800&q=80',
      'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=800&q=80',
    ],
  },
  {
    email: 'demo.riya@handles.local',
    name: 'Riya',
    gender: 'Woman',
    interestedIn: ['Men'],
    city: 'Bengaluru',
    state: 'Karnataka',
    birthday: '1996-07-19',
    height: `5'4"`,
    education: 'Bachelors',
    occupation: 'Product manager',
    intention: 'Dating',
    religion: 'Hindu',
    languages: ['Kannada', 'English'],
    interests: ['Product', 'Travel'],
    prompt: 'Green flags I look for',
    bio: 'PM who still sketches wireframes on paper. Looking for thoughtful chats.',
    photos: [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&q=80',
      'https://images.unsplash.com/photo-1524504388940-b1c17226555e?w=800&q=80',
    ],
  },
];

const run = async () => {
  if (!env.mongodbUri) {
    throw new Error('MONGO_URI / MONGODB_URI missing');
  }
  await mongoose.connect(env.mongodbUri);
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const created = [];

  for (const row of DEMO) {
    let user = await User.findOne({ email: row.email });
    if (!user) {
      user = await User.create({
        email: row.email,
        passwordHash,
        role: 'user',
        status: 'active',
        emailVerified: true,
        onboardingComplete: true,
        homeReachedAt: new Date(),
      });
      await grantTrial(user._id).catch(() => {});
    } else {
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            emailVerified: true,
            onboardingComplete: true,
            status: 'active',
            homeReachedAt: user.homeReachedAt || new Date(),
          },
        },
      );
    }

    await Profile.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          name: row.name,
          gender: row.gender,
          interestedIn: row.interestedIn,
          city: row.city,
          state: row.state,
          birthday: new Date(row.birthday),
          height: row.height,
          education: row.education,
          occupation: row.occupation,
          intention: row.intention,
          religion: row.religion,
          languages: row.languages,
          interests: row.interests,
          prompt: row.prompt,
          bio: row.bio,
          photos: row.photos,
          faceVerified: true,
          faceVerifiedAt: new Date(),
          faceConsentAt: new Date(),
          faceSkipped: false,
        },
      },
      { upsert: true },
    );
    created.push(row.email);
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${created.length} demo profiles.`);
  // eslint-disable-next-line no-console
  console.log(`Password for all: ${PASSWORD}`);
  // eslint-disable-next-line no-console
  console.log(created.join('\n'));
  await mongoose.disconnect();
};

run().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
