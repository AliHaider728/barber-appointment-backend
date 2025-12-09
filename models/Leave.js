
import mongoose from 'mongoose';

const leaveSchema = new mongoose.Schema({
  barber: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Barber', 
    required: true,
    index: true
  },
  startDate: { 
    type: Date, 
    required: true,
    index: true
  },
  endDate: { 
    type: Date, 
    required: true,
    index: true
  },
  reason: { 
    type: String,
    default: ''
  },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending',
    index: true
  },
  // NEW FIELD: Mark leaves as important/urgent
  isImportant: {
    type: Boolean,
    default: false
  }
}, { 
  timestamps: true 
});

// Compound indexes for efficient queries
leaveSchema.index({ barber: 1, startDate: 1, endDate: 1 });
leaveSchema.index({ status: 1, startDate: 1 });

// Validation: End date must be after start date
leaveSchema.pre('save', function(next) {
  if (this.endDate <= this.startDate) {
    next(new Error('End date must be after start date'));
  }
  next();
});

const Leave = mongoose.model('Leave', leaveSchema);

export default Leave;