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
    default: 'Appointment Reminder',
    trim: true
  }
}, { timestamps: true });

// Virtual to get hours from minutes
reminderSchema.virtual('hours').get(function() {
  return Math.floor(this.minutesBeforeAppointment / 60);
});

// Virtual to get remaining minutes
reminderSchema.virtual('minutes').get(function() {
  return this.minutesBeforeAppointment % 60;
});

// Virtual to get formatted time string
reminderSchema.virtual('formattedTime').get(function() {
  const hours = Math.floor(this.minutesBeforeAppointment / 60);
  const minutes = this.minutesBeforeAppointment % 60;
  
  if (hours === 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else if (minutes === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else {
    return `${hours}h ${minutes}m`;
  }
});

// Method to set time from hours and minutes
reminderSchema.methods.setTime = function(hours, minutes) {
  this.minutesBeforeAppointment = (hours * 60) + minutes;
  return this;
};

// Static method to create reminder with hours and minutes
reminderSchema.statics.createWithTime = function(name, hours, minutes, options = {}) {
  const totalMinutes = (hours * 60) + minutes;
  return {
    name,
    minutesBeforeAppointment: totalMinutes,
    enabled: options.enabled !== undefined ? options.enabled : true,
    emailSubject: options.emailSubject || 'Appointment Reminder'
  };
};

const reminderSettingsSchema = new mongoose.Schema({
  reminders: [reminderSchema]
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Instance method to add reminder with hours and minutes
reminderSettingsSchema.methods.addReminder = function(name, hours, minutes, options = {}) {
  const totalMinutes = (hours * 60) + minutes;
  this.reminders.push({
    name,
    minutesBeforeAppointment: totalMinutes,
    enabled: options.enabled !== undefined ? options.enabled : true,
    emailSubject: options.emailSubject || 'Appointment Reminder'
  });
  return this;
};

// Instance method to get all reminders with formatted times
reminderSettingsSchema.methods.getFormattedReminders = function() {
  return this.reminders.map(reminder => ({
    ...reminder.toObject(),
    hours: Math.floor(reminder.minutesBeforeAppointment / 60),
    minutes: reminder.minutesBeforeAppointment % 60,
    formattedTime: reminder.formattedTime
  }));
};

export default mongoose.model('ReminderSettings', reminderSettingsSchema);