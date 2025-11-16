import mongoose from 'mongoose';

const barberSchema = new mongoose.Schema({
  name: { type: String, required: true },
  experienceYears: { type: Number, required: true },
  gender: { type: String, enum: ['male', 'female'], required: true },
  specialties: { type: [String], required: true },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  stripeAccountId: { type: String },
  isOnboarded: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('Barber', barberSchema);