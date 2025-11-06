// models/BarberShift.js
import mongoose from 'mongoose';

const barberShiftSchema = new mongoose.Schema({
  barber: { type: mongoose.Schema.Types.ObjectId, ref: 'Barber', required: true },
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 }, // 0=Sunday
  startTime: { type: String, required: true }, // "09:00"
  endTime: { type: String, required: true },   // "19:00"
  isOff: { type: Boolean, default: false }
});

export default mongoose.model('BarberShift', barberShiftSchema);