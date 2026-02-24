const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');

const signToken = (adminId) => {
  return jwt.sign({ id: adminId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d', // Token expires in 1 day
  });
}


const getAdmin = async (req, res) => {
  try {
    const admin = await Admin.findOne({ email: req.params.email });

    if (!admin) {
      return res.status(404).json({
        success: false,
        error: 'Admin not found',
      });
    }
    
    res.status(200).json({
      success: true,
      data: admin,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};


const loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  try {
        const admin = await Admin.findOne({ email }).select('+password');

    if (!admin) {
      return res.status(404).json({
        success: false,
        error: 'Admin not found',
      });
    }

    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    const token = signToken(admin._id);
    res.status(200).json({
      success: true,
      token,
      data: admin,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  getAdmin,
  loginAdmin,
};