const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./middleware/auth');
const User = require('./models/User');

const attachSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        null;
      if (!token) {
        return next(new Error('Authentication required'));
      }
      const payload = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(payload.sub);
      if (!user || user.status === 'banned') {
        return next(new Error('Invalid session'));
      }
      socket.user = user;
      return next();
    } catch (error) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = String(socket.user._id);
    socket.join(`user:${userId}`);
    socket.emit('socket:ready', { userId });

    socket.on('chat:typing', ({ conversationId, typing }) => {
      if (!conversationId) return;
      socket.to(`user:${userId}`).emit('chat:typing', {
        conversationId,
        userId,
        typing: Boolean(typing),
      });
      // Broadcast to other sockets in rooms — clients join conversation rooms optionally
      socket.to(`conversation:${conversationId}`).emit('chat:typing', {
        conversationId,
        userId,
        typing: Boolean(typing),
      });
    });

    socket.on('chat:join', ({ conversationId }) => {
      if (conversationId) {
        socket.join(`conversation:${conversationId}`);
      }
    });

    socket.on('disconnect', () => {
      // no-op
    });
  });

  return io;
};

module.exports = { attachSocket };
