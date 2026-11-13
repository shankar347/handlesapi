const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Profile = require('../models/Profile');
const User = require('../models/User');
const { success, failure } = require('../utils/apiResponse');
const { notifyNewMessage } = require('../services/pushService');
const { ensureBotUser, openBotConversation } = require('../services/botService');

const getIo = (req) => req.app.get('io');

const serializeConversation = async (conversation, currentUserId) => {
  const otherId = conversation.participants
    .map((id) => String(id))
    .find((id) => id !== String(currentUserId));
  const [profile, unread] = await Promise.all([
    Profile.findOne({ userId: otherId }).lean(),
    Message.countDocuments({
      conversationId: conversation._id,
      senderId: { $ne: currentUserId },
      readBy: { $ne: currentUserId },
    }),
  ]);
  return {
    id: String(conversation._id),
    isBot: Boolean(conversation.isBot),
    otherUserId: otherId,
    name: profile?.name || (conversation.isBot ? 'Handles' : 'Match'),
    avatar: profile?.photos?.[0] || null,
    preview: conversation.lastMessageText || '',
    lastMessageAt: conversation.lastMessageAt,
    unread,
  };
};

const listConversations = async (req, res, next) => {
  try {
    await ensureBotUser();
    await openBotConversation(req.user._id);

    const conversations = await Conversation.find({
      participants: req.user._id,
    })
      .sort({ lastMessageAt: -1 })
      .lean();

    const data = await Promise.all(
      conversations.map((c) => serializeConversation(c, req.user._id)),
    );
    return success(res, { message: 'Conversations loaded', data: { conversations: data } });
  } catch (error) {
    return next(error);
  }
};

const getMessages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const conversation = await Conversation.findById(id);
    if (
      !conversation ||
      !conversation.participants.some((p) => String(p) === String(req.user._id))
    ) {
      return failure(res, { message: 'Conversation not found', statusCode: 404 });
    }

    const messages = await Message.find({ conversationId: id })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    await Message.updateMany(
      {
        conversationId: id,
        senderId: { $ne: req.user._id },
        readBy: { $ne: req.user._id },
      },
      { $addToSet: { readBy: req.user._id } },
    );

    return success(res, {
      message: 'Messages loaded',
      data: {
        conversationId: id,
        messages: messages.map((m) => ({
          id: String(m._id),
          text: m.text,
          type: m.type,
          senderId: String(m.senderId),
          mine: String(m.senderId) === String(req.user._id),
          createdAt: m.createdAt,
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
};

const sendMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const text = String(req.body?.text || '').trim();
    if (!text) {
      return failure(res, { message: 'Message text required', statusCode: 400 });
    }

    const conversation = await Conversation.findById(id);
    if (
      !conversation ||
      !conversation.participants.some((p) => String(p) === String(req.user._id))
    ) {
      return failure(res, { message: 'Conversation not found', statusCode: 404 });
    }

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: req.user._id,
      text,
      type: 'text',
      readBy: [req.user._id],
    });

    conversation.lastMessageAt = new Date();
    conversation.lastMessageText = text;
    await conversation.save();

    const payload = {
      conversationId: String(conversation._id),
      message: {
        id: String(message._id),
        text: message.text,
        type: message.type,
        senderId: String(req.user._id),
        createdAt: message.createdAt,
        mine: false,
      },
    };

    const io = getIo(req);
    const recipients = conversation.participants.filter(
      (p) => String(p) !== String(req.user._id),
    );

    const senderProfile = await Profile.findOne({ userId: req.user._id }).lean();
    const senderName = senderProfile?.name || 'Someone';

    for (const recipientId of recipients) {
      if (io) {
        io.to(`user:${recipientId}`).emit('chat:message', {
          ...payload,
          message: { ...payload.message, mine: false },
        });
      }
      await notifyNewMessage(recipientId, {
        senderName,
        text,
        conversationId: conversation._id,
      });
    }

    if (io) {
      io.to(`user:${req.user._id}`).emit('chat:message', {
        ...payload,
        message: { ...payload.message, mine: true },
      });
    }

    // Simple bot auto-reply for bot threads
    if (conversation.isBot) {
      setTimeout(async () => {
        try {
          const bot = await ensureBotUser();
          const replyText =
            'Got it — keep exploring Discover, and message people whose prompts actually interest you. That’s how Handles works best.';
          const reply = await Message.create({
            conversationId: conversation._id,
            senderId: bot._id,
            text: replyText,
            type: 'bot',
            readBy: [bot._id],
          });
          conversation.lastMessageAt = new Date();
          conversation.lastMessageText = replyText;
          await conversation.save();
          if (io) {
            io.to(`user:${req.user._id}`).emit('chat:message', {
              conversationId: String(conversation._id),
              message: {
                id: String(reply._id),
                text: reply.text,
                type: 'bot',
                senderId: String(bot._id),
                createdAt: reply.createdAt,
                mine: false,
                fromBot: true,
              },
            });
          }
          await notifyNewMessage(req.user._id, {
            senderName: 'Handles',
            text: replyText,
            conversationId: conversation._id,
          });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('Bot reply failed', error.message);
        }
      }, 1200);
    }

    return success(res, {
      message: 'Message sent',
      statusCode: 201,
      data: {
        message: {
          id: String(message._id),
          text: message.text,
          type: message.type,
          senderId: String(req.user._id),
          mine: true,
          createdAt: message.createdAt,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

const startConversation = async (req, res, next) => {
  try {
    const otherUserId = req.body?.userId;
    if (!otherUserId) {
      return failure(res, { message: 'userId required', statusCode: 400 });
    }
    if (String(otherUserId) === String(req.user._id)) {
      return failure(res, { message: 'Cannot chat with yourself', statusCode: 400 });
    }
    const other = await User.findById(otherUserId);
    if (!other) {
      return failure(res, { message: 'User not found', statusCode: 404 });
    }

    let conversation = await Conversation.findOne({
      isBot: false,
      participants: { $all: [req.user._id, otherUserId], $size: 2 },
    });
    if (!conversation) {
      conversation = await Conversation.create({
        participants: [req.user._id, otherUserId],
        isBot: false,
      });
    }

    const data = await serializeConversation(conversation, req.user._id);
    return success(res, {
      message: 'Conversation ready',
      statusCode: 201,
      data: { conversation: data },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listConversations,
  getMessages,
  sendMessage,
  startConversation,
};
