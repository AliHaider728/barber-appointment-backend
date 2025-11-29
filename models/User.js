import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  supabaseId: { 
    type: String, 
    unique: true, 
    sparse: true,  // Allow null values (legacy support)
    required: false
  },
  email: { 
    type: String, 
    unique: true, 
    required: true,
    lowercase: true,
    trim: true
  },
  fullName: { 
    type: String,
    default: 'User'
  },
  phone: { 
    type: String,
    default: null
  },
  role: { 
    type: String, 
    enum: ['user'],  // Only 'user' for this model
    default: 'user' 
  },
  profileImage: {
    type: String,
    default: null
  },
  address: {
    type: String,
    default: null
  },
  city: {
    type: String,
    default: null
  }
}, { timestamps: true });

// Index for faster lookups
userSchema.index({ supabaseId: 1 });
userSchema.index({ email: 1 });

export default mongoose.model('User', userSchema);