import cron from 'node-cron';
import ReminderSettings from '../models/ReminderSettings.js';
import Appointment from '../models/Appointment.js';
import { sendAppointmentReminder } from '../utils/reminderEmailService.js';

let cronJob = null;

export const startReminderCron = () => {
  // Run every 5 minutes (changed from 30 for better precision)
  cronJob = cron.schedule('*/5 * * * *', async () => {
    try {
      console.log('🔔 Running reminder cron job...');
      
      const settings = await ReminderSettings.findOne();
      
      if (!settings) {
        console.log('⚠️ No reminder settings found');
        return;
      }
      
      const now = new Date();
      let totalSent = 0;
      
      for (const reminder of settings.reminders) {
        if (!reminder.enabled) {
          console.log(`⏭️ Skipping disabled reminder: ${reminder.name}`);
          continue;
        }
        
        // ✅ FIX: Use minutesBeforeAppointment instead of hoursBeforeAppointment
        const targetTime = new Date(now.getTime() + reminder.minutesBeforeAppointment * 60 * 1000);
        const windowStart = new Date(targetTime.getTime() - 2.5 * 60 * 1000); // 2.5 min before
        const windowEnd = new Date(targetTime.getTime() + 2.5 * 60 * 1000); // 2.5 min after
        
        const hoursBeforeAppointment = Math.floor(reminder.minutesBeforeAppointment / 60);
        
        console.log(`📅 Checking ${reminder.name} (${reminder.minutesBeforeAppointment} minutes before)`);
        console.log(`📅 Window: ${windowStart.toISOString()} to ${windowEnd.toISOString()}`);
        
        // Find appointments in the time window that haven't received this reminder
        const appointments = await Appointment.find({
          date: { $gte: windowStart, $lte: windowEnd },
          status: { $in: ['pending', 'confirmed'] },
          remindersSent: { $ne: reminder._id.toString() }
        })
          .populate('barber', 'name')
          .populate('branch', 'name address city')
          .populate('services.serviceRef', 'name price duration');
        
        console.log(`📧 Found ${appointments.length} appointments to remind`);
        
        for (const appointment of appointments) {
          try {
            const appointmentDate = new Date(appointment.date);
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
              hoursUntilAppointment: hoursBeforeAppointment
            });
            
            if (result.success) {
              // Mark reminder as sent
              if (!appointment.remindersSent) {
                appointment.remindersSent = [];
              }
              appointment.remindersSent.push(reminder._id.toString());
              await appointment.save();
              
              totalSent++;
              console.log(`✅ Sent ${reminder.name} to ${appointment.email} for ${appointmentDate.toLocaleDateString()}`);
            } else {
              console.error(`❌ Failed to send reminder to ${appointment.email}:`, result.error);
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (error) {
            console.error(`❌ Error sending reminder for appointment ${appointment._id}:`, error);
          }
        }
      }
      
      console.log(`✅ Cron job completed. Total reminders sent: ${totalSent}`);
      
    } catch (error) {
      console.error('❌ Cron job error:', error);
    }
  });
  
  console.log('✅ Reminder cron job started (runs every 5 minutes)');
};

export const stopReminderCron = () => {
  if (cronJob) {
    cronJob.stop();
    console.log('🛑 Reminder cron job stopped');
  }
};