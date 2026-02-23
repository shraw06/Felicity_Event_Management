const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Participant', required: true, index: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true },
  type: { type: String, enum: ['announcement'], default: 'announcement' },
  read: { type: Boolean, default: false },
  previewText: { type: String, default: '' },
}, { timestamps: true });

notificationSchema.index({ userId: 1, read: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
