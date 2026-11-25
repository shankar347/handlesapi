/** Shared Socket.IO handle for services that notify logged-in users in realtime. */
let io = null;

const setIo = (instance) => {
  io = instance;
};

const getIo = () => io;

const emitToUser = (userId, event, payload) => {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
};

module.exports = { setIo, getIo, emitToUser };
