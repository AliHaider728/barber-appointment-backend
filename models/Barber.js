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
  password: {
    type: String,
    required: true
  },
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
    default: true
  }
}, { timestamps: true });

// Indexes for faster lookups
barberSchema.index({ email: 1 });
barberSchema.index({ branch: 1 });

export default mongoose.model('Barber', barberSchema);