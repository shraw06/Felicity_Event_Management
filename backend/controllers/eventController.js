const { get } = require('mongoose');
const Event = require('../models/Event');
const Organizer = require('../models/Organizer');
const { sendDiscordNotification } = require('../utils/discord');

const createEvent = async (req, res) => {
  try {
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

const getEvent = async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ success: false, error: 'Event not found' });

    const EventRegistration = require('../models/EventRegistration');
    const registrationCount = await EventRegistration.countDocuments({ eventId: ev._id });

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
      console.error('Error checking participant registration', e && e.message);
    }

    res.status(200).json({ success: true, data: { event: ev, registrationCount, participantRegistered, participantRegistrationId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const updateEvent = async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ success: false, error: 'Event not found' });

    const organizerId = req.organizer && req.organizer._id;
    if (!organizerId || String(ev.organizer_id) !== String(organizerId)) {
      return res.status(403).json({ success: false, error: 'Forbidden: not event owner' });
    }

    const incoming = req.body || {};

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
     
      const allowed = ['name','description','type','non_iiit_eligibility','registration_deadline','event_start_date','event_end_date','registration_limit','registration_fee','event_tags','formFields', 'merchandise', 'status'];
      allowed.forEach((f) => { if (Object.prototype.hasOwnProperty.call(incoming, f)) ev[f] = incoming[f]; });
      
      await ev.save();

      if (status === 'draft' && ev.status === 'published') {
        try {

          let organizer = req.organizer;
          if (!organizer.discordWebhook) {
             organizer = await Organizer.findById(organizer._id);
          }

          if (organizer && organizer.discordWebhook) {
            await sendDiscordNotification(organizer.discordWebhook, ev);
          }
        } catch (discordErr) {
          console.error('Failed to send Discord notification', discordErr);
        }
      }

      return res.status(200).json({ success: true, data: ev });
    }

    if (status === 'published') {
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
      if (incoming.status) {
        const allowedStatus = ['closed','ongoing','completed'];
        if (!allowedStatus.includes(incoming.status)) return res.status(400).json({ success: false, error: 'Invalid status transition' });
        updates.status = incoming.status;
      }

      const forbidden = ['name','type','formFields','organizer_id'];
      for (const f of forbidden) if (Object.prototype.hasOwnProperty.call(incoming, f)) return res.status(403).json({ success: false, error: 'Cannot modify locked field: '+f });

      Object.assign(ev, updates);
      await ev.save();
      return res.status(200).json({ success: true, data: ev });
    }

    if (['ongoing','completed','closed'].includes(status)) {
      if (incoming.status) {
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

    res.status(200).json({ success: true, data: agg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const registerForEvent = async (req, res) => {
  try {
    const participant = req.participant; 
    if (!participant) return res.status(401).json({ success: false, error: 'Participant required' });

    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ success: false, error: 'Event not found' });

    const eventType = (ev.type || '').toLowerCase();
    if (eventType !== 'normal') return res.status(400).json({ success: false, error: 'Event is not a normal event' });

    const now = new Date();
    if (ev.registration_deadline && new Date(ev.registration_deadline) < now) return res.status(400).json({ success: false, error: 'Registration deadline passed' });
    if (ev.status !== 'published' && ev.status !== 'ongoing') return res.status(400).json({ success: false, error: 'Event not open for registration' });

    if (ev.non_iiit_eligibility === false) {
      if (!participant.iiit_participant) {
        return res.status(403).json({ success: false, error: 'You are not eligible to register for this IIIT-only event' });
      }
    }

    const EventRegistration = require('../models/EventRegistration');


    // ── Validate & collect custom form responses ─────────────────────────────
    let formResponses = undefined;
    const formFields = Array.isArray(ev.formFields) ? ev.formFields : [];
    if (formFields.length > 0) {
      const incoming = req.body && req.body.formResponses ? req.body.formResponses : {};
      if (!incoming || typeof incoming !== 'object') {
        return res.status(400).json({ success: false, error: 'Custom registration form responses are required' });
      }
      formResponses = {};
      for (const field of formFields) {
        const val = incoming[field.name];
        if (field.type === 'checkbox') {
          formResponses[field.name] = val !== undefined ? val : false;
        } else {
          formResponses[field.name] = val !== undefined && val !== null && val !== '' ? val : '';
        }
      }
    }

    if (typeof ev.registration_limit === 'number' && ev.registration_limit > 0) {
      const cnt = await EventRegistration.countDocuments({ eventId: ev._id, status: { $ne: 'CANCELLED' } });
      if (cnt >= ev.registration_limit) return res.status(400).json({ success: false, error: 'Registration limit reached' });
    }

    let reg = await EventRegistration.findOne({ eventId: ev._id, participantId: participant._id });
    if (reg) {
      if (reg.status === 'CANCELLED') {
        if (ev.registration_deadline && new Date(ev.registration_deadline) < now) {
          return res.status(400).json({ success: false, error: 'Registration deadline passed' });
        }
        reg.status = 'UPCOMING';
        if (formResponses) reg.formResponses = formResponses;
        await reg.save();
      } else {
        return res.status(200).json({ success: true, data: { registration: reg, message: 'Already registered' } });
      }
    } else {
      
      if (ev.registration_deadline && new Date(ev.registration_deadline) < now) {
        return res.status(400).json({ success: false, error: 'Registration deadline passed' });
      }
      const createPayload = { participantId: participant._id, eventId: ev._id };
      if (formResponses) createPayload.formResponses = formResponses;
      reg = await EventRegistration.create(createPayload);
    }

    const { v4: uuidv4 } = require('uuid');
    const QRCode = require('qrcode');
    const ticketId = uuidv4();
  const qrData = await QRCode.toDataURL(JSON.stringify({ ticketId, eventId: String(ev._id), participantId: String(participant._id) }));
  const qrBase64 = qrData.split(',')[1];
  const qrBuffer = Buffer.from(qrBase64, 'base64');

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

    try {
      reg.ticketId = ticketId;
      reg.ticketQr = qrBuffer;
      reg.ticketQrContentType = 'image/png';
      await reg.save();
    } catch (e) {
      console.error('Failed to save ticket info on registration', e && e.message);
    }

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) console.error('Failed to send registration email', err);
      else console.log('Registration email sent', info && info.messageId);
    });

    const regOut = reg.toObject();
    if (regOut.formResponses && !(regOut.formResponses instanceof Map)) {
      // toObject() already converted the Mongoose Map to a plain object — nothing to do
    } else if (reg.formResponses instanceof Map) {
      regOut.formResponses = Object.fromEntries(reg.formResponses);
    }
    return res.status(201).json({ success: true, data: { registration: regOut, ticketId } });
  } catch (err) {
    console.error('registerForEvent error', err);
    return res.status(400).json({ success: false, error: err.message });
  }
};

const purchaseMerchandise = async (req, res) => {
  try {
    const participant = req.participant;
    if (!participant) return res.status(401).json({ success: false, error: 'Participant required' });

    const eventId = req.params.id;
    const { itemId, quantity = 1 } = req.body; 
    if (!itemId) return res.status(400).json({ success: false, error: 'itemId required' });

    const ev = await Event.findById(eventId);
    if (!ev) return res.status(404).json({ success: false, error: 'Event not found' });

    const eventType = (ev.type || '').toLowerCase();
    if (eventType !== 'merchandise') return res.status(400).json({ success: false, error: 'Event is not merchandise type' });

    if (ev.status !== 'published' && ev.status !== 'ongoing') return res.status(400).json({ success: false, error: 'Merchandise sales not open' });
    const now = new Date();
    if (ev.registration_deadline && new Date(ev.registration_deadline) < now) return res.status(400).json({ success: false, error: 'Sales deadline passed' });

    if (ev.non_iiit_eligibility === false) {
      if (!participant.iiit_participant) {
        return res.status(403).json({ success: false, error: 'You are not eligible to purchase for this IIIT-only event' });
      }
    }

    const updated = await Event.findOneAndUpdate(
      { _id: eventId, 'merchandise._id': itemId, 'merchandise.stockQuantity': { $gte: quantity } },
      { $inc: { 'merchandise.$.stockQuantity': -quantity } },
      { new: true }
    );

    if (!updated) return res.status(400).json({ success: false, error: 'Item out of stock or insufficient stock' });

  const EventRegistration = require('../models/EventRegistration');
  const reg = await EventRegistration.create({ participantId: participant._id, eventId: ev._id });

    const { v4: uuidv4 } = require('uuid');
    const QRCode = require('qrcode');
    const ticketId = uuidv4();
  const qrData = await QRCode.toDataURL(JSON.stringify({ ticketId, eventId: String(ev._id), participantId: String(participant._id), itemId }));
  const qrBase64 = qrData.split(',')[1];
  const qrBuffer = Buffer.from(qrBase64, 'base64');

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

async function cancelRegistration(req, res) {
  try {
    const participant = req.participant;
    if (!participant) return res.status(401).json({ success: false, error: 'Participant required' });

    const eventId = req.params.id;
    const EventRegistration = require('../models/EventRegistration');
    const reg = await EventRegistration.findOneAndUpdate(
      { eventId, participantId: participant._id },
      { $set: { status: 'CANCELLED', ticketId: null, ticketQr: null, ticketQrContentType: null } },
      { new: true }
    );
    if (!reg) return res.status(404).json({ success: false, error: 'Registration not found' });



    return res.status(200).json({ success: true, data: { message: 'Registration cancelled', registration: reg } });
  } catch (err) {
    console.error('cancelRegistration error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function getParticipantRegistrations(req, res) {
  try {
    const participant = req.participant;
    if (!participant) return res.status(401).json({ success: false, error: 'Participant required' });

    const EventRegistration = require('../models/EventRegistration');
    const upcomingOnly = (req.query && (req.query.upcoming === 'true' || req.query.upcoming === '1'));

    const query = { participantId: participant._id };
    if (upcomingOnly) query.status = 'UPCOMING';

    const regs = await EventRegistration.find(query).populate({ path: 'eventId' }).sort({ createdAt: -1 }).exec();

    const now = new Date();
    let items = regs.map(r => ({ registration: r, event: r.eventId })).filter(({ event }) => !!event);

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

async function getRegistrationTicket(req, res) {
  try {
    const participant = req.participant;
    if (!participant) return res.status(401).json({ success: false, error: 'Participant required' });

    const regId = req.params.regId;
    const EventRegistration = require('../models/EventRegistration');
    const reg = await EventRegistration.findById(regId).populate('eventId');
    if (!reg) return res.status(404).json({ success: false, error: 'Registration not found' });
    if (String(reg.participantId) !== String(participant._id)) return res.status(403).json({ success: false, error: 'Forbidden' });

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

const getRegistrationsForEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const ev = await Event.findById(eventId);
    if (!ev) return res.status(404).json({ success: false, error: 'Event not found' });

    const organizerId = req.organizer && req.organizer._id;
    if (!organizerId || String(ev.organizer_id) !== String(organizerId)) {
      return res.status(403).json({ success: false, error: 'Forbidden: not event owner' });
    }

    const EventRegistration = require('../models/EventRegistration');
    const regs = await EventRegistration.find({ eventId }).populate({ path: 'participantId', select: 'first_name last_name email' }).sort({ createdAt: -1 }).exec();

    const totalRegistrations = regs.length;
    const activeRegistrations = regs.filter(r => r.status !== 'CANCELLED').length;
    const registrationFee = Number(ev.registration_fee) || 0;
    const estimatedRevenue = registrationFee * activeRegistrations; // merchandise sales not tracked here

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

    if (ev.non_iiit_eligibility === false && !participant.iiit_participant)
      return res.status(403).json({ success: false, error: 'IIIT-only event' });

    const EventRegistration = require('../models/EventRegistration');

    if (typeof ev.registration_limit === 'number' && ev.registration_limit > 0) {
      const cnt = await EventRegistration.countDocuments({ eventId: ev._id, status: { $ne: 'CANCELLED' } });
      if (cnt >= ev.registration_limit)
        return res.status(400).json({ success: false, error: 'Registration limit reached' });
    }

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

    if (status === 'rejected') {
      reg.payment_status = 'rejected';
      reg.rejectionReason = reason || '';
      await reg.save();
      return res.status(200).json({ success: true, data: { order: reg } });
    }

    if (!itemId) return res.status(400).json({ success: false, error: 'itemId required for approval' });

    const updated = await Event.findOneAndUpdate(
      { _id: ev._id, 'merchandise._id': itemId, 'merchandise.stockQuantity': { $gte: quantity } },
      { $inc: { 'merchandise.$.stockQuantity': -quantity } },
      { new: true },
    );
    if (!updated) return res.status(409).json({ success: false, error: 'Item out of stock or insufficient stock' });

    reg.payment_status = 'successful';
    reg.rejectionReason = null;

    const { v4: uuidv4 } = require('uuid');
    const QRCode = require('qrcode');
    const ticketId = uuidv4();
    const participant = reg.participantId; 
    const qrData = await QRCode.toDataURL(
      JSON.stringify({ ticketId, eventId: String(ev._id), participantId: String(participant._id), itemId }),
    );
    const qrBase64 = qrData.split(',')[1];
    const qrBuffer = Buffer.from(qrBase64, 'base64');

    reg.ticketId = ticketId;
    reg.ticketQr = qrBuffer;
    reg.ticketQrContentType = 'image/png';
    await reg.save();

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
    delete plain.ticketQr; 

    return res.status(200).json({ success: true, data: plain });
  } catch (err) {
    console.error('getOrderById error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function getOrganizerPayments(req, res) {
  try {
    const organizerId = req.organizer && req.organizer._id;
    if (!organizerId) return res.status(401).json({ success: false, error: 'Organizer required' });

    const events = await Event.find({ organizer_id: organizerId, type: 'merchandise' }).select('_id name merchandise');
    const eventIds = events.map(e => e._id);

    const EventRegistration = require('../models/EventRegistration');
    const filter = { eventId: { $in: eventIds }, payment_status: { $ne: null } };
    if (req.query.status) filter.payment_status = req.query.status;

    const orders = await EventRegistration.find(filter)
      .populate({ path: 'participantId', select: 'first_name last_name email' })
      .populate({ path: 'eventId', select: 'name merchandise' })
      .sort({ createdAt: -1 })
      .select('-ticketQr');  

    return res.status(200).json({ success: true, data: orders });
  } catch (err) {
    console.error('getOrganizerPayments error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}


async function _verifyOrganizerOwnsEvent(req) {
  const ev = await Event.findById(req.params.id);
  if (!ev) return { ev: null, error: 'Event not found', status: 404 };
  const oid = req.organizer && req.organizer._id;
  if (!oid || String(ev.organizer_id) !== String(oid))
    return { ev: null, error: 'Forbidden: not event owner', status: 403 };
  return { ev, error: null, status: 200 };
}

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

    const evType = (ev.type || '').toLowerCase();
    if (evType === 'merchandise' && reg.payment_status !== 'successful')
      return res.status(403).json({ success: false, result: 'invalid', error: 'Payment not approved for this ticket' });

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

    if (reg.attended) {
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

async function getEventAttendance(req, res) {
  try {
    const { ev, error, status } = await _verifyOrganizerOwnsEvent(req);
    if (error) return res.status(status).json({ success: false, error });

    const EventRegistration = require('../models/EventRegistration');
    const query = { eventId: ev._id, status: { $ne: 'CANCELLED' } };

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
