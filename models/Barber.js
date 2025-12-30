import mongoose from 'mongoose';

const barberSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  experienceYears: { type: Number, required: true, min: 0 },
  gender: { type: String, required: true, enum: ['male', 'female'], lowercase: true },
  specialties: [{ type: String, trim: true }],
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  
  //   Track who added/updated this barber
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  addedByRole: { type: String, enum: ['main-admin', 'branch-admin'] },
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  lastUpdatedByRole: { type: String, enum: ['main-admin', 'branch-admin'] },
  lastUpdatedAt: { type: Date }
  
}, { timestamps: true });

export default mongoose.model('Barber', barberSchema);