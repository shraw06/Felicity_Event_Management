const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  emoji: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userRole: { type: String, enum: ['participant', 'organizer'], required: true },
}, { _id: false });

const messageSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  senderRole: { type: String, enum: ['participant', 'organizer'], required: true },
  senderName: { type: String, required: true },
  content: { type: String, required: true, maxlength: 4000 },
  parentMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  isPinned: { type: Boolean, default: false },
  isAnnouncement: { type: Boolean, default: false },
  reactions: { type: [reactionSchema], default: [] },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

messageSchema.index({ eventId: 1, createdAt: 1 });
messageSchema.index({ eventId: 1, isPinned: 1 });

module.exports = mongoose.model('Message', messageSchema);
