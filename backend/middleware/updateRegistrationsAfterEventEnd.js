const mongoose = require('mongoose');
const Event = require('../models/Event');
const EventRegistration = require('../models/EventRegistration');

// Middleware: if the target event has ended, mark any UPCOMING registrations as COMPLETED.
// It supports requests that include :id (eventId), :regId (registration id) or :orderId (registration/order id).
module.exports = async function updateRegistrationsAfterEventEnd(req, res, next) {
  try {
    console.log('[updateRegs] triggered for path', req.originalUrl, 'params', req.params, 'method', req.method);
    let eventId = null;

    // Prefer explicit event id param
    if (req.params && req.params.id) {
      eventId = req.params.id;
    }

    // If we have a registration id, resolve its event
    if (!eventId && req.params && (req.params.regId || req.params.orderId)) {
      const rid = req.params.regId || req.params.orderId;
      if (mongoose.Types.ObjectId.isValid(rid)) {
        const reg = await EventRegistration.findById(rid).select('eventId status');
        if (reg && reg.eventId) eventId = String(reg.eventId);
      }
    }

    // Special case: participant requesting their registrations list -> update any of their UPCOMING regs
    if (!eventId) {
      // If this is the participant registrations endpoint (/registrations) and participant is authenticated
      if (req.path && req.path.includes('/registrations') && req.method === 'GET' && req.participant && mongoose.Types.ObjectId.isValid(String(req.participant._id))) {
        const now2 = new Date();
        // Find registrations for this participant that are UPCOMING and whose event end date has passed
        const regs = await EventRegistration.find({ participantId: req.participant._id, status: 'UPCOMING' }).select('eventId');
        const eventIds = regs.map(r => r.eventId).filter(Boolean);
        if (eventIds.length > 0) {
          // Find events that have ended
          const ended = await Event.find({ _id: { $in: eventIds }, event_end_date: { $lte: now2 } }).select('_id');
          const endedIds = ended.map(e => String(e._id));
          if (endedIds.length > 0) {
            await EventRegistration.updateMany(
              { participantId: req.participant._id, eventId: { $in: endedIds }, status: 'UPCOMING' },
              { $set: { status: 'COMPLETED' } }
            ).exec();
          }
        }
      }
      // No specific eventId to process further
      return next();
    }
    if (!mongoose.Types.ObjectId.isValid(eventId)) return next();

    // Load event and check end date
    const event = await Event.findById(eventId).select('event_end_date');
    if (!event || !event.event_end_date) return next();

    const now = new Date();
    const end = new Date(event.event_end_date);
    if (end <= now) {
      // update registrations: only those that are UPCOMING -> COMPLETED
      await EventRegistration.updateMany(
        { eventId: new mongoose.Types.ObjectId(eventId), status: 'UPCOMING' }, // ✅ ONLY CHANGE HERE
        { $set: { status: 'COMPLETED' } }
      ).exec();
    }

    return next();
  } catch (err) {
    // Do not block the request on middleware failure; log and continue
    console.error('updateRegistrationsAfterEventEnd error:', err.message || err);
    return next();
  }
};