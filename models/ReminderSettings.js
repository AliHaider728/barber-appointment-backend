import mongoose from 'mongoose';

const reminderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  minutesBeforeAppointment: {
    type: Number,
    required: true,
    min: 0
  },
  enabled: {
    type: Boolean,
    default: true
  },
  emailSubject: {
    type: String,
    default: 'Appointment Reminder'
  }
}, { timestamps: true });

const reminderSettingsSchema = new mongoose.Schema({
  reminders: [reminderSchema]
}, { timestamps: true });

export default mongoose.model('ReminderSettings', reminderSettingsSchema);