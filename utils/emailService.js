import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// Create transporter with your email service credentials
const createTransporter = () => {
  return nodemailer.createTransporter({
    service: 'gmail', // or 'outlook', 'yahoo', etc.
    auth: {
      user: process.env.EMAIL_USER, // Your email
      pass: process.env.EMAIL_PASSWORD // Your email password or app password
    }
  });
};

console.log( process.env.EMAIL_USER, process.env.EMAIL_PASSWORD)
// Send appointment confirmation email
export const sendAppointmentConfirmation = async (appointmentData) => {
  try {
    const transporter = createTransporter();
    
    const { customerName, email, date, services, barber, branch, totalPrice, _id } = appointmentData;
    
    const appointmentDate = new Date(date).toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const appointmentTime = new Date(date).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const servicesList = services.map(s => `${s.name} (${s.price})`).join(', ');

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: '✂️ Appointment Confirmation - Barber Shop',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #D4AF37; color: black; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
            .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .button { display: inline-block; padding: 12px 30px; background: #D4AF37; color: black; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✂️ Appointment Confirmed!</h1>
            </div>
            <div class="content">
              <p>Dear ${customerName},</p>
              <p>Your appointment has been successfully booked. Here are your booking details:</p>
              
              <div class="details">
                <div class="detail-row">
                  <strong>Reference Number:</strong>
                  <span>${_id}</span>
                </div>
                <div class="detail-row">
                  <strong>Date:</strong>
                  <span>${appointmentDate}</span>
                </div>
                <div class="detail-row">
                  <strong>Time:</strong>
                  <span>${appointmentTime}</span>
                </div>
                <div class="detail-row">
                  <strong>Barber:</strong>
                  <span>${barber?.name || 'Not specified'}</span>
                </div>
                <div class="detail-row">
                  <strong>Branch:</strong>
                  <span>${branch?.name || 'Not specified'} - ${branch?.city || ''}</span>
                </div>
                <div class="detail-row">
                  <strong>Services:</strong>
                  <span>${servicesList}</span>
                </div>
                <div class="detail-row">
                  <strong>Total Amount:</strong>
                  <span style="color: #D4AF37; font-size: 18px; font-weight: bold;">£${totalPrice.toFixed(2)}</span>
                </div>
              </div>

              <p><strong>Important:</strong></p>
              <ul>
                <li>Please arrive 5-10 minutes before your appointment time</li>
                <li>If you need to cancel or reschedule, please contact us at least 24 hours in advance</li>
                <li>Bring this confirmation email with you</li>
              </ul>

              <p>We look forward to serving you!</p>
            </div>
            <div class="footer">
              <p>This is an automated message, please do not reply to this email.</p>
              <p>&copy; 2024 Barber Shop. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('  Confirmation email sent to:', email);
    return { success: true };
  } catch (error) {
    console.error('  Email sending failed:', error);
    return { success: false, error: error.message };
  }
};

// Send appointment status update email
export const sendAppointmentStatusUpdate = async (appointmentData, newStatus) => {
  try {
    const transporter = createTransporter();
    
    const { customerName, email, date, barber, branch, _id } = appointmentData;
    
    const appointmentDate = new Date(date).toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const appointmentTime = new Date(date).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    });

    let statusMessage = '';
    let statusColor = '';
    
    switch(newStatus) {
      case 'confirmed':
        statusMessage = 'Your appointment has been confirmed by the salon!';
        statusColor = '#28a745';
        break;
      case 'rejected':
        statusMessage = 'Unfortunately, your appointment has been rejected. Please contact us for more information.';
        statusColor = '#dc3545';
        break;
      case 'cancelled':
        statusMessage = 'Your appointment has been cancelled.';
        statusColor = '#ffc107';
        break;
      case 'completed':
        statusMessage = 'Thank you for visiting us! We hope to see you again soon.';
        statusColor = '#17a2b8';
        break;
      default:
        statusMessage = `Your appointment status has been updated to: ${newStatus}`;
        statusColor = '#6c757d';
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Appointment Status Update - ${newStatus.toUpperCase()}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${statusColor}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
            .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Appointment Status Update</h1>
            </div>
            <div class="content">
              <p>Dear ${customerName},</p>
              <p style="font-size: 16px; color: ${statusColor}; font-weight: bold;">${statusMessage}</p>
              
              <div class="details">
                <div class="detail-row">
                  <strong>Reference Number:</strong>
                  <span>${_id}</span>
                </div>
                <div class="detail-row">
                  <strong>Date:</strong>
                  <span>${appointmentDate}</span>
                </div>
                <div class="detail-row">
                  <strong>Time:</strong>
                  <span>${appointmentTime}</span>
                </div>
                <div class="detail-row">
                  <strong>Barber:</strong>
                  <span>${barber?.name || 'Not specified'}</span>
                </div>
                <div class="detail-row">
                  <strong>Branch:</strong>
                  <span>${branch?.name || 'Not specified'}</span>
                </div>
                <div class="detail-row">
                  <strong>Status:</strong>
                  <span style="color: ${statusColor}; font-weight: bold;">${newStatus.toUpperCase()}</span>
                </div>
              </div>

              <p>If you have any questions, please don't hesitate to contact us.</p>
            </div>
            <div class="footer">
              <p>This is an automated message, please do not reply to this email.</p>
              <p>&copy; 2024 Barber Shop. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('  Status update email sent to:', email);
    return { success: true };
  } catch (error) {
    console.error('  Email sending failed:', error);
    return { success: false, error: error.message };
  }
};

// Send payment confirmation email
export const sendPaymentConfirmation = async (appointmentData, paymentDetails) => {
  try {
    const transporter = createTransporter();
    
    const { customerName, email, totalPrice, _id } = appointmentData;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: '💳 Payment Confirmation - Barber Shop',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
            .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>  Payment Successful!</h1>
            </div>
            <div class="content">
              <p>Dear ${customerName},</p>
              <p>Your payment has been successfully processed.</p>
              
              <div class="details">
                <div class="detail-row">
                  <strong>Appointment Reference:</strong>
                  <span>${_id}</span>
                </div>
                <div class="detail-row">
                  <strong>Payment ID:</strong>
                  <span>${paymentDetails?.paymentIntentId || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <strong>Amount Paid:</strong>
                  <span style="color: #28a745; font-size: 18px; font-weight: bold;">£${totalPrice.toFixed(2)}</span>
                </div>
                <div class="detail-row">
                  <strong>Payment Method:</strong>
                  <span>Card</span>
                </div>
                <div class="detail-row">
                  <strong>Payment Date:</strong>
                  <span>${new Date().toLocaleDateString('en-GB')}</span>
                </div>
              </div>

              <p>Thank you for your payment! This email serves as your receipt.</p>
            </div>
            <div class="footer">
              <p>This is an automated message, please do not reply to this email.</p>
              <p>&copy; 2024 Barber Shop. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('  Payment confirmation email sent to:', email);
    return { success: true };
  } catch (error) {
    console.error('  Email sending failed:', error);
    return { success: false, error: error.message };
  }
};

export default {
  sendAppointmentConfirmation,
  sendAppointmentStatusUpdate,
  sendPaymentConfirmation
};