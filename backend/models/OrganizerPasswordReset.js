const mongoose = require('mongoose');

const PasswordResetRequestSchema = new mongoose.Schema(
  {
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organizer',
      required: true,
    },
    organizerEmail: {
      type: String,
      required: true,
      trim: true,
    },
    clubName: {
      type: String,
      required: true,
      trim: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    adminComments: {
      type: String,
      default: '',
      trim: true,
    },
    // History / audit trail
    history: [
      {
        action: { type: String, required: true }, // 'created', 'approved', 'rejected'
        by: { type: mongoose.Schema.Types.ObjectId, required: true },
        role: { type: String, enum: ['organizer', 'admin'], required: true },
        timestamp: { type: Date, default: Date.now },
        comments: { type: String, default: '' },
      },
    ],
  },
  { timestamps: true }
);

PasswordResetRequestSchema.index({ organizerId: 1, status: 1 });
PasswordResetRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('OrganizerPasswordReset', PasswordResetRequestSchema);
