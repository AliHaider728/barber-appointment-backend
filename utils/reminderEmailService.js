import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

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
      padding-right: 10px; /* Added padding to separate label from value */
    }
    .info-row span {
      color: #333;
      text-align: right;
      flex: 1; /* Ensures value takes remaining space */
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
    svg {
      display: inline-block;
      vertical-align: middle;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <!-- Header with Reminder Badge -->
    <div class="header">
      <div class="reminder-badge">
        <svg style="width: 16px; height: 16px; margin-right: 8px; vertical-align: middle;" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        APPOINTMENT REMINDER
      </div>
      <h1>Don't Forget Your Appointment!</h1>
      <div class="hours-remaining">In ${hoursUntilAppointment} Hour${hoursUntilAppointment !== 1 ? 's' : ''}</div>
    </div>

    <!-- Main Content -->
    <div class="content">
      <p class="greeting">
        Hi <strong>${customerName}</strong>,<br/><br/>
        This is a friendly reminder about your upcoming appointment at our barbershop. 
        We're excited to see you soon!
      </p>

      <!-- Appointment Details Card -->
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

      <!-- Services Booked -->
      <div class="services-section">
        <h3>
          <svg style="width: 16px; height: 16px; margin-right: 8px; vertical-align: middle;" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 21C7.65685 21 9 19.6569 9 18C9 16.3431 7.65685 15 6 15C4.34315 15 3 16.3431 3 18C3 19.6569 4.34315 21 6 21ZM6 21L13.8586 13.1414M18 9C19.6569 9 21 7.65685 21 6C21 4.34315 19.6569 3 18 3C16.3431 3 15 4.34315 15 6C15 7.65685 16.3431 9 18 9ZM18 9L13.8586 13.1414M13.8586 13.1414L20.424 19.7065" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Services Booked
        </h3>
        ${servicesHTML}
      </div>

      <!-- Total Amount -->
      <div class="total-section">
        <div class="total-label">Total Amount</div>
        <div class="total-amount">£${totalPrice.toFixed(2)}</div>
      </div>

      <!-- Important Note -->
      <div class="important-note">
        <strong>
          <svg style="width: 16px; height: 16px; margin-right: 8px; vertical-align: middle;" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#856404" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Important Reminder
        </strong>
        <p>Please arrive 5-10 minutes early. If you need to reschedule or cancel, please let us know as soon as possible.</p>
      </div>

      <!-- Booking Reference -->
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <p style="font-size: 12px; color: #666; margin-bottom: 8px;">BOOKING REFERENCE</p>
        <p style="font-size: 18px; font-weight: bold; color: #000; letter-spacing: 2px; font-family: 'Courier New', monospace;">${bookingRef}</p>
      </div>

      <!-- CTA Button -->
      <div class="cta-button">
        <a href="https://barber-appointment-six.vercel.app">View My Bookings</a>
      </div>

      <p style="margin-top: 25px; font-size: 14px; color: #666; text-align: center;">
        Looking forward to seeing you!
      </p>
    </div>

    <!-- Footer -->
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

export const sendAppointmentReminder = async (email, reminderDetails) => {
  try {
    console.log('📧 Sending reminder email to:', email);

    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      throw new Error('Email credentials not configured');
    }

    const info = await transporter.sendMail({
      from: {
        name: 'Barber Shop - Reminder',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: `Reminder: Your Appointment in ${reminderDetails.hoursUntilAppointment}h - Ref: ${reminderDetails.bookingRef}`,
      html: getReminderEmailHTML(reminderDetails)
    });

    console.log('✅ Reminder email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Reminder email failed:', error.message);
    return { success: false, error: error.message };
  }
};