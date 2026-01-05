// models/Admin.js
import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    unique: true,
    index: true
  },
  password: String, // will be set after verification
  fullName: {
    type: String,
    required: [true, 'Full name is required']
  },
  role: {
    type: String,
    enum: ['main_admin', 'branch_admin'],
    default: null // set after verification
  },
  isActive: {
    type: Boolean,
    default: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationOTP: String,
  otpExpiry: Date,
  assignedBranch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    default: null
  },
  permissions: {
    type: [String],
    default: []
  }
}, { timestamps: true });

// Auto-set permissions when role is assigned
adminSchema.pre('save', function(next) {
  if (this.isModified('role') && this.isEmailVerified && this.role) {
    if (this.role === 'branch_admin') {
      this.permissions = [
        'manage_barbers',
        'manage_appointments',
        'manage_shifts',
        'manage_services',
        'manage_leaves'
      ];
    } else if (this.role === 'main_admin') {
      this.permissions = [
        'manage_barbers',
        'manage_branches',
        'manage_services',
        'manage_appointments',
        'manage_admins',
        'manage_leaves',
        'manage_shifts',
        'view_analytics'
      ];
    }
  }
  next();
});

export default mongoose.model('Admin', adminSchema);