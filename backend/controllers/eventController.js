const { get } = require('mongoose');
const Event = require('../models/Event');
const Organizer = require('../models/Organizer');
const { sendDiscordNotification } = require('../utils/discord');

// Create event (organizer must be authenticated) - saved as draft
const createEvent = async (req, res) => {
  try {
    // Organizer id should be taken from authenticated organizer if available
    const organizerId = (req.organizer && req.organizer._id) || req.body.organizer_id;
    if (!organizerId) {
      return res.status(400).json({ success: false, error: 'Organizer id is required' });
    }

    const payload = {
      name: req.body.name,
      description: req.body.description,
      type: req.body.type,
      non_iiit_eligibility: req.body.non_iiit_eligibility,
      registration_deadline: req.body.registration_deadline,
      event_start_date: req.body.event_start_date,
      event_end_date: req.body.event_end_date,
      registration_limit: req.body.registration_limit,
      registration_fee: req.body.registration_fee,
      organizer_id: organizerId,
      event_tags: req.body.event_tags,
      formFields: req.body.formFields,
      merchandise: req.body.merchandise,
      status: 'draft',
    };

    const ev = await Event.create(payload);
    res.status(201).json({ success: true, data: ev });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// Get event by id
const getEvent = async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ success: false, error: 'Event not found' });

    // count registrations for this event
    const EventRegistration = require('../models/EventRegistration');
    const registrationCount = await EventRegistration.countDocuments({ eventId: ev._id });

    // if a participant is authenticated, include whether they are registered
    let participantRegistered = false;
    let participantRegistrationId = null;
    try {
      if (req && req.participant && req.participant._id) {
        const existing = await EventRegistration.findOne({ eventId: ev._id, participantId: req.participant._id });
        if (existing) {
          participantRegistered = true;
          participantRegistrationId = existing._id;
        }
      }
    } catch (e) {
      // ignore errors here; we don't want to fail the whole request if registration lookup fails
      console.error('Error checking participant registration', e && e.message);
    }

    res.status(200).json({ success: true, data: { event: ev, registrationCount, participantRegistered, participantRegistrationId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Update event with lifecycle and permission rules
const updateEvent = async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ success: false, error: 'Event not found' });

    // Only organizer who owns the event can update
    const organizerId = req.organizer && req.organizer._id;
    if (!organizerId || String(ev.organizer_id) !== String(organizerId)) {
      return res.status(403).json({ success: false, error: 'Forbidden: not event owner' });
    }

    const incoming = req.body || {};

    // lifecycle behavior
    const status = ev.status;

    if (status === 'draft') {
      if ((incoming.type || ev.type) === 'normal') {
  const form = incoming.formFields || ev.formFields;
  if (!form || form.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'At least one form field is required to publish'
    });
  }
}

if ((incoming.type || ev.type) === 'merchandise') {
  const merch = incoming.merchandise || ev.merchandise;
  if (!merch || merch.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Merchandise events must define merchandise items'
    });
  }
}
      // allow all updates; if publishing, ensure required fields present
      // if (incoming.status === 'published') {
      //   // basic validation
      //   if (!incoming.name && !ev.name) return res.status(400).json({ success: false, error: 'Event name required to publish' });
      //   const form = incoming.formFields || ev.formFields;
      //   if (!form || form.length === 0) return res.status(400).json({ success: false, error: 'At least one form field is required to publish' });
      // }
      // apply allowed fields
      const allowed = ['name','description','type','non_iiit_eligibility','registration_deadline','event_start_date','event_end_date','registration_limit','registration_fee','event_tags','formFields', 'merchandise', 'status'];
      allowed.forEach((f) => { if (Object.prototype.hasOwnProperty.call(incoming, f)) ev[f] = incoming[f]; });
      
      await ev.save();

      // Send Discord notification if status changed from draft to published
      if (status === 'draft' && ev.status === 'published') {
        try {
          // If req.organizer is populated, check if we need to fetch fresh to get webhook
          // (Assuming req.organizer has the fields from login/auth middleware)
          // Just in case, let's fetch to be safe or check if it's there.
          // The auth middleware usually attaches the user document. 
          // If the auth middleware doesn't include discordWebhook (if it uses select), we might need to fetch.
          // Let's assume we might need to fetch if it's missing.
          let organizer = req.organizer;
          if (!organizer.discordWebhook) {
             organizer = await Organizer.findById(organizer._id);
          }

          if (organizer && organizer.discordWebhook) {
            await sendDiscordNotification(organizer.discordWebhook, ev);
          }
        } catch (discordErr) {
          console.error('Failed to send Discord notification', discordErr);
          // Don't fail the request if notification fails
        }
      }

      return res.status(200).json({ success: true, data: ev });
    }

    if (status === 'published') {
      // Only description editable, deadline can be extended, limit can be increased
      const updates = {};
      if (incoming.description) updates.description = incoming.description;
      if (incoming.registration_deadline) {
        const newDate = new Date(incoming.registration_deadline);
        if (newDate < ev.registration_deadline) return res.status(400).json({ success: false, error: 'Cannot reduce registration deadline' });
        updates.registration_deadline = newDate;
      }
      if (typeof incoming.registration_limit !== 'undefined') {
        const newLimit = Number(incoming.registration_limit);
        if (newLimit < (ev.registration_limit || 0)) return res.status(400).json({ success: false, error: 'Cannot decrease registration limit' });
        updates.registration_limit = newLimit;
      }
      // allow closing registrations or marking completed via status
      if (incoming.status) {
        const allowedStatus = ['closed','ongoing','completed'];
        if (!allowedStatus.includes(incoming.status)) return res.status(400).json({ success: false, error: 'Invalid status transition' });
        updates.status = incoming.status;
      }

      // do not allow changing formFields or core details
      const forbidden = ['name','type','formFields','organizer_id'];
      for (const f of forbidden) if (Object.prototype.hasOwnProperty.call(incoming, f)) return res.status(403).json({ success: false, error: 'Cannot modify locked field: '+f });

      Object.assign(ev, updates);
      await ev.save();
      return res.status(200).json({ success: true, data: ev });
    }

    // ongoing/completed/closed: disallow edits except status transitions
    if (['ongoing','completed','closed'].includes(status)) {
      if (incoming.status) {
        // allow transition to completed or closed
        const allowed = ['completed','closed'];
        if (!allowed.includes(incoming.status)) return res.status(400).json({ success: false, error: 'Invalid status transition' });
        ev.status = incoming.status;
        await ev.save();
        return res.status(200).json({ success: true, data: ev });
      }
      return res.status(403).json({ success: false, error: 'Event locked; no edits allowed' });
    }

    return res.status(400).json({ success: false, error: 'Unhandled event state' });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
};

// Get all events by organizer id
const getEventsByOrganizer = async (req, res) => {
  try {
    const events = await Event.find({ organizer_id: req.params.organizerId }).sort({ updatedAt: -1 });
    res.status(200).json({ success: true, data: events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const getAllEvents = async (req, res) => {
  try {
    const events = await Event.find().sort({ updatedAt: -1 });
    res.status(200).json({ success: true, data: events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};  

// Get trending events (top N by registrations in last 24 hours)
const getTrendingEvents = async (req, res) => {
  try {
    const EventRegistration = require('../models/EventRegistration');
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const agg = await EventRegistration.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$eventId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'events',
          localField: '_id',
          foreignField: '_id',
          as: 'event',
        },
      },
      { $unwind: '$event' },
      { $project: { _id: 0, event: '$event', count: 1 } },
    ]).exec();

    // return array of { event, count }
    res.status(200).json({ success: true, data: agg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Participant registers for a normal event (creates EventRegistration, sends ticket email)
const registerForEvent = async (req, res) => {
  try {
    const participant = req.participant; // set by protectParticipant
    if (!participant) return res.status(401).json({ success: false, error: 'Participant required' });

    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ success: false, error: 'Event not found' });

    const eventType = (ev.type || '').toLowerCase();
    if (eventType !== 'normal') return res.status(400).json({ success: false, error: 'Event is not a normal event' });

    const now = new Date();
    if (ev.registration_deadline && new Date(ev.registration_deadline) < now) return res.status(400).json({ success: false, error: 'Registration deadline passed' });
    if (ev.status !== 'published' && ev.status !== 'ongoing') return res.status(400).json({ success: false, error: 'Event not open for registration' });

    // Eligibility: if event is IIIT-only (non_iiit_eligibility === false), block non-IIIT participants
    if (ev.non_iiit_eligibility === false) {
      // participant.iiit_participant is a boolean on Participant model
      if (!participant.iiit_participant) {
        return res.status(403).json({ success: false, error: 'You are not eligible to register for this IIIT-only event' });
      }
    }

    const EventRegistration = require('../models/EventRegistration');

    // enforce registration limit (do not count CANCELLED registrations)
    if (typeof ev.registration_limit === 'number' && ev.registration_limit > 0) {
      const cnt = await EventRegistration.countDocuments({ eventId: ev._id, status: { $ne: 'CANCELLED' } });
      if (cnt >= ev.registration_limit) return res.status(400).json({ success: false, error: 'Registration limit reached' });
    }

    // check for existing registration for this participant
    let reg = await EventRegistration.findOne({ eventId: ev._id, participantId: participant._id });
    if (reg) {
      if (reg.status === 'CANCELLED') {
        // ensure deadline still open before re-activating
        if (ev.registration_deadline && new Date(ev.registration_deadline) < now) {
          return res.status(400).json({ success: false, error: 'Registration deadline passed' });
        }
        // reactivate cancelled registration
        reg.status = 'UPCOMING';
        await reg.save();
        // continue to generate ticket and email for re-activation
      } else {
        // already registered (UPCOMING or COMPLETED)
        return res.status(200).json({ success: true, data: { registration: reg, message: 'Already registered' } });
      }
    } else {
      // create new registration
      // ensure deadline still open before creating
      if (ev.registration_deadline && new Date(ev.registration_deadline) < now) {
        return res.status(400).json({ success: false, error: 'Registration deadline passed' });
      }
      reg = await EventRegistration.create({ participantId: participant._id, eventId: ev._id });
    }

    // generate ticket id and QR
    const { v4: uuidv4 } = require('uuid');
    const QRCode = require('qrcode');
    const ticketId = uuidv4();
  const qrData = await QRCode.toDataURL(JSON.stringify({ ticketId, eventId: String(ev._id), participantId: String(participant._id) }));
  // convert data URL to buffer for CID attachment
  const qrBase64 = qrData.split(',')[1];
  const qrBuffer = Buffer.from(qrBase64, 'base64');

  // send email via nodemailer (using SMTP creds from env)
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: participant.email,
      subject: `Ticket for ${ev.name} - ${ticketId}`,
      html: `<p>Hi ${participant.first_name || ''},</p>
             <p>Thank you for registering for <strong>${ev.name}</strong>.</p>
             <p><strong>Event date:</strong> ${ev.event_start_date ? new Date(ev.event_start_date).toLocaleString() : '—'}</p>
             <p>Your Ticket ID: <strong>${ticketId}</strong></p>
             <p><img src="cid:ticket_qr_${ticketId}" alt="QR code" /></p>
             <p>Show this QR at check-in.</p>`,
      attachments: [
        {
          filename: `ticket-qr-${ticketId}.png`,
          content: qrBuffer,
          contentType: 'image/png',
          cid: `ticket_qr_${ticketId}`,
        },
      ],
    };

    // persist ticket info on registration
    try {
      reg.ticketId = ticketId;
      reg.ticketQr = qrBuffer;
      reg.ticketQrContentType = 'image/png';
      await reg.save();
    } catch (e) {
      console.error('Failed to save ticket info on registration', e && e.message);
    }

    // send but don't block on failure too long
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) console.error('Failed to send registration email', err);
      else console.log('Registration email sent', info && info.messageId);
    });

    return res.status(201).json({ success: true, data: { registration: reg, ticketId } });
  } catch (err) {
    console.error('registerForEvent error', err);
    return res.status(400).json({ success: false, error: err.message });
  }
};

// Purchase merchandise (creates registration + decrements stock + sends ticket email)
const purchaseMerchandise = async (req, res) => {
  try {
    const participant = req.participant;
    if (!participant) return res.status(401).json({ success: false, error: 'Participant required' });

    const eventId = req.params.id;
    const { itemId, quantity = 1 } = req.body; // itemId should be the merchandise._id
    if (!itemId) return res.status(400).json({ success: false, error: 'itemId required' });

    const ev = await Event.findById(eventId);
    if (!ev) return res.status(404).json({ success: false, error: 'Event not found' });

    const eventType = (ev.type || '').toLowerCase();
    if (eventType !== 'merchandise') return res.status(400).json({ success: false, error: 'Event is not merchandise type' });

    if (ev.status !== 'published' && ev.status !== 'ongoing') return res.status(400).json({ success: false, error: 'Merchandise sales not open' });
    const now = new Date();
    if (ev.registration_deadline && new Date(ev.registration_deadline) < now) return res.status(400).json({ success: false, error: 'Sales deadline passed' });

    // Eligibility: if event is IIIT-only (non_iiit_eligibility === false), block non-IIIT participants
    if (ev.non_iiit_eligibility === false) {
      if (!participant.iiit_participant) {
        return res.status(403).json({ success: false, error: 'You are not eligible to purchase for this IIIT-only event' });
      }
    }

    // atomic stock decrement: find the item by _id and decrement if sufficient stock
    const updated = await Event.findOneAndUpdate(
      { _id: eventId, 'merchandise._id': itemId, 'merchandise.stockQuantity': { $gte: quantity } },
      { $inc: { 'merchandise.$.stockQuantity': -quantity } },
      { new: true }
    );

    if (!updated) return res.status(400).json({ success: false, error: 'Item out of stock or insufficient stock' });

  // create registration (purchase implies registration)
  const EventRegistration = require('../models/EventRegistration');
  const reg = await EventRegistration.create({ participantId: participant._id, eventId: ev._id });

    // ticket generation
    const { v4: uuidv4 } = require('uuid');
    const QRCode = require('qrcode');
    const ticketId = uuidv4();
  const qrData = await QRCode.toDataURL(JSON.stringify({ ticketId, eventId: String(ev._id), participantId: String(participant._id), itemId }));
  const qrBase64 = qrData.split(',')[1];
  const qrBuffer = Buffer.from(qrBase64, 'base64');

  // send email
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // find item metadata from updated doc
    const merchItem = updated.merchandise.find(m => String(m._id) === String(itemId));

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: participant.email,
      subject: `Purchase confirmation for ${ev.name} - ${ticketId}`,
      html: `<p>Hi ${participant.first_name || ''},</p>
             <p>Thank you for purchasing <strong>${merchItem.itemName}</strong> for event <strong>${ev.name}</strong>.</p>
             <p><strong>Event date:</strong> ${ev.event_start_date ? new Date(ev.event_start_date).toLocaleString() : '—'}</p>
             <p><strong>Item:</strong> ${merchItem.itemName} (qty: ${quantity})</p>
             <p>Your Ticket ID: <strong>${ticketId}</strong></p>
             <p><img src="cid:ticket_qr_${ticketId}" alt="QR code" /></p>
             <p>Show this QR at pickup/check-in.</p>`,
      attachments: [
        {
          filename: `ticket-qr-${ticketId}.png`,
          content: qrBuffer,
          contentType: 'image/png',
          cid: `ticket_qr_${ticketId}`,
        },
      ],
    };

    // persist ticket info on registration
    try {
      reg.ticketId = ticketId;
      reg.ticketQr = qrBuffer;
      reg.ticketQrContentType = 'image/png';
      await reg.save();
    } catch (e) {
      console.error('Failed to save ticket info on purchase registration', e && e.message);
    }

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) console.error('Failed to send purchase email', err);
      else console.log('Purchase email sent', info && info.messageId);
    });

    return res.status(201).json({ success: true, data: { registration: reg, ticketId } });
  } catch (err) {
    console.error('purchaseMerchandise error', err);
    return res.status(400).json({ success: false, error: err.message });
  }
};


// Get the current participant's registration for an event (if any)
async function getParticipantRegistration(req, res) {
  try {
    const participant = req.participant;
    if (!participant) return res.status(401).json({ success: false, error: 'Participant required' });

    const eventId = req.params.id;
    const EventRegistration = require('../models/EventRegistration');
    const reg = await EventRegistration.findOne({ eventId, participantId: participant._id });
    if (!reg) return res.status(200).json({ success: true, data: { registered: false } });
    return res.status(200).json({ success: true, data: { registered: true, registration: reg } });
  } catch (err) {
    console.error('getParticipantRegistration error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// Cancel (delete) the participant's registration for an event
async function cancelRegistration(req, res) {
  try {
    const participant = req.participant;
    if (!participant) return res.status(401).json({ success: false, error: 'Participant required' });

    const eventId = req.params.id;
    const EventRegistration = require('../models/EventRegistration');
    // mark the registration as cancelled instead of deleting so history is retained
    const reg = await EventRegistration.findOneAndUpdate(
      { eventId, participantId: participant._id },
      { $set: { status: 'CANCELLED', ticketId: null, ticketQr: null, ticketQrContentType: null } },
      { new: true }
    );
    if (!reg) return res.status(404).json({ success: false, error: 'Registration not found' });

    // Note: we do not currently restore merchandise stock here because purchase records
    // do not store item details on the registration document. If purchase returns item info,
    // consider restoring stock here or storing item metadata on the registration document.

    return res.status(200).json({ success: true, data: { message: 'Registration cancelled', registration: reg } });
  } catch (err) {
    console.error('cancelRegistration error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// Get all registrations for the current participant with populated event details
async function getParticipantRegistrations(req, res) {
  try {
    const participant = req.participant;
    if (!participant) return res.status(401).json({ success: false, error: 'Participant required' });

    const EventRegistration = require('../models/EventRegistration');
    // support optional ?upcoming=true to return only registrations with status 'UPCOMING'
    const upcomingOnly = (req.query && (req.query.upcoming === 'true' || req.query.upcoming === '1'));

    // build query
    const query = { participantId: participant._id };
    if (upcomingOnly) query.status = 'UPCOMING';

    // populate event details
    const regs = await EventRegistration.find(query).populate({ path: 'eventId' }).sort({ createdAt: -1 }).exec();

    // Map to a compact structure: include registration and event object
    const now = new Date();
    let items = regs.map(r => ({ registration: r, event: r.eventId })).filter(({ event }) => !!event);

    // For upcoming-only requests, additionally filter out events that have already completed
    if (upcomingOnly) {
      items = items.filter(({ event }) => {
        try {
          if (event.status === 'ongoing' || event.status === 'published') return true;
          if (event.event_end_date && new Date(event.event_end_date) > now) return true;
          if (event.event_start_date && new Date(event.event_start_date) > now) return true;
          return false;
        } catch (e) {
          return false;
        }
      });
    }

    return res.status(200).json({ success: true, data: items });
  } catch (err) {
    console.error('getParticipantRegistrations error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// Get ticket details (ticketId and QR) for a specific registration (participant must own it)
async function getRegistrationTicket(req, res) {
  try {
    const participant = req.participant;
    if (!participant) return res.status(401).json({ success: false, error: 'Participant required' });

    const regId = req.params.regId;
    const EventRegistration = require('../models/EventRegistration');
    const reg = await EventRegistration.findById(regId).populate('eventId');
    if (!reg) return res.status(404).json({ success: false, error: 'Registration not found' });
    if (String(reg.participantId) !== String(participant._id)) return res.status(403).json({ success: false, error: 'Forbidden' });

    // If no ticket stored, return 404 with message
    if (!reg.ticketId || !reg.ticketQr) {
      return res.status(404).json({ success: false, error: 'No ticket available for this registration' });
    }

    const ticketBase64 = reg.ticketQr.toString('base64');
    return res.status(200).json({ success: true, data: { ticketId: reg.ticketId, ticketQrBase64: ticketBase64, contentType: reg.ticketQrContentType || 'image/png', event: reg.eventId } });
  } catch (err) {
    console.error('getRegistrationTicket error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// Organizer-only: get registrations for a specific event (with participant info)
const getRegistrationsForEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const ev = await Event.findById(eventId);
    if (!ev) return res.status(404).json({ success: false, error: 'Event not found' });

    // Only the organizer who owns the event can access registrations
    const organizerId = req.organizer && req.organizer._id;
    if (!organizerId || String(ev.organizer_id) !== String(organizerId)) {
      return res.status(403).json({ success: false, error: 'Forbidden: not event owner' });
    }

    const EventRegistration = require('../models/EventRegistration');
    // find all registrations for the event and populate participant info
    const regs = await EventRegistration.find({ eventId }).populate({ path: 'participantId', select: 'first_name last_name email' }).sort({ createdAt: -1 }).exec();

    // Build analytics: registrations count (exclude CANCELLED), revenue estimate
    const totalRegistrations = regs.length;
    const activeRegistrations = regs.filter(r => r.status !== 'CANCELLED').length;
    const registrationFee = Number(ev.registration_fee) || 0;
    const estimatedRevenue = registrationFee * activeRegistrations; // merchandise sales not tracked here

    // map to a friendly shape
    const items = regs.map(r => ({
      registrationId: r._id,
      status: r.status,
      createdAt: r.createdAt,
      participant: r.participantId || null,
      ticketId: r.ticketId || null,
    }));

    return res.status(200).json({ success: true, data: { event: ev, registrations: items, analytics: { totalRegistrations, activeRegistrations, estimatedRevenue } } });
  } catch (err) {
    console.error('getRegistrationsForEvent error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  createEvent,
  getEvent,
  updateEvent,
  getEventsByOrganizer,
  getAllEvents,
  getTrendingEvents,
  registerForEvent,
  purchaseMerchandise,
  getParticipantRegistration,
  cancelRegistration,
  getParticipantRegistrations,
  getRegistrationTicket,
  getRegistrationsForEvent,
  createMerchandiseOrder,
  uploadPaymentProof,
  getEventOrders,
  updateOrderStatus,
  getOrderById,
  getOrganizerPayments,
  scanTicket,
  getEventAttendance,
  manualAttendance,
  exportAttendanceCsv,
};

// ──────────────────────────────────────────────────────────────────────────────
// Payment-proof merchandise order flow
// ──────────────────────────────────────────────────────────────────────────────

// POST /api/events/:id/orders — participant creates an order (awaiting_payment)
async function createMerchandiseOrder(req, res) {
  try {
    const participant = req.participant;
    if (!participant) return res.status(401).json({ success: false, error: 'Participant required' });

    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ success: false, error: 'Event not found' });
    if ((ev.type || '').toLowerCase() !== 'merchandise')
      return res.status(400).json({ success: false, error: 'Event is not a merchandise event' });
    if (ev.status !== 'published' && ev.status !== 'ongoing')
      return res.status(400).json({ success: false, error: 'Merchandise sales not open' });

    const now = new Date();
    if (ev.registration_deadline && new Date(ev.registration_deadline) < now)
      return res.status(400).json({ success: false, error: 'Sales deadline passed' });

    // Eligibility check
    if (ev.non_iiit_eligibility === false && !participant.iiit_participant)
      return res.status(403).json({ success: false, error: 'IIIT-only event' });

    const EventRegistration = require('../models/EventRegistration');

    // Registration limit
    if (typeof ev.registration_limit === 'number' && ev.registration_limit > 0) {
      const cnt = await EventRegistration.countDocuments({ eventId: ev._id, status: { $ne: 'CANCELLED' } });
      if (cnt >= ev.registration_limit)
        return res.status(400).json({ success: false, error: 'Registration limit reached' });
    }

    // Prevent duplicate active order
    const existing = await EventRegistration.findOne({
      eventId: ev._id,
      participantId: participant._id,
      payment_status: { $in: ['awaiting_payment', 'pending_approval'] },
    });
    if (existing)
      return res.status(400).json({ success: false, error: 'You already have a pending order for this event' });

    const reg = await EventRegistration.create({
      participantId: participant._id,
      eventId: ev._id,
      payment_status: 'awaiting_payment',
    });

    return res.status(201).json({ success: true, data: reg });
  } catch (err) {
    console.error('createMerchandiseOrder error', err);
    return res.status(400).json({ success: false, error: err.message });
  }
}

// POST /api/event-registrations/:orderId/payment-proof
async function uploadPaymentProof(req, res) {
  try {
    const participant = req.participant;
    if (!participant) return res.status(401).json({ success: false, error: 'Participant required' });

    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const EventRegistration = require('../models/EventRegistration');
    const reg = await EventRegistration.findById(req.params.orderId);
    if (!reg) return res.status(404).json({ success: false, error: 'Order not found' });
    if (String(reg.participantId) !== String(participant._id))
      return res.status(403).json({ success: false, error: 'Forbidden' });

    if (!['awaiting_payment', 'rejected'].includes(reg.payment_status))
      return res.status(400).json({ success: false, error: 'Cannot upload proof in current state' });

    reg.paymentProofUrl = 'uploads/payment-proofs/' + req.file.filename;
    reg.payment_status = 'pending_approval';
    reg.rejectionReason = null;
    await reg.save();

    return res.status(200).json({ success: true, data: reg });
  } catch (err) {
    console.error('uploadPaymentProof error', err);
    return res.status(400).json({ success: false, error: err.message });
  }
}

// GET /api/events/:id/orders?status=...  (organizer only)
async function getEventOrders(req, res) {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ success: false, error: 'Event not found' });

    const organizerId = req.organizer && req.organizer._id;
    if (!organizerId || String(ev.organizer_id) !== String(organizerId))
      return res.status(403).json({ success: false, error: 'Forbidden: not event owner' });

    const EventRegistration = require('../models/EventRegistration');
    const filter = { eventId: ev._id, payment_status: { $ne: null } };
    if (req.query.status) filter.payment_status = req.query.status;

    const orders = await EventRegistration.find(filter)
      .populate({ path: 'participantId', select: 'first_name last_name email' })
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: orders });
  } catch (err) {
    console.error('getEventOrders error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// PATCH /api/event-registrations/:orderId/status  (organizer only)
async function updateOrderStatus(req, res) {
  try {
    const { status, reason, itemId, quantity = 1 } = req.body;
    if (!['rejected', 'successful'].includes(status))
      return res.status(400).json({ success: false, error: 'Invalid status' });

    const EventRegistration = require('../models/EventRegistration');
    const reg = await EventRegistration.findById(req.params.orderId).populate('participantId');
    if (!reg) return res.status(404).json({ success: false, error: 'Order not found' });

    const ev = await Event.findById(reg.eventId);
    if (!ev) return res.status(404).json({ success: false, error: 'Event not found' });

    const organizerId = req.organizer && req.organizer._id;
    if (!organizerId || String(ev.organizer_id) !== String(organizerId))
      return res.status(403).json({ success: false, error: 'Forbidden: not event owner' });

    if (reg.payment_status !== 'pending_approval')
      return res.status(400).json({ success: false, error: 'Order is not pending approval' });

    // ── Reject ──────────────────────────────────────────────────────────────────
    if (status === 'rejected') {
      reg.payment_status = 'rejected';
      reg.rejectionReason = reason || '';
      await reg.save();
      return res.status(200).json({ success: true, data: { order: reg } });
    }

    // ── Approve (successful) ────────────────────────────────────────────────────
    if (!itemId) return res.status(400).json({ success: false, error: 'itemId required for approval' });

    // Atomic stock decrement
    const updated = await Event.findOneAndUpdate(
      { _id: ev._id, 'merchandise._id': itemId, 'merchandise.stockQuantity': { $gte: quantity } },
      { $inc: { 'merchandise.$.stockQuantity': -quantity } },
      { new: true },
    );
    if (!updated) return res.status(409).json({ success: false, error: 'Item out of stock or insufficient stock' });

    reg.payment_status = 'successful';
    reg.rejectionReason = null;

    // ── Ticket + QR + email (reuse existing logic) ────────────────────────────
    const { v4: uuidv4 } = require('uuid');
    const QRCode = require('qrcode');
    const ticketId = uuidv4();
    const participant = reg.participantId; // populated
    const qrData = await QRCode.toDataURL(
      JSON.stringify({ ticketId, eventId: String(ev._id), participantId: String(participant._id), itemId }),
    );
    const qrBase64 = qrData.split(',')[1];
    const qrBuffer = Buffer.from(qrBase64, 'base64');

    reg.ticketId = ticketId;
    reg.ticketQr = qrBuffer;
    reg.ticketQrContentType = 'image/png';
    await reg.save();

    // send email
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const merchItem = updated.merchandise.find(m => String(m._id) === String(itemId));
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: participant.email,
      subject: `Purchase approved – ${ev.name} – ${ticketId}`,
      html: `<p>Hi ${participant.first_name || ''},</p>
             <p>Your payment for <strong>${merchItem ? merchItem.itemName : 'merchandise'}</strong> (event: <strong>${ev.name}</strong>) has been approved.</p>
             <p>Your Ticket ID: <strong>${ticketId}</strong></p>
             <p><img src="cid:ticket_qr_${ticketId}" alt="QR code" /></p>
             <p>Show this QR at pickup/check-in.</p>`,
      attachments: [{ filename: `ticket-qr-${ticketId}.png`, content: qrBuffer, contentType: 'image/png', cid: `ticket_qr_${ticketId}` }],
    };
    transporter.sendMail(mailOptions, (err2) => { if (err2) console.error('Approval email error', err2); });

    return res.status(200).json({ success: true, data: { order: reg, ticketId } });
  } catch (err) {
    console.error('updateOrderStatus error', err);
    return res.status(400).json({ success: false, error: err.message });
  }
}

// GET /api/event-registrations/:orderId — participant's own order
async function getOrderById(req, res) {
  try {
    const participant = req.participant;
    if (!participant) return res.status(401).json({ success: false, error: 'Participant required' });

    const EventRegistration = require('../models/EventRegistration');
    const reg = await EventRegistration.findById(req.params.orderId).populate('eventId');
    if (!reg) return res.status(404).json({ success: false, error: 'Order not found' });
    if (String(reg.participantId) !== String(participant._id))
      return res.status(403).json({ success: false, error: 'Forbidden' });

    const plain = reg.toObject();
    if (reg.payment_status === 'successful' && reg.ticketQr) {
      plain.ticketQrBase64 = reg.ticketQr.toString('base64');
    }
    delete plain.ticketQr; // strip buffer from response

    return res.status(200).json({ success: true, data: plain });
  } catch (err) {
    console.error('getOrderById error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/events/organizer-payments?status=...  (all merchandise orders across organizer's events)
async function getOrganizerPayments(req, res) {
  try {
    const organizerId = req.organizer && req.organizer._id;
    if (!organizerId) return res.status(401).json({ success: false, error: 'Organizer required' });

    // find all merchandise events owned by this organizer
    const events = await Event.find({ organizer_id: organizerId, type: 'merchandise' }).select('_id name merchandise');
    const eventIds = events.map(e => e._id);

    const EventRegistration = require('../models/EventRegistration');
    const filter = { eventId: { $in: eventIds }, payment_status: { $ne: null } };
    if (req.query.status) filter.payment_status = req.query.status;

    const orders = await EventRegistration.find(filter)
      .populate({ path: 'participantId', select: 'first_name last_name email' })
      .populate({ path: 'eventId', select: 'name merchandise' })
      .sort({ createdAt: -1 })
      .select('-ticketQr');  // strip large buffer

    return res.status(200).json({ success: true, data: orders });
  } catch (err) {
    console.error('getOrganizerPayments error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Attendance / QR scan flow
// ──────────────────────────────────────────────────────────────────────────────

// Helper: verify organizer owns event, returns { ev, error, status }
async function _verifyOrganizerOwnsEvent(req) {
  const ev = await Event.findById(req.params.id);
  if (!ev) return { ev: null, error: 'Event not found', status: 404 };
  const oid = req.organizer && req.organizer._id;
  if (!oid || String(ev.organizer_id) !== String(oid))
    return { ev: null, error: 'Forbidden: not event owner', status: 403 };
  return { ev, error: null, status: 200 };
}

// POST /api/events/:id/scan  — body { ticketId, method? }
async function scanTicket(req, res) {
  try {
    const { ev, error, status } = await _verifyOrganizerOwnsEvent(req);
    if (error) return res.status(status).json({ success: false, error });

    const { ticketId, method = 'camera' } = req.body;
    if (!ticketId) return res.status(400).json({ success: false, error: 'ticketId required' });

    const EventRegistration = require('../models/EventRegistration');
    const reg = await EventRegistration.findOne({ eventId: ev._id, ticketId })
      .populate({ path: 'participantId', select: 'first_name last_name email' });

    if (!reg) return res.status(404).json({ success: false, result: 'invalid', error: 'Ticket not found for this event' });

    // For merchandise events, must have successful payment
    const evType = (ev.type || '').toLowerCase();
    if (evType === 'merchandise' && reg.payment_status !== 'successful')
      return res.status(403).json({ success: false, result: 'invalid', error: 'Payment not approved for this ticket' });

    // Check cancelled
    if (reg.status === 'CANCELLED')
      return res.status(400).json({ success: false, result: 'invalid', error: 'Registration is cancelled' });

    const organizer = req.organizer;
    const scanEntry = {
      scanner: organizer._id,
      name: organizer.name || organizer.email || String(organizer._id),
      method: ['camera', 'upload', 'manual'].includes(method) ? method : 'camera',
      ip: req.ip || '',
      ts: new Date(),
    };

    // Duplicate check
    if (reg.attended) {
      // Still log the scan attempt in history
      reg.scanHistory.push({ ...scanEntry, notes: 'duplicate scan attempt' });
      await reg.save();

      const p = reg.participantId || {};
      return res.status(200).json({
        success: true,
        result: 'duplicate',
        message: 'Already scanned',
        registration: {
          _id: reg._id,
          ticketId: reg.ticketId,
          participant: { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), email: p.email },
          firstScanAt: reg.firstScanAt,
          scannedBy: reg.scannedBy,
        },
      });
    }

    // Mark attended atomically
    reg.attended = true;
    reg.firstScanAt = scanEntry.ts;
    reg.scannedBy = organizer._id;
    reg.scanMethod = scanEntry.method;
    reg.scanHistory.push(scanEntry);
    await reg.save();

    const p = reg.participantId || {};
    return res.status(200).json({
      success: true,
      result: 'scanned',
      registration: {
        _id: reg._id,
        ticketId: reg.ticketId,
        participant: { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), email: p.email },
        firstScanAt: reg.firstScanAt,
        scannedBy: reg.scannedBy,
      },
    });
  } catch (err) {
    console.error('scanTicket error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/events/:id/attendance?search=&filter=
async function getEventAttendance(req, res) {
  try {
    const { ev, error, status } = await _verifyOrganizerOwnsEvent(req);
    if (error) return res.status(status).json({ success: false, error });

    const EventRegistration = require('../models/EventRegistration');
    const query = { eventId: ev._id, status: { $ne: 'CANCELLED' } };

    // For merchandise events only show successful payments
    if ((ev.type || '').toLowerCase() === 'merchandise') {
      query.payment_status = 'successful';
    }

    const regs = await EventRegistration.find(query)
      .populate({ path: 'participantId', select: 'first_name last_name email' })
      .populate({ path: 'scannedBy', select: 'name email' })
      .select('-ticketQr')
      .sort({ createdAt: -1 });

    const total = regs.length;
    const scanned = regs.filter(r => r.attended).length;

    // apply search filter
    let items = regs;
    const sq = (req.query.search || '').trim().toLowerCase();
    if (sq) {
      items = items.filter(r => {
        const p = r.participantId || {};
        return (p.first_name || '').toLowerCase().includes(sq)
          || (p.last_name || '').toLowerCase().includes(sq)
          || (p.email || '').toLowerCase().includes(sq)
          || (r.ticketId || '').toLowerCase().includes(sq);
      });
    }

    // filter by attended/not
    if (req.query.filter === 'scanned') items = items.filter(r => r.attended);
    else if (req.query.filter === 'not_scanned') items = items.filter(r => !r.attended);

    return res.status(200).json({
      success: true,
      data: {
        event: { _id: ev._id, name: ev.name, type: ev.type, status: ev.status },
        counts: { total, scanned, remaining: total - scanned },
        registrations: items.map(r => {
          const p = r.participantId || {};
          return {
            _id: r._id,
            ticketId: r.ticketId,
            participant: { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), email: p.email || '' },
            attended: r.attended,
            firstScanAt: r.firstScanAt,
            scannedBy: r.scannedBy,
            scanMethod: r.scanMethod,
            scanHistory: r.scanHistory,
            manualOverrides: r.manualOverrides,
            createdAt: r.createdAt,
          };
        }),
      },
    });
  } catch (err) {
    console.error('getEventAttendance error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/event-registrations/:regId/manual-attendance  { action, reason }
async function manualAttendance(req, res) {
  try {
    const organizer = req.organizer;
    if (!organizer) return res.status(401).json({ success: false, error: 'Organizer required' });

    const { action, reason } = req.body;
    if (!['set', 'unset'].includes(action))
      return res.status(400).json({ success: false, error: 'action must be set or unset' });
    if (!reason || !reason.trim())
      return res.status(400).json({ success: false, error: 'reason is required for manual override' });

    const EventRegistration = require('../models/EventRegistration');
    const reg = await EventRegistration.findById(req.params.regId);
    if (!reg) return res.status(404).json({ success: false, error: 'Registration not found' });

    // verify organizer owns event
    const ev = await Event.findById(reg.eventId);
    if (!ev) return res.status(404).json({ success: false, error: 'Event not found' });
    if (String(ev.organizer_id) !== String(organizer._id))
      return res.status(403).json({ success: false, error: 'Forbidden: not event owner' });

    const now = new Date();
    const orgName = organizer.name || organizer.email || String(organizer._id);

    if (action === 'set') {
      reg.attended = true;
      if (!reg.firstScanAt) {
        reg.firstScanAt = now;
        reg.scannedBy = organizer._id;
        reg.scanMethod = 'manual';
      }
      reg.scanHistory.push({
        scanner: organizer._id,
        name: orgName,
        method: 'manual',
        ip: req.ip || '',
        ts: now,
        notes: `Manual set: ${reason.trim()}`,
      });
    } else {
      reg.attended = false;
      reg.scanHistory.push({
        scanner: organizer._id,
        name: orgName,
        method: 'manual',
        ip: req.ip || '',
        ts: now,
        notes: `Manual unset: ${reason.trim()}`,
      });
    }

    reg.manualOverrides.push({
      by: organizer._id,
      name: orgName,
      ts: now,
      action,
      reason: reason.trim(),
    });

    await reg.save();

    return res.status(200).json({ success: true, data: { _id: reg._id, attended: reg.attended, manualOverrides: reg.manualOverrides } });
  } catch (err) {
    console.error('manualAttendance error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/events/:id/attendance/export?format=csv
async function exportAttendanceCsv(req, res) {
  try {
    const { ev, error, status } = await _verifyOrganizerOwnsEvent(req);
    if (error) return res.status(status).json({ success: false, error });

    const EventRegistration = require('../models/EventRegistration');
    const query = { eventId: ev._id, status: { $ne: 'CANCELLED' } };
    if ((ev.type || '').toLowerCase() === 'merchandise') query.payment_status = 'successful';

    const regs = await EventRegistration.find(query)
      .populate({ path: 'participantId', select: 'first_name last_name email' })
      .populate({ path: 'scannedBy', select: 'name email' })
      .select('-ticketQr')
      .sort({ createdAt: -1 });

    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('\n') || s.includes('"')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };

    const header = ['EventId','EventName','ParticipantName','ParticipantEmail','TicketId','PaymentStatus',
      'Attended','FirstScanAt','ScannedByName','ScanMethod','ManualOverrides','ScanHistory'];

    const rows = [header.join(',')];
    for (const r of regs) {
      const p = r.participantId || {};
      const scannerName = r.scannedBy ? (r.scannedBy.name || r.scannedBy.email || '') : '';
      const overrides = (r.manualOverrides || []).map(o => `${o.action}|${o.reason}|${o.name}|${o.ts ? new Date(o.ts).toISOString() : ''}`).join('; ');
      const history = (r.scanHistory || []).map(s => `${s.method}|${s.name}|${s.ts ? new Date(s.ts).toISOString() : ''}|${s.notes || ''}`).join('; ');

      rows.push([
        esc(String(ev._id)),
        esc(ev.name),
        esc(`${p.first_name || ''} ${p.last_name || ''}`.trim()),
        esc(p.email || ''),
        esc(r.ticketId || ''),
        esc(r.payment_status || ''),
        esc(r.attended ? 'Yes' : 'No'),
        esc(r.firstScanAt ? new Date(r.firstScanAt).toISOString() : ''),
        esc(scannerName),
        esc(r.scanMethod || ''),
        esc(overrides),
        esc(history),
      ].join(','));
    }

    const csv = rows.join('\n');
    const filename = `${(ev.name || 'event').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_attendance.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error('exportAttendanceCsv error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
