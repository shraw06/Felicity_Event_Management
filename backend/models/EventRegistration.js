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
  // ticket fields: store last issued ticket id and QR image (png) as buffer
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
  // ── Payment-proof fields (merchandise events only) ──────────────────────────
  payment_status: {
    type: String,
    enum: ['awaiting_payment', 'pending_approval', 'rejected', 'successful'],
    default: null,          // null for normal-event registrations
  },
  paymentProofUrl: {
    type: String,
    default: null,
  },
  rejectionReason: {
    type: String,
    default: null,
  },
  // ── Attendance / scan fields ────────────────────────────────────────────────
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
},
{
  timestamps: true
});

// Prevent duplicate joins
eventRegistrationSchema.index(
  { participantId: 1, eventId: 1 },
  { unique: true }
);

// After first registration for an event, lock the event's formFields so organizers
// After first registration for an event, lock the event's formFields so organizers
// cannot change the registration form structure. Place the hook before export so
// it's attached to the schema definition; use the saved document's constructor to
// count registrations (avoids referencing models before registration).
eventRegistrationSchema.post('save', async function (doc, next) {
  try {
    const Event = require('./Event');
    // use the model that saved this document to count documents reliably
    const cnt = await doc.constructor.countDocuments({ eventId: doc.eventId });
    if (cnt === 1) {
      // first registration -> lock the form
      await Event.findByIdAndUpdate(doc.eventId, { form_locked: true }, { new: true });
    }
    return next();
  } catch (err) {
    // don't block registration on lock failure, but log it
    console.error('Error locking event form after registration:', err.message || err);
    return next();
  }
});

module.exports = mongoose.model(
  "EventRegistration",
  eventRegistrationSchema
);
