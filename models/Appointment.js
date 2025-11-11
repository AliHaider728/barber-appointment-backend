import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema({
  customerName: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: [true, 'Phone is required'],
    trim: true
  },
  date: {
    type: Date,
    required: [true, 'Date and time required']
  },
  services: [{
    serviceRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true
    },
    name: { type: String, required: true },
    price: { type: String, required: true },
    duration: { type: String, required: true }
  }],
  totalPrice: {
    type: Number,
    required: true
  },
  duration: {
    type: Number, // in minutes
    required: true
  },
  barber: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Barber',
    required: true
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected', 'completed'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Index for fast lookup
appointmentSchema.index({ barber: 1, date: 1 });
appointmentSchema.index({ branch: 1, date: 1 });

export default mongoose.model('Appointment', appointmentSchema);