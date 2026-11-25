const express = require('express');
const { requireAuth, requireEmailVerified } = require('../middleware/auth');
const { status, likeProfile } = require('../controllers/likeController');

const router = express.Router();

router.use(requireAuth, requireEmailVerified);
router.get('/status', status);
router.post('/', likeProfile);

module.exports = router;
