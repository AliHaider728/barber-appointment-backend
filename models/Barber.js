// models/Barber.js (updated with verification fields like Admin)
import mongoose from 'mongoose';

const barberSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
  },
  password: String, // will be set after verification
  experienceYears: { 
    type: Number, 
    required: true 
  },
  gender: { 
    type: String, 
    enum: ['male', 'female'], 
    required: true 
  },
  specialties: { 
    type: [String], 
    required: true 
  },
  branch: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Branch', 
    required: true 
  },
  role: {
    type: String,
    default: 'barber'
  },
  stripeAccountId: {
    type: String,
    sparse: true  
  },
  isActive: {
    type: Boolean,
    default: false  // Starts as false until verified and setup
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationOTP: String,
  otpExpiry: Date
}, { timestamps: true });

// Indexes for faster lookups
barberSchema.index({ email: 1 });
barberSchema.index({ branch: 1 });

export default mongoose.model('Barber', barberSchema);