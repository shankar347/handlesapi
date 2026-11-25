const express = require('express');
const { requireAuth, requireEmailVerified } = require('../middleware/auth');
const { listDiscover, getDiscoverProfile } = require('../controllers/discoverController');

const router = express.Router();

router.use(requireAuth, requireEmailVerified);
router.get('/', listDiscover);
router.get('/:userId', getDiscoverProfile);

module.exports = router;
