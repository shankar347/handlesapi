const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  registerDevice,
  unregisterDevice,
  sendTestPush,
  listNotifications,
  markRead,
  updatePreferences,
} = require('../controllers/notificationController');

const router = express.Router();

router.use(requireAuth);
router.get('/', listNotifications);
router.patch('/preferences', updatePreferences);
router.post('/device', registerDevice);
router.delete('/device', unregisterDevice);
router.post('/test', sendTestPush);
router.post('/:id/read', markRead);

module.exports = router;
