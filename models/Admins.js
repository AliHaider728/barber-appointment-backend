import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  supabaseId: { 
    type: String, 
    unique: true, 
    required: true 
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
    required: true
  },
  role: {
    type: String,
    default: 'admin'
  },
  permissions: {
    type: [String],
    default: ['manage_barbers', 'manage_branches', 'manage_services', 'manage_appointments', 'manage_admins']
  }
}, { timestamps: true });

// Index for faster lookups
adminSchema.index({ supabaseId: 1 });
adminSchema.index({ email: 1 });

export default mongoose.model('Admin', adminSchema);