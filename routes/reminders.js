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
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const Admin = (await import('../models/Admins.js')).default;
    const admin = await Admin.findById(decoded.adminId || decoded.id);
    
    if (!admin) {
      return res.status(401).json({ error: 'Admin not found' });
    }
    
    req.admin = admin;
    next();
  } catch (error) {
    console.error('❌ Admin auth error:', error.message);
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

// ✅ VERCEL CRON ENDPOINT - Runs automatically every 5 minutes
router.get('/cron', async (req, res) => {
  try {
    console.log('🔔 ===============================');
    console.log('🔔 VERCEL CRON: Running reminder job');
    console.log('🔔 Time:', new Date().toISOString());
    console.log('🔔 ===============================');
    
    const settings = await ReminderSettings.findOne();
    
    if (!settings) {
      console.log('⚠️ No reminder settings found');
      return res.json({ success: true, message: 'No settings', sent: 0 });
    }
    
    console.log('✅ Found', settings.reminders.length, 'reminder configurations');
    
    const now = new Date();
    let totalSent = 0;
    const results = [];
    
    for (const reminder of settings.reminders) {
      if (!reminder.enabled) {
        console.log(`⏭️ Skipping disabled: ${reminder.name}`);
        continue;
      }
      
      const minutesMs = reminder.minutesBeforeAppointment * 60 * 1000;
      const targetTime = new Date(now.getTime() + minutesMs);
      const windowStart = new Date(targetTime.getTime() - 2.5 * 60 * 1000);
      const windowEnd = new Date(targetTime.getTime() + 2.5 * 60 * 1000);
      
      const hours = Math.floor(reminder.minutesBeforeAppointment / 60);
      const minutes = reminder.minutesBeforeAppointment % 60;
      
      console.log(`\n📅 Processing: ${reminder.name}`);
      console.log(`⏰ Time: ${hours}h ${minutes}m (${reminder.minutesBeforeAppointment} min)`);
      
      const appointments = await Appointment.find({
        date: { $gte: windowStart, $lte: windowEnd },
        status: { $in: ['pending', 'confirmed'] },
        remindersSent: { $ne: reminder._id.toString() }
      })
        .populate('barber', 'name')
        .populate('branch', 'name address city')
        .populate('services.serviceRef', 'name price duration');
      
      console.log(`📧 Found ${appointments.length} appointments`);
      
      let reminderSent = 0;
      
      for (const appointment of appointments) {
        try {
          const appointmentDate = new Date(appointment.date);
          const appointmentTime = appointmentDate.toLocaleTimeString('en-GB', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false
          });
          
          const servicesList = appointment.services.map(s => ({
            name: s.name || 'N/A',
            price: s.price || '£0',
            duration: s.duration || '0 min'
          }));
          
          const emailResult = await sendAppointmentReminder(appointment.email, {
            customerName: appointment.customerName,
            bookingRef: appointment._id.toString(),
            branchName: appointment.branch?.name || 'N/A',
            branchAddress: appointment.branch?.address || appointment.branch?.city || 'N/A',
            barberName: appointment.barber?.name || 'N/A',
            services: servicesList,
            date: appointment.date,
            time: appointmentTime,
            duration: appointment.duration,
            totalPrice: appointment.totalPrice,
            hoursUntilAppointment: hours
          });
          
          if (emailResult.success) {
            if (!appointment.remindersSent) {
              appointment.remindersSent = [];
            }
            appointment.remindersSent.push(reminder._id.toString());
            await appointment.save();
            
            reminderSent++;
            totalSent++;
            console.log(`✅ Sent to ${appointment.email}`);
          } else {
            console.error(`❌ Failed: ${emailResult.error}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`❌ Error:`, error.message);
        }
      }
      
      results.push({
        reminder: reminder.name,
        found: appointments.length,
        sent: reminderSent
      });
    }
    
    console.log(`\n✅ CRON COMPLETE: ${totalSent} sent\n`);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      totalSent,
      results
    });
    
  } catch (error) {
    console.error('❌ CRON ERROR:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET reminder settings
router.get('/settings', requireAdminAuth, async (req, res) => {
  try {
    let settings = await ReminderSettings.findOne();
    
    if (!settings) {
      settings = new ReminderSettings({
        reminders: [
          {
            name: '24 Hours Before',
            minutesBeforeAppointment: 1440,
            enabled: true,
            emailSubject: 'Appointment Reminder - Tomorrow'
          },
          {
            name: '2 Hours Before',
            minutesBeforeAppointment: 120,
            enabled: true,
            emailSubject: 'Appointment Reminder - In 2 Hours'
          }
        ]
      });
      await settings.save();
    }
    
    res.json(settings);
  } catch (error) {
    console.error('❌ Get settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE reminder settings
router.put('/settings', requireAdminAuth, async (req, res) => {
  try {
    const { reminders } = req.body;
    
    let settings = await ReminderSettings.findOne();
    if (!settings) {
      settings = new ReminderSettings();
    }
    
    if (reminders) {
      settings.reminders = reminders;
    }
    
    settings.updatedAt = new Date();
    await settings.save();
    
    res.json(settings);
  } catch (error) {
    console.error('❌ Update settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ADD new reminder
router.post('/settings/reminder', requireAdminAuth, async (req, res) => {
  try {
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
    
    res.json(settings);
  } catch (error) {
    console.error('❌ Add reminder error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE reminder
router.delete('/settings/reminder/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const settings = await ReminderSettings.findOne();
    if (!settings) {
      return res.status(404).json({ error: 'Settings not found' });
    }
    
    const initialLength = settings.reminders.length;
    settings.reminders = settings.reminders.filter(r => r._id.toString() !== id);
    
    if (settings.reminders.length === initialLength) {
      return res.status(404).json({ error: 'Reminder not found' });
    }
    
    settings.updatedAt = new Date();
    await settings.save();
    
    res.json(settings);
  } catch (error) {
    console.error('❌ Delete reminder error:', error);
    res.status(500).json({ error: error.message });
  }
});

// TOGGLE reminder status
router.patch('/settings/reminder/:id/toggle', requireAdminAuth, async (req, res) => {
  try {
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
    
    res.json(settings);
  } catch (error) {
    console.error('❌ Toggle reminder error:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE specific reminder
router.put('/settings/reminder/:id', requireAdminAuth, async (req, res) => {
  try {
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
    
    res.json(settings);
  } catch (error) {
    console.error('❌ Update reminder error:', error);
    res.status(500).json({ error: error.message });
  }
});

// MANUAL TEST
router.post('/test/:appointmentId', requireAdminAuth, async (req, res) => {
  try {
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
        price: s.price,
        duration: s.duration
      })),
      date: appointment.date,
      time: appointmentTime,
      duration: appointment.duration,
      totalPrice: appointment.totalPrice,
      hoursUntilAppointment: hoursUntil > 0 ? hoursUntil : 0
    });
    
    if (result.success) {
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

// GET pending reminders
router.get('/pending', requireAdminAuth, async (req, res) => {
  try {
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