import cron from 'node-cron';
import ReminderSettings from '../models/ReminderSettings.js';
import Appointment from '../models/Appointment.js';
import { sendAppointmentReminder } from '../utils/reminderEmailService.js';

let cronJob = null;

export const startReminderCron = () => {
  // Run every 5 minutes
  cronJob = cron.schedule('*/5 * * * *', async () => {
    try {
      console.log('🔔 ===============================');
      console.log('🔔 Running reminder cron job...');
      console.log('🔔 Time:', new Date().toISOString());
      console.log('🔔 ===============================');
      
      const settings = await ReminderSettings.findOne();
      
      if (!settings) {
        console.log('⚠️ No reminder settings found');
        return;
      }
      
      console.log('✅ Found reminder settings with', settings.reminders.length, 'reminders');
      
      const now = new Date();
      let totalSent = 0;
      
      for (const reminder of settings.reminders) {
        if (!reminder.enabled) {
          console.log(`⏭️ Skipping disabled reminder: ${reminder.name}`);
          continue;
        }
        
        // Calculate target time based on minutes
        const minutesMs = reminder.minutesBeforeAppointment * 60 * 1000;
        const targetTime = new Date(now.getTime() + minutesMs);
        const windowStart = new Date(targetTime.getTime() - 2.5 * 60 * 1000); // 2.5 min before
        const windowEnd = new Date(targetTime.getTime() + 2.5 * 60 * 1000); // 2.5 min after
        
        const hoursBeforeAppointment = Math.floor(reminder.minutesBeforeAppointment / 60);
        const remainingMinutes = reminder.minutesBeforeAppointment % 60;
        
        console.log(`\n📅 Checking: ${reminder.name}`);
        console.log(`⏰ Time: ${hoursBeforeAppointment}h ${remainingMinutes}m (${reminder.minutesBeforeAppointment} minutes)`);
        console.log(`🎯 Target time: ${targetTime.toISOString()}`);
        console.log(`📊 Window: ${windowStart.toISOString()} to ${windowEnd.toISOString()}`);
        
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
            
            console.log(`\n📨 Sending reminder to: ${appointment.email}`);
            console.log(`👤 Customer: ${appointment.customerName}`);
            console.log(`📅 Appointment: ${appointmentDate.toISOString()}`);
            console.log(`⏰ Time: ${appointmentTime}`);
            console.log(`✂️ Services: ${appointment.services.length}`);
            
            // Map services properly
            const servicesList = appointment.services.map(s => ({
              name: s.name || 'N/A',
              price: s.price || '£0',
              duration: s.duration || '0 min'
            }));
            
            console.log(`📋 Services list:`, servicesList);
            
            const result = await sendAppointmentReminder(appointment.email, {
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
              console.log(`✅ Sent ${reminder.name} to ${appointment.email}`);
              console.log(`✅ Marked reminder as sent in database`);
            } else {
              console.error(`❌ Failed to send reminder to ${appointment.email}:`, result.error);
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (error) {
            console.error(`❌ Error sending reminder for appointment ${appointment._id}:`, error);
            console.error(`❌ Error details:`, error.message);
          }
        }
      }
      
      console.log(`\n🔔 ===============================`);
      console.log(`✅ Cron job completed`);
      console.log(`📊 Total reminders sent: ${totalSent}`);
      console.log(`🔔 ===============================\n`);
      
    } catch (error) {
      console.error('❌ Cron job error:', error);
      console.error('❌ Error stack:', error.stack);
    }
  });
  
  console.log('✅ Reminder cron job started (runs every 5 minutes)');
  console.log('⏰ Next run will be in 5 minutes');
};

export const stopReminderCron = () => {
  if (cronJob) {
    cronJob.stop();
    console.log('🛑 Reminder cron job stopped');
  }
};