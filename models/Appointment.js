// models/Appointment.js
import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  date: { type: Date, required: true },
  
  // Multiple services
  services: [{
    serviceRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    name: { type: String, required: true },
    price: { type: String, required: true } // e.g., "£35"
  }],

  totalPrice: { type: Number, required: true }, // e.g., 35.00

  barber: { type: String, required: true },
  barberRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Barber' }, // optional

  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected'],
    default: 'pending'
  }
}, { timestamps: true });

export default mongoose.model('Appointment', appointmentSchema);