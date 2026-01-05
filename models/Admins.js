import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    unique: true,
    sparse: true,
    index: true
  },
  password: {
    type: String,
    required: [function() { return this.isEmailVerified; }, 'Password is required for verified admins']
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required']
  },
  role: {
    type: String,
    enum: ['main_admin', 'branch_admin'],
    required: [function() { return this.isEmailVerified; }, 'Role is required for verified admins']
  },
  isActive: {
    type: Boolean,
    default: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationOTP: {
    type: String
  },
  otpExpiry: {
    type: Date
  },
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

// Drop existing index and recreate
adminSchema.pre('save', async function(next) {
  try {
    // Remove old index if exists
    try {
      await this.constructor.collection.dropIndex('email_1');
    } catch (err) {
      // Index may not exist, continue
    }
    next();
  } catch (err) {
    next(err);
  }
});

adminSchema.pre('save', function(next) {
  if (this.isEmailVerified && this.role) {
    if (this.role === 'branch_admin' && !this.permissions.length) {
      this.permissions = [
        'manage_barbers',
        'manage_appointments',
        'manage_shifts',
        'manage_services',
        'manage_leaves'
      ];
    }
    if (this.role === 'main_admin' && !this.permissions.length) {
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