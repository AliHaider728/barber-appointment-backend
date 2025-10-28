import mongoose from 'mongoose';

const branchSchema = new mongoose.Schema({
  name: String,
  city: String,
  address: String,
  openingHours: String,
  phone: String
});

export default mongoose.model('Branch', branchSchema);