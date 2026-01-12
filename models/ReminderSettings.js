import mongoose from 'mongoose';

const reminderSettingsSchema = new mongoose.Schema({
  reminders: [
    {
      name: {
        type: String,
        required: true
      },
      minutesBeforeAppointment: {
        type: Number,
        required: true,
        min: 0,
        validate: {
          validator: Number.isInteger,
          message: 'Minutes must be an integer'
        }
      },
      enabled: {
        type: Boolean,
        default: true
      },
      emailSubject: {
        type: String,
        default: 'Appointment Reminder'
      },
      emailTemplate: {
        type: String,
        default: 'default'
      }
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
reminderSettingsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('ReminderSettings', reminderSettingsSchema);