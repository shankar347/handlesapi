/** Normalize gender / interestedIn labels from onboarding. */
const normalizeToken = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');

const genderBucket = (gender = '') => {
  const g = normalizeToken(gender);
  if (!g) return 'unknown';
  if (g.includes('women') || g === 'woman' || g === 'female' || g === 'she') return 'woman';
  if (g.includes('men') || g === 'man' || g === 'male' || g === 'he') return 'man';
  if (g.includes('non') || g.includes('nb') || g.includes('other') || g.includes('self')) {
    return 'nonbinary';
  }
  return g;
};

const interestBuckets = (interestedIn = []) => {
  const list = Array.isArray(interestedIn) ? interestedIn : [interestedIn];
  const buckets = new Set();
  list.forEach((item) => {
    const t = normalizeToken(item);
    if (!t) return;
    if (t.includes('every') || t.includes('all') || t === 'anyone') {
      buckets.add('everyone');
      return;
    }
    if (t.includes('women') || t === 'woman' || t === 'female') buckets.add('woman');
    else if (t.includes('men') || t === 'man' || t === 'male') buckets.add('man');
    else if (t.includes('non') || t.includes('nb')) buckets.add('nonbinary');
    else buckets.add(genderBucket(t));
  });
  return buckets;
};

/** Does this person's preference include the other person's gender? */
const prefersGender = (interestedIn, otherGender) => {
  const wants = interestBuckets(interestedIn);
  if (!wants.size || wants.has('everyone')) return true;
  const bucket = genderBucket(otherGender);
  if (bucket === 'unknown') return true;
  return wants.has(bucket);
};

/** Mutual preference: each is open to the other's gender. */
const mutualPreference = (viewer, candidate) =>
  prefersGender(viewer?.interestedIn, candidate?.gender) &&
  prefersGender(candidate?.interestedIn, viewer?.gender);

const locationScore = (viewer, candidate) => {
  const vCity = normalizeToken(viewer?.city);
  const cCity = normalizeToken(candidate?.city);
  const vState = normalizeToken(viewer?.state);
  const cState = normalizeToken(candidate?.state);
  if (vCity && cCity && vCity === cCity) return 100;
  if (vState && cState && vState === cState) return 60;
  if (vCity && cCity) return 20;
  return 10;
};

const ageFrom = (birthday) => {
  if (!birthday) return null;
  const ms = Date.now() - new Date(birthday).getTime();
  return Math.max(18, Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000)));
};

const toDiscoverCard = (userId, profile, score = 0) => {
  const age = ageFrom(profile.birthday);
  return {
    id: String(userId),
    userId: String(userId),
    name: profile.name || 'Member',
    age: age || '',
    gender: profile.gender || '',
    interestedIn: profile.interestedIn || [],
    city: profile.city || '',
    state: profile.state || '',
    occupation: profile.occupation || '',
    pronouns: '',
    active: 'Active recently',
    faceVerified: Boolean(profile.faceVerified),
    matchScore: score,
    photos: profile.photos || [],
    prompts: [
      profile.prompt ? { prompt: 'Prompt', answer: profile.prompt } : null,
      profile.bio ? { prompt: 'About me', answer: profile.bio } : null,
    ].filter(Boolean),
    basics: [
      age ? { icon: 'age', label: String(age) } : null,
      profile.height ? { icon: 'height', label: profile.height } : null,
      profile.occupation ? { icon: 'job', label: profile.occupation } : null,
      profile.education ? { icon: 'education', label: profile.education } : null,
      profile.intention ? { icon: 'intention', label: profile.intention } : null,
      profile.city ? { icon: 'city', label: profile.city } : null,
      profile.religion ? { icon: 'religion', label: profile.religion } : null,
    ].filter(Boolean),
  };
};

module.exports = {
  mutualPreference,
  locationScore,
  ageFrom,
  toDiscoverCard,
  genderBucket,
  prefersGender,
};
