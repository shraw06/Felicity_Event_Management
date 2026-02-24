const Participant = require('../models/Participant');
const jwt = require('jsonwebtoken');

const signToken = (participantId) => {
  return jwt.sign({ id: participantId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d', 
  });
};

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



const updateParticipant = async (req, res) => {
  try {
    const { email } = req.params;

    if (req.body.password) {
      const participant = await Participant.findOne({ email });
      if (!participant) {
        return res.status(404).json({ success: false, error: 'Participant not found' });
      }

      
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


const loginParticipant = async (req, res) => {
  try {
    const { email, password } = req.body;

    const participant = await Participant.findOne({ email }).select('+password');

    if (!participant) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const isMatch = await participant.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = signToken(participant._id);

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