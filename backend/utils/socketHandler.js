const jwt = require('jsonwebtoken');
const Participant = require('../models/Participant');
const Organizer = require('../models/Organizer');
const {
  handleSendMessage,
  handleDeleteMessage,
  handlePinMessage,
  handleReactMessage,
} = require('../controllers/forumController');


async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.id) return next(new Error('Invalid token'));

    const participant = await Participant.findById(decoded.id).select('first_name last_name email');
    if (participant) {
      socket.data.senderId = participant._id;
      socket.data.senderRole = 'participant';
      socket.data.senderName = `${participant.first_name} ${participant.last_name}`;
      return next();
    }

    const organizer = await Organizer.findById(decoded.id).select('first_name last_name email');
    if (organizer) {
      socket.data.senderId = organizer._id;
      socket.data.senderRole = 'organizer';
      socket.data.senderName = `${organizer.first_name} ${organizer.last_name}`;
      return next();
    }

    return next(new Error('User not found'));
  } catch (err) {
    return next(new Error('Authentication failed'));
  }
}

function registerSocketHandlers(io) {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const { senderId, senderRole, senderName } = socket.data;

    socket.join(`user:${senderId}`);

    socket.on('join-event-room', (eventId) => {
      if (eventId) socket.join(`event:${eventId}`);
    });

    socket.on('leave-event-room', (eventId) => {
      if (eventId) socket.leave(`event:${eventId}`);
    });

    socket.on('send-message', (payload) => {
      handleSendMessage(io, socket, payload, { senderId, senderRole, senderName });
    });

    socket.on('delete-message', (payload) => {
      handleDeleteMessage(io, socket, payload, { senderId, senderRole, senderName });
    });

    socket.on('pin-message', (payload) => {
      handlePinMessage(io, socket, payload, { senderId, senderRole, senderName });
    });

    socket.on('react-message', (payload) => {
      handleReactMessage(io, socket, payload, { senderId, senderRole, senderName });
    });

    socket.on('disconnect', () => {});
  });
}

module.exports = { registerSocketHandlers };
