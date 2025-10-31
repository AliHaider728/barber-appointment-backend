import mongoose from 'mongoose';

const branchSchema = new mongoose.Schema({
  name: String,
  city: String,
  address: String,
  openingHours: String,
  phone: String,
  image: { type: String, default: 'https://via.placeholder.com/400x300' }
});

export default mongoose.model('Branch', branchSchema);