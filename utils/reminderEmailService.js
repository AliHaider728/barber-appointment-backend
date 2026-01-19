import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import renderEmailFromTemplate from './emailRenderer.js'

dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

//   OLD HARDCODED HTML (KEPT AS FALLBACK)  
const getReminderEmailHTML = (reminderDetails) => {
  const {
    customerName,
    bookingRef,
    branchName,
    branchAddress,
    barberName,
    services,
    date,
    time,
    duration,
    totalPrice,
    hoursUntilAppointment
  } = reminderDetails;

  const appointmentDate = new Date(date);
  const formattedDate = appointmentDate.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const servicesHTML = services
    .map(
      service => `
        <div class="service-item">
          <span>${service.name}</span>
          <strong>${service.price}</strong>
        </div>
      `
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #f4f4f4;
      color: #333;
    }
    .email-container {
      max-width: 600px;
      margin: 20px auto;
      background: #fff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
      padding: 40px 30px;
      text-align: center;
      color: #000;
    }
    .reminder-badge {
      background: rgba(0,0,0,0.15);
      display: inline-block;
      padding: 8px 20px;
      border-radius: 25px;
      margin-bottom: 15px;
      font-size: 13px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .header h1 {
      font-size: 32px;
      font-weight: 700;
      margin: 10px 0;
    }
    .hours-remaining {
      font-size: 20px;
      font-weight: 600;
      margin-top: 10px;
      background: rgba(0,0,0,0.1);
      display: inline-block;
      padding: 10px 25px;
      border-radius: 30px;
    }
    .content {
      padding: 30px;
    }
    .greeting {
      font-size: 16px;
      margin-bottom: 20px;
      line-height: 1.6;
    }
    .info-card {
      background: #f8f9fa;
      border-left: 4px solid #FFD700;
      padding: 25px;
      margin: 25px 0;
      border-radius: 8px;
    }
    .info-card h2 {
      font-size: 18px;
      margin-bottom: 20px;
      color: #000;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-row strong {
      color: #666;
      font-weight: 600;
      padding-right: 10px;
    }
    .info-row span {
      color: #333;
      text-align: right;
      flex: 1;
    }
    .services-section {
      margin: 25px 0;
    }
    .services-section h3 {
      font-size: 16px;
      margin-bottom: 15px;
      color: #000;
    }
    .service-item {
      display: flex;
      justify-content: space-between;
      padding: 12px;
      border-bottom: 1px dotted #ddd;
      background: #fafafa;
      margin-bottom: 8px;
      border-radius: 5px;
    }
    .service-item span {
      color: #333;
    }
    .service-item strong {
      color: #D4AF37;
      font-weight: 600;
    }
    .total-section {
      background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
      margin: 25px 0;
      padding: 25px;
      text-align: center;
      border-radius: 8px;
    }
    .total-label {
      font-size: 14px;
      margin-bottom: 5px;
      color: #000;
      opacity: 0.8;
    }
    .total-amount {
      font-size: 36px;
      font-weight: 700;
      color: #000;
    }
    .important-note {
      background: #fff3cd;
      border: 2px solid #ffc107;
      padding: 20px;
      margin: 25px 0;
      border-radius: 8px;
      text-align: center;
    }
    .important-note strong {
      color: #856404;
      font-size: 16px;
      display: block;
      margin-bottom: 10px;
    }
    .important-note p {
      color: #856404;
      font-size: 14px;
      margin: 0;
    }
    .cta-button {
      text-align: center;
      margin: 30px 0;
    }
    .cta-button a {
      display: inline-block;
      background: #000;
      color: #FFD700;
      padding: 15px 40px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: bold;
      font-size: 16px;
      transition: all 0.3s;
    }
    .footer {
      background: #000;
      padding: 30px;
      text-align: center;
      color: #999;
    }
    .footer-title {
      color: #FFD700;
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .footer p {
      margin: 8px 0;
      font-size: 13px;
      line-height: 1.6;
    }
    .footer-divider {
      margin: 20px 0;
      border-top: 1px solid #333;
      padding-top: 15px;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <div class="reminder-badge">
        APPOINTMENT REMINDER
      </div>
      <h1>Don't Forget Your Appointment!</h1>
      <div class="hours-remaining">In ${hoursUntilAppointment} Hour${hoursUntilAppointment !== 1 ? 's' : ''}</div>
    </div>

    <div class="content">
      <p class="greeting">
        Hi <strong>${customerName}</strong>,<br/><br/>
        This is a friendly reminder about your upcoming appointment at our barbershop. 
        We're excited to see you soon!
      </p>

      <div class="info-card">
        <h2>Your Appointment Details</h2>
        
        <div class="info-row">
          <strong>Branch: </strong>
          <span>${branchName}</span>
        </div>
        
        <div class="info-row">
          <strong>Address: </strong>
          <span>${branchAddress}</span>
        </div>
        
        <div class="info-row">
          <strong>Your Barber: </strong>
          <span>${barberName}</span>
        </div>
        
        <div class="info-row">
          <strong>Date: </strong>
          <span>${formattedDate}</span>
        </div>
        
        <div class="info-row">
          <strong>Time: </strong>
          <span>${time}</span>
        </div>
        
        <div class="info-row">
          <strong>Duration: </strong>
          <span>${duration} minutes</span>
        </div>
      </div>

      <div class="services-section">
        <h3>Services Booked</h3>
        ${servicesHTML}
      </div>

      <div class="total-section">
        <div class="total-label">Total Amount</div>
        <div class="total-amount">£${totalPrice.toFixed(2)}</div>
      </div>

      <div class="important-note">
        <strong>Important Reminder</strong>
        <p>Please arrive 5-10 minutes early. If you need to reschedule or cancel, please let us know as soon as possible.</p>
      </div>

      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <p style="font-size: 12px; color: #666; margin-bottom: 8px;">BOOKING REFERENCE</p>
        <p style="font-size: 18px; font-weight: bold; color: #000; letter-spacing: 2px; font-family: 'Courier New', monospace;">${bookingRef}</p>
      </div>

      <div class="cta-button">
        <a href="https://barber-appointment-six.vercel.app">View My Bookings</a>
      </div>

      <p style="margin-top: 25px; font-size: 14px; color: #666; text-align: center;">
        Looking forward to seeing you!
      </p>
    </div>

    <div class="footer">
      <div class="footer-title">Barber Shop</div>
      <p>Thank you for choosing us for your grooming needs.</p>
      <p>We're committed to providing you the best service.</p>
      
      <div class="footer-divider">
        <p>Need help? Contact us at: ${process.env.EMAIL_USER}</p>
        <p style="margin-top: 15px; font-size: 11px;">© ${new Date().getFullYear()} Barber Appointments. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
`;
};

//   NEW: UPDATED MAIN FUNCTION WITH DYNAMIC TEMPLATES  
export const sendAppointmentReminder = async (email, reminderDetails) => {
  try {
    console.log('📧 Sending reminder email to:', email);

    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      throw new Error('Email credentials not configured');
    }

    let emailHTML;
    let emailSubject;

    //   TRY TO USE DYNAMIC TEMPLATE FIRST  
    try {
      console.log('🎨 Attempting to use dynamic reminder template...');
      
      const templateResult = await renderEmailFromTemplate('reminder', {
        customerName: reminderDetails.customerName,
        bookingRef: reminderDetails.bookingRef,
        branchName: reminderDetails.branchName,
        branchAddress: reminderDetails.branchAddress,
        barberName: reminderDetails.barberName,
        services: reminderDetails.services,
        date: reminderDetails.date,
        time: reminderDetails.time,
        duration: reminderDetails.duration,
        totalPrice: reminderDetails.totalPrice,
        hoursUntilAppointment: reminderDetails.hoursUntilAppointment
      });

      emailHTML = templateResult.html;
      emailSubject = templateResult.subject;
      
      console.log('✅ Using dynamic reminder template from database');

    } catch (templateError) {
      //   FALLBACK TO HARDCODED TEMPLATE  
      console.warn('⚠️ Dynamic template failed, using fallback:', templateError.message);
      emailHTML = getReminderEmailHTML(reminderDetails);
      emailSubject = `Reminder: Your Appointment in ${reminderDetails.hoursUntilAppointment}h - Ref: ${reminderDetails.bookingRef}`;
      console.log('✅ Using hardcoded fallback template');
    }

    //   SEND EMAIL  
    const info = await transporter.sendMail({
      from: {
        name: 'Barber Shop - Reminder',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: emailSubject,
      html: emailHTML
    });

    console.log('✅ Reminder email sent:', info.messageId);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('❌ Reminder email failed:', error.message);
    return { success: false, error: error.message };
  }
};
 