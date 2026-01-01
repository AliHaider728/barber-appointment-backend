// backend/models/Payment.js
import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  // APPOINTMENT REFERENCE
  appointment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: true,
    index: true
  },
  
  // BARBER REFERENCE
  barber: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Barber',
    required: true,
    index: true
  },
  
  // CUSTOMER DETAILS
  customerEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  
  // PAYMENT AMOUNTS (in GBP)
  totalAmount: {
    type: Number,
    required: true
  },
  platformFee: {
    type: Number,
    required: true,
    default: 0
  },
  barberAmount: {
    type: Number,
    required: true
  },
  
  // STRIPE IDS
  stripePaymentIntentId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  stripeTransferId: {
    type: String,
    sparse: true // Only set when transfer to barber is made
  },
  
  // PAYMENT STATUS
  status: {
    type: String,
    enum: ['pending', 'succeeded', 'failed', 'refunded', 'transferred'],
    default: 'pending',
    index: true
  },
  
  // TRANSFER STATUS (to barber)
  transferStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  
  // METADATA
  paymentMethod: {
    type: String,
    enum: ['card', 'pay_later'],
    default: 'card'
  },
  
  // ERROR TRACKING
  errorMessage: {
    type: String
  },
  
  // REFUND DETAILS
  refundId: {
    type: String
  },
  refundAmount: {
    type: Number
  },
  refundedAt: {
    type: Date
  }
  
}, { timestamps: true });

// INDEXES
paymentSchema.index({ barber: 1, status: 1 });
paymentSchema.index({ appointment: 1 });
paymentSchema.index({ createdAt: -1 });

// VIRTUAL - Formatted amounts
paymentSchema.virtual('formattedTotal').get(function() {
  return `£${this.totalAmount.toFixed(2)}`;
});

paymentSchema.virtual('formattedBarberAmount').get(function() {
  return `£${this.barberAmount.toFixed(2)}`;
});

paymentSchema.virtual('formattedPlatformFee').get(function() {
  return `£${this.platformFee.toFixed(2)}`;
});

export default mongoose.model('Payment', paymentSchema);
