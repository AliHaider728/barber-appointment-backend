// models/Barber.js
import mongoose from 'mongoose';

const barberSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Barber name is required'],
    trim: true
  },
  experienceYears: {
    type: Number,
    required: [true, 'Experience years required'],
    min: [0, 'Experience cannot be negative']
  },
  specialties: {
    type: [String],
    required: [true, 'At least one specialty required'],
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'Specialties cannot be empty'
    }
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: [true, 'Branch is required']
  }
}, {
  timestamps: true
});

export default mongoose.model('Barber', barberSchema);