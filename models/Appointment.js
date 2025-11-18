// models/Appointment.js - UPDATED WITH PAYMENT FIELDS
import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema({
  customerName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  services: [{
    serviceRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    name: { type: String, required: true },
    price: { type: String, required: true },
    duration: { type: String, required: true }
  }],
  totalPrice: { type: Number, required: true },
  totalPriceInCents: { type: Number },
  duration: { type: Number, required: true },
  barber: { type: mongoose.Schema.Types.ObjectId, ref: 'Barber', required: true },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'rejected', 'completed'], 
    default: 'pending' 
  },
  
  // PAYMENT FIELDS - YE NAYI FIELDS HAIN
  paymentIntentId: { type: String }, // Stripe payment intent ID
  paymentStatus: { 
    type: String, 
    enum: ['pending', 'paid', 'failed', 'refunded'], 
    default: 'pending' 
  },
  payOnline: { type: Boolean, default: false }, // true = online payment, false = pay at salon
   
}, { timestamps: true });

appointmentSchema.index({ barber: 1, date: 1 });
appointmentSchema.index({ branch: 1, date: 1 });
appointmentSchema.index({ paymentIntentId: 1 });

export default mongoose.model('Appointment', appointmentSchema);