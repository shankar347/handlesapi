const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  summary,
  listUsers,
  userDetail,
  listSubscriptions,
  listMatches,
  patchSettings,
  broadcastPush,
} = require('../controllers/adminController');

const router = express.Router();

router.use(requireAuth, requireAdmin);
router.get('/summary', summary);
router.get('/users', listUsers);
router.get('/users/:id', userDetail);
router.get('/subscriptions', listSubscriptions);
router.get('/matches', listMatches);
router.patch('/settings', patchSettings);
router.post('/push/broadcast', broadcastPush);

module.exports = router;
