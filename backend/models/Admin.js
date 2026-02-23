const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema(
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
    password: {
      type: String,
      required: [true, 'Please add a password'],
      select: false, // we dont want it ot be returned in queries
    }
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

adminSchema.pre('save', async function (next) {
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

adminSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
}

module.exports = mongoose.model('Admin', adminSchema);