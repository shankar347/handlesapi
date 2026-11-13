const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  listConversations,
  getMessages,
  sendMessage,
  startConversation,
} = require('../controllers/chatController');

const router = express.Router();

router.use(requireAuth);
router.get('/conversations', listConversations);
router.post('/conversations', startConversation);
router.get('/conversations/:id/messages', getMessages);
router.post('/conversations/:id/messages', sendMessage);

module.exports = router;
