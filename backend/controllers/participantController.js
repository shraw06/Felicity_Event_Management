const Participant = require('../models/Participant');
const jwt = require('jsonwebtoken');

const signToken = (participantId) => {
  return jwt.sign({ id: participantId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d', // Token expires in 1 day
  });
};
// @desc    Get all participants
// @route   GET /api/participants
const getParticipants = async (req, res) => {
  try {
    const participants = await Participant.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: participants.length,
      data: participants,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
// @desc    Get single participant
// @route   GET /api/participants/:email
const getParticipant = async (req, res) => {
  try {
    const participant = await Participant.findOne({ email: req.params.email });

    if (!participant) {
      return res.status(404).json({
        success: false,
        error: 'Participant not found',
      });
    }
    
    res.status(200).json({
      success: true,
      data: participant,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Create participant
// @route   POST /api/participants
const createParticipant = async (req, res) => {
  try {
    const participant = await Participant.create(req.body);

    const token = signToken(participant._id);
    res.status(201).json({
      success: true,
      data: participant,
      token,
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};


// @desc    Update participant
// @route   PUT /api/participants/:email
const updateParticipant = async (req, res) => {
  try {
    const { email } = req.params;

    // If password is being updated, load and save so pre-save hook runs
    if (req.body.password) {
      const participant = await Participant.findOne({ email });
      if (!participant) {
        return res.status(404).json({ success: false, error: 'Participant not found' });
      }

      // assign other updatable fields
      const updatable = ['first_name', 'last_name', 'iiit_participant', 'college_name', 'contact_number'];
      updatable.forEach(field => {
        if (req.body[field] !== undefined) participant[field] = req.body[field];
      });

      participant.password = req.body.password; // will be hashed in pre-save
      await participant.save();

      return res.status(200).json({ success: true, data: participant });
    }

    const participant = await Participant.findOneAndUpdate(
      { email },
      req.body,
      { new: true, runValidators: true }
    );

    if (!participant) {
      return res.status(404).json({ success: false, error: 'Participant not found' });
    }

    res.status(200).json({ success: true, data: participant });
  } catch (error) {
    console.log(error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Login participant
// @route   POST /api/participants/login
const loginParticipant = async (req, res) => {
  try {
    const { email, password } = req.body;

    // find participant and include password for comparison
    const participant = await Participant.findOne({ email }).select('+password');

    if (!participant) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const isMatch = await participant.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = signToken(participant._id);

    // Do not return password (participant has select: false by default)
    const safeParticipant = await Participant.findById(participant._id);

    res.status(200).json({
      success: true,
      data: safeParticipant,
      token,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Delete participant
// @route   DELETE /api/participants/:email
const deleteParticipant = async (req, res) => {
  try {
    const participant = await Participant.findOneAndDelete({ email: req.params.email });

    if (!participant) {
      return res.status(404).json({
        success: false,
        error: 'Participant not found',
      });
    }
    
    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  getParticipants,
  getParticipant,
  createParticipant,
  updateParticipant,
  deleteParticipant,
  loginParticipant,
};