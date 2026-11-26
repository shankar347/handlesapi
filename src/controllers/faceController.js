const fs = require('fs');
const path = require('path');
const Profile = require('../models/Profile');
const FaceAttempt = require('../models/FaceAttempt');
const { analyzeFace } = require('../services/faceDetect');
const { notifyOnce } = require('../services/notificationService');
const { getSettings } = require('../services/platformService');
const { success, failure } = require('../utils/apiResponse');

const MAX_BYTES = 1_500_000;
const FACES_DIR = path.resolve(__dirname, '../../uploads/faces');

const ensureFacesDir = () => {
  if (!fs.existsSync(FACES_DIR)) {
    fs.mkdirSync(FACES_DIR, { recursive: true });
  }
};

const saveFacePhoto = (userId, buffer) => {
  ensureFacesDir();
  const fileName = `${userId}-${Date.now()}.jpg`;
  const filePath = path.join(FACES_DIR, fileName);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/faces/${fileName}`;
};

const verifyFace = async (req, res, next) => {
  try {
    if (req.body?.consent !== true) {
      return failure(res, {
        message: 'Face verification needs your consent before any photo is checked',
        statusCode: 400,
        data: { code: 'CONSENT_REQUIRED' },
      });
    }

    // Scan-only flow: no photo/video capture — mark verified after client scan UX.
    if (req.body?.scanOnly === true) {
      const now = new Date();
      await FaceAttempt.create({
        userId: req.user._id,
        success: true,
        reason: 'scan_only',
      });
      await Profile.findOneAndUpdate(
        { userId: req.user._id },
        {
          $set: {
            faceVerified: true,
            faceVerifiedAt: now,
            faceConsentAt: now,
            faceSkipped: false,
          },
        },
        { upsert: true },
      );
      const { freeLikeLimit } = await getSettings();
      await notifyOnce(req.user._id, {
        dedupeKey: `face-success:${req.user._id}`,
        type: 'face_verified',
        title: 'Your face verification is successful',
        body: 'Your face verification is successful.',
        data: { route: 'Profile' },
      });
      await notifyOnce(req.user._id, {
        dedupeKey: `free-likes-granted:${req.user._id}`,
        type: 'free_likes',
        title: `You have ${freeLikeLimit} free likes available`,
        body: `You have ${freeLikeLimit} free likes available.`,
        data: { route: 'Discover' },
      });
      return success(res, {
        message: 'Face verified',
        data: { faceVerified: true, faceVerifiedAt: now, scanOnly: true },
      });
    }

    const imageBase64 = String(req.body?.imageBase64 || '');
    if (!imageBase64) {
      return failure(res, { message: 'A selfie is required', statusCode: 400 });
    }
    const raw = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    let buffer;
    try {
      buffer = Buffer.from(raw, 'base64');
    } catch (error) {
      return failure(res, { message: 'Selfie could not be read', statusCode: 400 });
    }
    if (!buffer.length || buffer.length > MAX_BYTES) {
      return failure(res, { message: 'Selfie must be a photo under 1.5 MB', statusCode: 400 });
    }

    const result = analyzeFace(buffer);

    await FaceAttempt.create({
      userId: req.user._id,
      success: result.ok,
      reason: result.reason,
    });

    if (!result.ok) {
      buffer.fill(0);
      return failure(res, {
        message: 'We could not confirm a face in that photo. Try a clearer selfie.',
        statusCode: 422,
        data: { code: 'FACE_REJECTED', reason: result.reason },
      });
    }

    const facePhotoUrl = saveFacePhoto(req.user._id, buffer);
    buffer.fill(0);

    const now = new Date();
    await Profile.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          faceVerified: true,
          faceVerifiedAt: now,
          faceConsentAt: now,
          facePhotoUrl,
          faceSkipped: false,
        },
      },
      { upsert: true },
    );

    const { freeLikeLimit } = await getSettings();
    await notifyOnce(req.user._id, {
      dedupeKey: `face-success:${req.user._id}`,
      type: 'face_verified',
      title: 'Your face verification is successful',
      body: 'Your face verification is successful.',
      data: { route: 'Profile' },
    });
    await notifyOnce(req.user._id, {
      dedupeKey: `free-likes-granted:${req.user._id}`,
      type: 'free_likes',
      title: `You have ${freeLikeLimit} free likes available`,
      body: `You have ${freeLikeLimit} free likes available.`,
      data: { route: 'Discover' },
    });

    return success(res, {
      message: 'Face verified',
      data: { faceVerified: true, faceVerifiedAt: now, facePhotoUrl },
    });
  } catch (error) {
    return next(error);
  }
};

const skipFace = async (req, res, next) => {
  try {
    const now = new Date();
    const profile = await Profile.findOne({ userId: req.user._id });
    if (profile?.faceVerified) {
      return success(res, {
        message: 'Already face verified',
        data: { faceVerified: true, faceSkipped: false },
      });
    }
    await Profile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { faceSkipped: true, faceSkippedAt: now, faceVerified: false } },
      { upsert: true },
    );
    await notifyOnce(req.user._id, {
      dedupeKey: `face-later:${req.user._id}`,
      type: 'face_reminder',
      title: 'Complete your face verification',
      body: 'Complete your face verification.',
      data: { route: 'FaceVerify' },
    });
    return success(res, {
      message: 'Face verification skipped',
      data: { faceVerified: false, faceSkipped: true },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { verifyFace, skipFace };
