const jwt = require('jsonwebtoken');
const Organizer = require('../models/Organizer');
const Admin = require('../models/Admin');
const Participant = require('../models/Participant');

const protectOrganizer = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, error: 'Not authorized, token missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const organizer = await Organizer.findById(decoded.id).select('-password');
    if (!organizer) {
      return res.status(401).json({ success: false, error: 'Organizer not found for token' });
    }

    req.organizer = organizer;
    next();
  } catch (err) {
    console.error('protectOrganizer error', err.message || err);
    return res.status(401).json({ success: false, error: 'Not authorized' });
  }
};

const protectParticipant = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, error: 'Not authorized, token missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const participant = await Participant.findById(decoded.id).select('-password');
    if (!participant) {
      return res.status(401).json({ success: false, error: 'Participant not found for token' });
    }

    req.participant = participant;
    next();
  } catch (err) {
    console.error('protectParticipant error', err.message || err);
    return res.status(401).json({ success: false, error: 'Not authorized' });
  }
};

const protectAdmin = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, error: 'Not authorized, token missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin) {
      return res.status(401).json({ success: false, error: 'Admin not found for token' });
    }

    req.admin = admin;
    next();
  } catch (err) {
    console.error('protectAdmin error', err.message || err);
    return res.status(401).json({ success: false, error: 'Not authorized' });
  }
};

module.exports = {
  protectOrganizer,
  protectParticipant,
  protectAdmin,
};
