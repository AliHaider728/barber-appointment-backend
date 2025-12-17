// backend/models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  googleId: { 
    type: String, 
    unique: true, 
    sparse: true,  // Allow null values for non-Google users
    required: false
  },
  email: { 
    type: String, 
    unique: true, 
    required: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: function() {
      // Password required only if NOT Google sign-in
      return !this.googleId;
    }
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
    enum: ['user'],
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
  },
  emailVerified: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Index for faster lookups
userSchema.index({ googleId: 1 });
userSchema.index({ email: 1 });

export default mongoose.model('User', userSchema);