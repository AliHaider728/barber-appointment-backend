import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  email: { 
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true,
    index: true
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
    enum: ['main_admin', 'branch_admin'],
    required: true
  },
  isActive: {
    type: Boolean,
    default: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false
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

/**
 * SAFE PERMISSIONS
 * (does not overwrite existing permissions)
 */
adminSchema.pre('save', function (next) {
  if (this.permissions && this.permissions.length > 0) {
    return next();
  }

  if (this.role === 'branch_admin') {
    this.permissions = [
      'manage_barbers',
      'manage_appointments',
      'manage_shifts',
      'manage_services',
      'manage_leaves'
    ];
  }

  if (this.role === 'main_admin') {
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

  next();
});

export default mongoose.model('Admin', adminSchema);
