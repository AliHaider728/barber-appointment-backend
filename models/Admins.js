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
    enum: ['main_admin', 'branch_admin'], // Main Admin ya Branch Admin
    default: 'branch_admin'
  },
  assignedBranch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: function() {
      return this.role === 'branch_admin'; // Sirf branch admin ke liye required
    }
  },
  permissions: {
    type: [String],
    default: function() {
      // Branch admin ko limited permissions
      if (this.role === 'branch_admin') {
        return [
          'view_branch_barbers',
          'manage_branch_barbers',
          'view_branch_appointments',
          'manage_branch_appointments',
          'manage_branch_shifts',
          'view_branch_services',
          'manage_branch_leaves'
        ];
      }
      // Main admin ko full permissions
      return [
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
}, { timestamps: true });

adminSchema.index({ email: 1 });
adminSchema.index({ assignedBranch: 1 });


export default mongoose.model('Admin', adminSchema);