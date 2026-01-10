import cron from 'node-cron';
import ReminderSettings from '../models/ReminderSettings.js';
import Appointment from '../models/Appointment.js';
import { sendAppointmentReminder } from '../utils/reminderEmailService.js';

/**
 * Auto Reminder Cron Service
 * Checks every 30 minutes for appointments that need reminders
 */

// Track if cron job is running
let isRunning = false;
let cronJob = null;

/**
 * Process and send reminders
 */
const processReminders = async () => {
  if (isRunning) {
    console.log('⏭️  Reminder check already in progress, skipping...');
    return;
  }

  try {
    isRunning = true;
    console.log('🔔 Checking for appointments needing reminders...');

    // Get reminder settings
    const settings = await ReminderSettings.findOne();
    
    if (!settings) {
      console.log('⚠️  No reminder settings found');
      return;
    }

    const now = new Date();
    let totalSent = 0;

    // Process each reminder configuration
    for (const reminder of settings.reminders) {
      if (!reminder.enabled) {
        console.log(`⏭️  Skipping disabled reminder: ${reminder.name}`);
        continue;
      }

      // Calculate target time window
      const targetTime = new Date(now.getTime() + reminder.hoursBeforeAppointment * 60 * 60 * 1000);
      const windowStart = new Date(targetTime.getTime() - 15 * 60 * 1000); // 15 min before
      const windowEnd = new Date(targetTime.getTime() + 15 * 60 * 1000); // 15 min after

      console.log(`\n📋 Processing reminder: ${reminder.name}`);
      console.log(`   Time window: ${windowStart.toLocaleString()} - ${windowEnd.toLocaleString()}`);

      // Find appointments in this window that haven't received this reminder yet
      const appointments = await Appointment.find({
        date: { $gte: windowStart, $lte: windowEnd },
        status: { $in: ['pending', 'confirmed'] },
        remindersSent: { $ne: reminder._id.toString() }
      })
        .populate('barber', 'name')
        .populate('branch', 'name address city')
        .populate('services.serviceRef', 'name price duration');

      console.log(`   Found ${appointments.length} appointment(s) to remind`);

      // Send reminders
      for (const appointment of appointments) {
        try {
          const appointmentDate = new Date(appointment.date);
          const hoursUntil = Math.round((appointmentDate - now) / (1000 * 60 * 60));

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
            hoursUntilAppointment: Math.max(0, hoursUntil)
          });

          if (result.success) {
            // Mark this reminder as sent
            appointment.remindersSent.push(reminder._id.toString());
            await appointment.save();
            
            console.log(`   ✅ Sent to ${appointment.customerName} (${appointment.email})`);
            totalSent++;
          } else {
            console.error(`   ❌ Failed to send to ${appointment.email}: ${result.error}`);
          }

          // Small delay to avoid overwhelming email service
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`   ❌ Error processing appointment ${appointment._id}:`, error.message);
        }
      }
    }

    console.log(`\n🎉 Reminder check complete. Sent ${totalSent} reminder(s)\n`);

  } catch (error) {
    console.error('❌ Reminder cron error:', error);
  } finally {
    isRunning = false;
  }
};

/**
 * Start the cron job
 */
export const startReminderCron = () => {
  if (cronJob) {
    console.log('⚠️  Reminder cron already running');
    return;
  }

  // Run every 30 minutes
  cronJob = cron.schedule('*/30 * * * *', processReminders);
  
  console.log('🚀 Reminder cron service started (runs every 30 minutes)');
  
  // Run once immediately on startup (optional)
  // processReminders();
};

/**
 * Stop the cron job
 */
export const stopReminderCron = () => {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('🛑 Reminder cron service stopped');
  }
};

/**
 * Manual trigger for testing
 */
export const triggerReminderCheck = async () => {
  console.log('🧪 Manual reminder check triggered');
  await processReminders();
};