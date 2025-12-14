import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  email: { 
    type: String, 
    unique: true, 
    required: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
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

adminSchema.index({ email: 1 });

export default mongoose.model('Admin', adminSchema);