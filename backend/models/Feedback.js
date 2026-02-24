const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    participantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Participant',
      required: true,
      select: false, 
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      maxlength: 2000,
      default: '',
    },
  },
  { timestamps: true }
);


feedbackSchema.index({ eventId: 1, participantId: 1 }, { unique: true });


feedbackSchema.index({ eventId: 1, rating: 1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
