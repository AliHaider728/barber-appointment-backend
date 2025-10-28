import mongoose from 'mongoose';

const barberSchema = new mongoose.Schema({
  name: String,
  experienceYears: Number,
  specialties: [String],
  branch: String
});

export default mongoose.model('Barber', barberSchema);