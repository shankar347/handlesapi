const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { notifyWelcome, notifyProfileTip } = require('./pushService');

const BOT_EMAIL = 'handles.bot@handles.app';

const ensureBotUser = async () => {
  let bot = await User.findOne({ email: BOT_EMAIL });
  if (bot) return bot;

  const passwordHash = await bcrypt.hash(`bot_${Date.now()}`, 10);
  bot = await User.create({
    email: BOT_EMAIL,
    passwordHash,
    onboardingComplete: true,
    role: 'admin',
  });
  await Profile.create({
    userId: bot._id,
    name: 'Handles',
    bio: 'Your in-app guide for tips, welcome notes, and product updates.',
    city: 'India',
  });
  return bot;
};

const openBotConversation = async (userId) => {
  const bot = await ensureBotUser();
  let conversation = await Conversation.findOne({
    isBot: true,
    participants: { $all: [userId, bot._id] },
  });
  if (!conversation) {
    conversation = await Conversation.create({
      participants: [userId, bot._id],
      isBot: true,
      lastMessageText: 'Welcome to Handles 👋',
      lastMessageAt: new Date(),
    });
  }
  return { bot, conversation };
};

const sendBotMessage = async (userId, text, io = null) => {
  const { bot, conversation } = await openBotConversation(userId);
  const message = await Message.create({
    conversationId: conversation._id,
    senderId: bot._id,
    text,
    type: 'bot',
    readBy: [bot._id],
  });
  conversation.lastMessageAt = new Date();
  conversation.lastMessageText = text;
  await conversation.save();

  if (io) {
    io.to(`user:${userId}`).emit('chat:message', {
      conversationId: String(conversation._id),
      message: {
        id: String(message._id),
        text: message.text,
        type: message.type,
        senderId: String(bot._id),
        createdAt: message.createdAt,
        fromBot: true,
      },
    });
  }

  return { conversation, message, bot };
};

const onboardNewUser = async (userId, io = null) => {
  await sendBotMessage(
    userId,
    'Welcome to Handles! I’m your in-app guide. Swipe photos with your finger, like what sparks a conversation, and I’ll tip you along the way.',
    io,
  );
  await notifyWelcome(userId);

  setTimeout(async () => {
    try {
      await sendBotMessage(
        userId,
        'Quick tip: profiles with a clear city, a few photos, and one honest prompt get more thoughtful likes.',
        io,
      );
      await notifyProfileTip(userId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Bot tip failed', error.message);
    }
  }, 8000);
};

module.exports = {
  BOT_EMAIL,
  ensureBotUser,
  openBotConversation,
  sendBotMessage,
  onboardNewUser,
};
