// models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  phone: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  password: String,
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  isEmailVerified: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: false },
  emailVerificationOTP: String,
  phoneVerificationOTP: String,
  otpExpiry: Date,
  profileImage: String,
  appointments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('User', userSchema);