const express = require('express');
const { requireAuth, requireEmailVerified } = require('../middleware/auth');
const { verifyFace, skipFace } = require('../controllers/faceController');

const router = express.Router();

router.use(requireAuth, requireEmailVerified);
router.post('/verify', verifyFace);
router.post('/skip', skipFace);

module.exports = router;
