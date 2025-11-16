import mongoose from 'mongoose';

const barberShiftSchema = new mongoose.Schema({
  barber: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Barber',
    required: true
  },
  dayOfWeek: {
    type: Number,
    required: true,
    min: 0,
    max: 6
  },
  startTime: {
    type: String,
    required: function () { return !this.isOff; } // Only if not off
  },
  endTime: {
    type: String,
    required: function () { return !this.isOff; } // Only if not off
  },
  isOff: {
    type: Boolean,
    default: false
  }
});

export default mongoose.model('BarberShift', barberShiftSchema);
