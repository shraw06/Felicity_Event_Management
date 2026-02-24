const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const participantSchema = new mongoose.Schema(
  {
    first_name: {
      type: String,
      required: [true, 'Please add a first name'],
      trim: true,
    },
    last_name: {
      type: String,
      required: [true, 'Please add a last name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      trim: true,
      unique: true,
    },
    iiit_participant: {
      type: Boolean,
      required: [true, 'Please specify if the participant is from IIIT'],
      default: false,
    },
    college_name: {
      type: String,
      trim: true,
      default: 'IIIT Hyderabad',
    },
    contact_number: {
      type: String,
      trim: true,
    },
    preferences: {
      areas: {
        type: [String],
        enum: [
          'Arts & Performance',
          'Technology & Innovation',
          'Gaming & Esports',
          'Knowledge & Speaking',
          'Creative & Design',
          'Sports & Fitness',
          'Career & Workshops',
          'Social & Fun Events'
        ],
        default: [],
      },
      following: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Organizer' }],
        default: [],
      },
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      select: false, 
    }
  },
  {
    timestamps: true, 
  }
);

participantSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (err) {
    return next(err);
  }
});

participantSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
}

module.exports = mongoose.model('Participant', participantSchema);