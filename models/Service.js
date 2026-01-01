import mongoose from 'mongoose';

const ServiceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  duration: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: String,
    required: true,
    trim: true
  },
  gender: {
    type: String,
    enum: ['male', 'female'],
    required: true,
    lowercase: true
  },
  // ✅ NEW: Multiple branches support
  branches: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch'
  }],
  // ✅ Track who created this service
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  isGlobal: {
    type: Boolean,
    default: false // If true, available to all branches
  }
}, {
  timestamps: true
});

// ✅ Index for faster queries
ServiceSchema.index({ name: 1, gender: 1 });
ServiceSchema.index({ branches: 1 });

export default mongoose.model('Service', ServiceSchema);