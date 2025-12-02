import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema({
  // USER REFERENCE - IMPORTANT for filtering user appointments
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: false, // Optional for backward compatibility with old appointments
    index: true // Index for faster queries
  },
  
  // CUSTOMER DETAILS
  customerName: { type: String, required: true, trim: true },
  email: { 
    type: String, 
    required: true, 
    trim: true, 
    lowercase: true,
    index: true // Index for faster email-based queries
  },
  phone: { type: String, required: true, trim: true },
  
  // APPOINTMENT DETAILS
  date: { type: Date, required: true, index: true },
  duration: { type: Number, required: true },
  
  // SERVICES
  services: [{
    serviceRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    name: { type: String, required: true },
    price: { type: String, required: true },
    duration: { type: String, required: true }
  }],
  
  // PRICING
  totalPrice: { type: Number, required: true },
  totalPriceInCents: { type: Number },
  
  // REFERENCES
  barber: { type: mongoose.Schema.Types.ObjectId, ref: 'Barber', required: true },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  
  // STATUS
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'rejected', 'completed', 'cancelled'], 
    default: 'pending',
    index: true
  },
  
  // PAYMENT FIELDS
  paymentIntentId: { type: String }, // Stripe payment intent ID
  paymentStatus: { 
    type: String, 
    enum: ['pending', 'paid', 'failed', 'refunded'], 
    default: 'pending' 
  },
  payOnline: { type: Boolean, default: false }, // true = online payment, false = pay at salon
   
}, { timestamps: true }); // createdAt and updatedAt automatically added

// Pre-save hook for date normalization
appointmentSchema.pre('save', function(next) {
  // Normalize date to UTC if needed
  this.date = new Date(this.date.toUTCString());
  next();
});

// INDEXES for better query performance
appointmentSchema.index({ barber: 1, date: 1 });
appointmentSchema.index({ branch: 1, date: 1 });
appointmentSchema.index({ paymentIntentId: 1 });

// NEW COMPOUND INDEXES for user filtering
appointmentSchema.index({ email: 1, date: -1 }); // User appointments by email
appointmentSchema.index({ userId: 1, date: -1 }); // User appointments by ID
appointmentSchema.index({ email: 1, status: 1 }); // Filter by email + status
appointmentSchema.index({ userId: 1, status: 1 }); // Filter by userId + status

// Virtual for formatted date
appointmentSchema.virtual('formattedDate').get(function() {
  return this.date ? this.date.toLocaleDateString('en-GB') : 'N/A';
});

// Virtual for formatted price
appointmentSchema.virtual('formattedPrice').get(function() {
  return `£${this.totalPrice?.toFixed(2) || '0.00'}`;
});

// Virtual for total duration from services
appointmentSchema.virtual('totalDuration').get(function() {
  if (!this.services || this.services.length === 0) return this.duration || 0;
  return this.services.reduce((sum, service) => {
    const duration = parseInt(service.duration) || 0;
    return sum + duration;
  }, 0);
});

export default mongoose.model('Appointment', appointmentSchema);