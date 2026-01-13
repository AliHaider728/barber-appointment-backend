import express from 'express';
import ReminderSettings from '../models/ReminderSettings.js';
import Appointment from '../models/Appointment.js';
import { sendAppointmentReminder } from '../utils/reminderEmailService.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Admin auth middleware
const requireAdminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    console.log('🔑 Token received, verifying...');
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token decoded:', { adminId: decoded.adminId || decoded.id });
    
    const Admin = (await import('../models/Admins.js')).default;
    const admin = await Admin.findById(decoded.adminId || decoded.id);
    
    if (!admin) {
      console.log('❌ Admin not found for ID:', decoded.adminId || decoded.id);
      return res.status(401).json({ error: 'Admin not found' });
    }
    
    console.log('✅ Admin authenticated:', admin.email);
    req.admin = admin;
    next();
  } catch (error) {
    console.error('❌ Admin auth error:', error.message);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token format' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// CORS Headers
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// GET reminder settings
router.get('/settings', requireAdminAuth, async (req, res) => {
  try {
    console.log('📋 Fetching reminder settings for:', req.admin?.email);
    
    let settings = await ReminderSettings.findOne();
    
    // Create default settings if none exist
    if (!settings) {
      settings = new ReminderSettings({
        reminders: [
          {
            name: '24 Hours Before',
            minutesBeforeAppointment: 1440, // 24 * 60
            enabled: true,
            emailSubject: 'Appointment Reminder - Tomorrow'
          },
          {
            name: '2 Hours Before',
            minutesBeforeAppointment: 120, // 2 * 60
            enabled: true,
            emailSubject: 'Appointment Reminder - In 2 Hours'
          }
        ]
      });
      await settings.save();
      console.log('✅ Default reminder settings created');
    }
    
    console.log('✅ Returning settings with', settings.reminders.length, 'reminders');
    res.json(settings);
  } catch (error) {
    console.error('❌ Get reminder settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE reminder settings
router.put('/settings', requireAdminAuth, async (req, res) => {
  try {
    console.log('🔄 Updating reminder settings by:', req.admin?.email);
    const { reminders } = req.body;
    
    let settings = await ReminderSettings.findOne();
    
    if (!settings) {
      settings = new ReminderSettings();
    }
    
    if (reminders) {
      settings.reminders = reminders;
      console.log(`🔄 Updated ${reminders.length} reminders`);
    }
    
    settings.updatedAt = new Date();
    await settings.save();
    
    console.log('✅ Reminder settings updated successfully');
    res.json(settings);
  } catch (error) {
    console.error('❌ Update reminder settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ADD new reminder
router.post('/settings/reminder', requireAdminAuth, async (req, res) => {
  try {
    console.log('➕ Adding new reminder by:', req.admin?.email);
    const { name, minutesBeforeAppointment, enabled, emailSubject } = req.body;
    
    if (!name || typeof minutesBeforeAppointment !== 'number') {
      return res.status(400).json({ error: 'Name and minutes are required' });
    }
    
    if (minutesBeforeAppointment < 0 || !Number.isInteger(minutesBeforeAppointment)) {
      return res.status(400).json({ error: 'Minutes must be a positive integer' });
    }
    
    let settings = await ReminderSettings.findOne();
    if (!settings) {
      settings = new ReminderSettings({ reminders: [] });
    }
    
    settings.reminders.push({
      name,
      minutesBeforeAppointment,
      enabled: enabled !== false,
      emailSubject: emailSubject || 'Appointment Reminder'
    });
    
    settings.updatedAt = new Date();
    await settings.save();
    
    console.log('✅ New reminder added:', name);
    res.json(settings);
  } catch (error) {
    console.error('❌ Add reminder error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE reminder
router.delete('/settings/reminder/:id', requireAdminAuth, async (req, res) => {
  try {
    console.log('🗑️ Deleting reminder:', req.params.id, 'by:', req.admin?.email);
    const { id } = req.params;
    
    const settings = await ReminderSettings.findOne();
    if (!settings) {
      return res.status(404).json({ error: 'Settings not found' });
    }
    
    const initialLength = settings.reminders.length;
    settings.reminders = settings.reminders.filter(
      r => r._id.toString() !== id
    );
    
    if (settings.reminders.length === initialLength) {
      return res.status(404).json({ error: 'Reminder not found' });
    }
    
    settings.updatedAt = new Date();
    await settings.save();
    
    console.log('✅ Reminder deleted:', id);
    res.json(settings);
  } catch (error) {
    console.error('❌ Delete reminder error:', error);
    res.status(500).json({ error: error.message });
  }
});

// TOGGLE reminder status (PATCH)
router.patch('/settings/reminder/:id/toggle', requireAdminAuth, async (req, res) => {
  try {
    console.log('🔄 Toggling reminder:', req.params.id);
    const { id } = req.params;
    const { enabled } = req.body;
    
    const settings = await ReminderSettings.findOne();
    if (!settings) {
      return res.status(404).json({ error: 'Settings not found' });
    }
    
    const reminder = settings.reminders.id(id);
    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }
    
    reminder.enabled = enabled;
    settings.updatedAt = new Date();
    await settings.save();
    
    console.log('✅ Reminder toggled:', id, 'enabled:', enabled);
    res.json(settings);
  } catch (error) {
    console.error('❌ Toggle reminder error:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE specific reminder (PUT)
router.put('/settings/reminder/:id', requireAdminAuth, async (req, res) => {
  try {
    console.log('🔄 Updating reminder:', req.params.id);
    const { id } = req.params;
    const { name, minutesBeforeAppointment, enabled, emailSubject } = req.body;
    
    const settings = await ReminderSettings.findOne();
    if (!settings) {
      return res.status(404).json({ error: 'Settings not found' });
    }
    
    const reminder = settings.reminders.id(id);
    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }
    
    if (name) reminder.name = name;
    if (typeof minutesBeforeAppointment === 'number') {
      if (minutesBeforeAppointment < 0 || !Number.isInteger(minutesBeforeAppointment)) {
        return res.status(400).json({ error: 'Minutes must be a positive integer' });
      }
      reminder.minutesBeforeAppointment = minutesBeforeAppointment;
    }
    if (typeof enabled === 'boolean') reminder.enabled = enabled;
    if (emailSubject) reminder.emailSubject = emailSubject;
    
    settings.updatedAt = new Date();
    await settings.save();
    
    console.log('✅ Reminder updated:', id);
    res.json(settings);
  } catch (error) {
    console.error('❌ Update reminder error:', error);
    res.status(500).json({ error: error.message });
  }
});

// MANUAL TEST - Send reminder for specific appointment
router.post('/test/:appointmentId', requireAdminAuth, async (req, res) => {
  try {
    console.log('🧪 Testing reminder for appointment:', req.params.appointmentId);
    const { appointmentId } = req.params;
    
    const appointment = await Appointment.findById(appointmentId)
      .populate('barber', 'name')
      .populate('branch', 'name address city')
      .populate('services.serviceRef', 'name price duration');
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    const now = new Date();
    const appointmentDate = new Date(appointment.date);
    const minutesUntil = Math.round((appointmentDate - now) / (60 * 1000));
    const hoursUntil = Math.floor(minutesUntil / 60);
    
    const appointmentTime = appointmentDate.toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false
    });
    
    const result = await sendAppointmentReminder(appointment.email, {
      customerName: appointment.customerName,
      bookingRef: appointment._id.toString(),
      branchName: appointment.branch?.name || 'N/A',
      branchAddress: appointment.branch?.address || appointment.branch?.city || 'N/A',
      barberName: appointment.barber?.name || 'N/A',
      services: appointment.services.map(s => ({
        name: s.name,
        price: s.price
      })),
      date: appointment.date,
      time: appointmentTime,
      duration: appointment.duration,
      totalPrice: appointment.totalPrice,
      hoursUntilAppointment: hoursUntil > 0 ? hoursUntil : 0
    });
    
    if (result.success) {
      console.log('✅ Test reminder sent to:', appointment.email);
      res.json({ 
        success: true, 
        message: `Test reminder sent to ${appointment.email}!`,
        hoursUntil,
        minutesUntil
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('❌ Test reminder error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET upcoming appointments that need reminders
router.get('/pending', requireAdminAuth, async (req, res) => {
  try {
    console.log('📊 Fetching pending reminders');
    const settings = await ReminderSettings.findOne();
    
    if (!settings) {
      return res.json({ 
        message: 'No reminder settings found',
        appointments: []
      });
    }
    
    const now = new Date();
    const upcoming = [];
    
    for (const reminder of settings.reminders) {
      if (!reminder.enabled) continue;
      
      const minutesMs = reminder.minutesBeforeAppointment * 60 * 1000;
      const targetTime = new Date(now.getTime() + minutesMs);
      const windowEnd = new Date(targetTime.getTime() + 5 * 60 * 1000);
      
      const appointments = await Appointment.find({
        date: { $gte: targetTime, $lte: windowEnd },
        status: { $in: ['pending', 'confirmed'] },
        remindersSent: { $ne: reminder._id.toString() }
      })
        .populate('barber', 'name')
        .populate('branch', 'name')
        .select('customerName email date remindersSent');
      
      upcoming.push({
        reminder: reminder.name,
        minutes: reminder.minutesBeforeAppointment,
        count: appointments.length,
        appointments: appointments.map(a => ({
          id: a._id,
          customer: a.customerName,
          email: a.email,
          date: a.date,
          barber: a.barber?.name,
          branch: a.branch?.name
        }))
      });
    }
    
    console.log('✅ Found', upcoming.length, 'reminder groups');
    res.json({ 
      activeReminders: settings.reminders.filter(r => r.enabled).length,
      upcoming 
    });
  } catch (error) {
    console.error('❌ Get pending reminders error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;