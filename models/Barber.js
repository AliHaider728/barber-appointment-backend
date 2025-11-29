import mongoose from 'mongoose';

const barberSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
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
  }
}, { timestamps: true });

// Index for faster email lookups
barberSchema.index({ email: 1 });

export default mongoose.model('Barber', barberSchema);