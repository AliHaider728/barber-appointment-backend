import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema({
  name: String,
  duration: String,
  price: String
});

export default mongoose.model('Service', serviceSchema);

