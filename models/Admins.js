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
    type: String
  },
  fullName: { 
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['main_admin', 'branch_admin']
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
    validate: {
      validator: function(value) {
        if (this.role === 'branch_admin') {
          return value != null;
        }
        return true;
      },
      message: 'Branch is required for Branch Admin'
    }
  },
  permissions: {
    type: [String],
    default: []
  }
}, { timestamps: true });

// Pre-save hook to set permissions
adminSchema.pre('save', function(next) {
  if (this.role && (this.isNew || this.isModified('role'))) {
    if (this.role === 'branch_admin') {
      this.permissions = [
        'manage_barbers',
        'manage_appointments',
        'manage_shifts',
        'manage_services', 
        'manage_leaves'
      ];
    } else {
      this.permissions = [
        'manage_barbers',
        'manage_branches', 
        'manage_services',
        'manage_appointments',
        'manage_admins',
        'manage_leaves',
        'view_analytics'
      ];
    }
  }
  next();
});

adminSchema.index({ email: 1 });
adminSchema.index({ assignedBranch: 1 });

export default mongoose.model('Admin', adminSchema);