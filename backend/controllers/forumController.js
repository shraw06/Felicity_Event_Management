const mongoose = require('mongoose');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const EventRegistration = require('../models/EventRegistration');
const Event = require('../models/Event');


async function assertParticipantRegistered(eventId, participantId) {
  const reg = await EventRegistration.findOne({
    eventId,
    participantId,
    status: { $in: ['UPCOMING', 'COMPLETED'] },
  });
  return !!reg;
}

async function getRegisteredParticipantIds(eventId) {
  const regs = await EventRegistration.find({
    eventId,
    status: { $in: ['UPCOMING', 'COMPLETED'] },
  }).select('participantId').lean();
  return regs.map((r) => r.participantId);
}

function sanitize(msg) {
  if (msg.deletedAt) {
    return { ...msg, content: '[This message was deleted]', reactions: [] };
  }
  return msg;
}



const getMessages = async (req, res) => {
  try {
    const { eventId } = req.params;

    const participantId = req.participant?._id;
    const organizerId = req.organizer?._id;

    if (!participantId && !organizerId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    if (organizerId) {
      const event = await Event.findById(eventId).lean();
      if (!event || String(event.organizer_id) !== String(organizerId)) {
        return res.status(403).json({ success: false, error: 'Not your event' });
      }
    }

    if (participantId) {
      const ok = await assertParticipantRegistered(eventId, participantId);
      if (!ok) {
        return res.status(403).json({ success: false, error: 'You are not registered for this event' });
      }
    }

    const messages = await Message.find({ eventId })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ success: true, data: messages.map(sanitize) });
  } catch (err) {
    console.error('getMessages error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};


const getNotifications = async (req, res) => {
  try {
    const participantId = req.participant?._id;
    if (!participantId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const notifications = await Notification.find({ userId: participantId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = notifications.filter((n) => !n.read).length;

    return res.json({ success: true, data: notifications, unreadCount });
  } catch (err) {
    console.error('getNotifications error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};


const markNotificationRead = async (req, res) => {
  try {
    const participantId = req.participant?._id;
    if (!participantId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    await Notification.updateOne(
      { _id: req.params.id, userId: participantId },
      { $set: { read: true } }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('markNotificationRead error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};


const markAllNotificationsRead = async (req, res) => {
  try {
    const participantId = req.participant?._id;
    if (!participantId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    await Notification.updateMany({ userId: participantId, read: false }, { $set: { read: true } });
    return res.json({ success: true });
  } catch (err) {
    console.error('markAllNotificationsRead error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};


async function handleSendMessage(io, socket, payload, senderInfo) {
  try {
    const { eventId, content, parentMessageId, isAnnouncement } = payload;
    const { senderId, senderRole, senderName } = senderInfo;

    if (!content || !content.trim()) return;

    if (senderRole === 'participant') {
      const ok = await assertParticipantRegistered(eventId, senderId);
      if (!ok) {
        socket.emit('forum-error', { message: 'Not registered for this event' });
        return;
      }
    } else if (senderRole === 'organizer') {
      const event = await Event.findById(eventId).lean();
      if (!event || String(event.organizer_id) !== String(senderId)) {
        socket.emit('forum-error', { message: 'Not your event' });
        return;
      }
    }

    const announcement = senderRole === 'organizer' && !!isAnnouncement;

    const message = await Message.create({
      eventId,
      senderId,
      senderRole,
      senderName,
      content: content.trim(),
      parentMessageId: parentMessageId || null,
      isAnnouncement: announcement,
    });

    const msgObj = message.toObject();

    io.to(`event:${eventId}`).emit('new-message', msgObj);

    if (announcement) {
      const participantIds = await getRegisteredParticipantIds(eventId);
      if (participantIds.length > 0) {
        const notifications = participantIds.map((uid) => ({
          userId: uid,
          eventId,
          messageId: message._id,
          type: 'announcement',
          read: false,
          previewText: content.trim().slice(0, 120),
        }));
        const inserted = await Notification.insertMany(notifications);
        inserted.forEach((notif, i) => {
          io.to(`user:${participantIds[i]}`).emit('new-notification', notif.toObject());
        });
      }
    }
  } catch (err) {
    console.error('handleSendMessage error', err);
    socket.emit('forum-error', { message: 'Failed to send message' });
  }
}


async function handleDeleteMessage(io, socket, payload, senderInfo) {
  try {
    const { eventId, messageId } = payload;
    const { senderId, senderRole } = senderInfo;

    if (senderRole !== 'organizer') {
      socket.emit('forum-error', { message: 'Only organizers can delete messages' });
      return;
    }

    const event = await Event.findById(eventId).lean();
    if (!event || String(event.organizer_id) !== String(senderId)) {
      socket.emit('forum-error', { message: 'Not your event' });
      return;
    }

    const now = new Date();
    const updated = await Message.findOneAndUpdate(
      { _id: messageId, eventId },
      { $set: { deletedAt: now } },
      { new: true }
    );

    if (!updated) return;

    const deletedIds = [String(updated._id)];

    let queue = [updated._id];
    while (queue.length > 0) {
      const parents = queue;
      queue = [];
      const children = await Message.find({ parentMessageId: { $in: parents }, eventId, deletedAt: null }).select('_id').lean();
      if (!children || children.length === 0) break;
      const childIds = children.map((c) => c._id);
      await Message.updateMany({ _id: { $in: childIds } }, { $set: { deletedAt: now } });
      childIds.forEach((id) => deletedIds.push(String(id)));
      queue.push(...childIds);
    }

    io.to(`event:${eventId}`).emit('message-deleted', { messageIds: deletedIds });
  } catch (err) {
    console.error('handleDeleteMessage error', err);
    socket.emit('forum-error', { message: 'Failed to delete message' });
  }
}


async function handlePinMessage(io, socket, payload, senderInfo) {
  try {
    const { eventId, messageId, pin } = payload;
    const { senderId, senderRole } = senderInfo;

    if (senderRole !== 'organizer') {
      socket.emit('forum-error', { message: 'Only organizers can pin messages' });
      return;
    }

    const event = await Event.findById(eventId).lean();
    if (!event || String(event.organizer_id) !== String(senderId)) {
      socket.emit('forum-error', { message: 'Not your event' });
      return;
    }

    const updated = await Message.findOneAndUpdate(
      { _id: messageId, eventId },
      { $set: { isPinned: !!pin } },
      { new: true }
    );

    if (updated) {
      io.to(`event:${eventId}`).emit('message-pinned', { messageId, isPinned: !!pin });
    }
  } catch (err) {
    console.error('handlePinMessage error', err);
    socket.emit('forum-error', { message: 'Failed to pin/unpin message' });
  }
}


async function handleReactMessage(io, socket, payload, senderInfo) {
  try {
    const { eventId, messageId, emoji } = payload;
    const { senderId, senderRole } = senderInfo;

    if (!emoji) return;

    if (senderRole === 'participant') {
      const ok = await assertParticipantRegistered(eventId, senderId);
      if (!ok) {
        socket.emit('forum-error', { message: 'Not registered for this event' });
        return;
      }
    }

    const message = await Message.findOne({ _id: messageId, eventId });
    if (!message || message.deletedAt) return;

    const existingIdx = message.reactions.findIndex(
      (r) => r.emoji === emoji && String(r.userId) === String(senderId)
    );

    if (existingIdx >= 0) {
      message.reactions.splice(existingIdx, 1);
    } else {
      message.reactions.push({ emoji, userId: senderId, userRole: senderRole });
    }

    await message.save();

    io.to(`event:${eventId}`).emit('reaction-updated', {
      messageId,
      reactions: message.reactions,
    });
  } catch (err) {
    console.error('handleReactMessage error', err);
    socket.emit('forum-error', { message: 'Failed to react to message' });
  }
}

module.exports = {
  getMessages,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  handleSendMessage,
  handleDeleteMessage,
  handlePinMessage,
  handleReactMessage,
};
