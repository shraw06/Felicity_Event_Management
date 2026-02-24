const mongoose = require("mongoose");

const eventRegistrationSchema = new mongoose.Schema(
{
  participantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Participant",
    required: true
  },

  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true
  },

  status: {
    type: String,
    enum: [
      "UPCOMING",
      "COMPLETED",
      "CANCELLED"
    ],
    default: "UPCOMING"
  }
  ,
  ticketId: {
    type: String,
    default: null,
  },
  ticketQr: {
    type: Buffer,
    default: null,
  },
  ticketQrContentType: {
    type: String,
    default: null,
  },
  payment_status: {
    type: String,
    enum: ['awaiting_payment', 'pending_approval', 'rejected', 'successful'],
    default: null,          
  },
  paymentProofUrl: {
    type: String,
    default: null,
  },
  rejectionReason: {
    type: String,
    default: null,
  },
  attended: {
    type: Boolean,
    default: false,
  },
  firstScanAt: {
    type: Date,
    default: null,
  },
  scannedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organizer",
    default: null,
  },
  scanMethod: {
    type: String,
    enum: ['camera', 'upload', 'manual'],
    default: null,
  },
  scanHistory: [
    {
      scanner: { type: mongoose.Schema.Types.ObjectId, ref: "Organizer" },
      name: String,
      method: { type: String, enum: ['camera', 'upload', 'manual'] },
      ip: String,
      ts: { type: Date, default: Date.now },
      notes: String,
    },
  ],
  manualOverrides: [
    {
      by: { type: mongoose.Schema.Types.ObjectId, ref: "Organizer" },
      name: String,
      ts: { type: Date, default: Date.now },
      action: { type: String, enum: ['set', 'unset'] },
      reason: String,
    },
  ],
  // ── Custom registration form responses (keyed by formField.name → value) ────
  formResponses: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: undefined,
  },
},
{
  timestamps: true
});

eventRegistrationSchema.index(
  { participantId: 1, eventId: 1 },
  { unique: true }
);


eventRegistrationSchema.post('save', async function (doc, next) {
  try {
    const Event = require('./Event');
    const cnt = await doc.constructor.countDocuments({ eventId: doc.eventId });
    if (cnt === 1) {
      await Event.findByIdAndUpdate(doc.eventId, { form_locked: true }, { new: true });
    }
    return next();
  } catch (err) {
    console.error('Error locking event form after registration:', err.message || err);
    return next();
  }
});

module.exports = mongoose.model(
  "EventRegistration",
  eventRegistrationSchema
);
