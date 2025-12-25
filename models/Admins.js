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
    enum: ['main_admin', 'branch_admin'],
    default: 'branch_admin'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  assignedBranch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    // FIX: Remove required function, validate manually
    validate: {
      validator: function(value) {
        // Only validate if role is branch_admin
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
  if (this.isNew || this.isModified('role')) {
    if (this.role === 'branch_admin') {
      this.permissions = [
        'view_branch_barbers',
        'manage_branch_barbers',
        'view_branch_appointments',
        'manage_branch_appointments',
        'manage_branch_shifts',
        'view_branch_services',
        'manage_branch_leaves'
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