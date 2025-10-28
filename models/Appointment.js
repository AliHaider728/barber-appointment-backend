import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema({
  customerName: String,
  email: String,
  phone: String,
  date: Date,
  service: String,
  barber: String,
  branch: String,
  status: { type: String, default: 'pending' }
});

export default mongoose.model('Appointment', appointmentSchema);