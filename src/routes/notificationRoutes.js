const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  registerDevice,
  unregisterDevice,
  sendTestPush,
} = require('../controllers/notificationController');

const router = express.Router();

router.use(requireAuth);
router.post('/device', registerDevice);
router.delete('/device', unregisterDevice);
router.post('/test', sendTestPush);

module.exports = router;
