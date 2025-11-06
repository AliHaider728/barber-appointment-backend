 
import mongoose from 'mongoose';

const branchSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  city: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  openingHours: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  image: { 
    type: String, 
    default: null 
  } // Now stores: "/uploads/123456789.jpg"
}, { timestamps: true });

export default mongoose.model('Branch', branchSchema);