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
      font-family: 'Georgia', 'Times New Roman', serif;
      background: #e1e1e1;
      color: #000;
      line-height: 1.6;
    }
    .email-container {
      max-width: 600px;
      margin: 40px auto;
      background: #fff;
      border-radius: 0;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    }
    .header {
      background: #000;
      padding: 50px 40px;
      text-align: center;
      color: #d4af37;
      border-bottom: 3px solid #d4af37;
    }
    .reminder-badge {
      background: #d4af37;
      color: #000;
      display: inline-block;
      padding: 10px 30px;
      margin-bottom: 20px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .header h1 {
      font-size: 28px;
      font-weight: 400;
      margin: 15px 0;
      letter-spacing: 1px;
    }
    .hours-remaining {
      font-size: 18px;
      font-weight: 300;
      margin-top: 15px;
      color: #d4af37;
      border-top: 1px solid #d4af37;
      border-bottom: 1px solid #d4af37;
      display: inline-block;
      padding: 12px 35px;
      letter-spacing: 1px;
    }
    .content {
      padding: 40px;
      background: #fff;
    }
    .greeting {
      font-size: 15px;
      margin-bottom: 30px;
      line-height: 1.8;
      color: #000;
    }
    .info-card {
      background: #fff;
      border: 2px solid #e1e1e1;
      padding: 30px;
      margin: 30px 0;
    }
    .info-card h2 {
      font-size: 16px;
      margin-bottom: 25px;
      color: #000;
      text-transform: uppercase;
      letter-spacing: 2px;
      font-weight: 400;
      border-bottom: 1px solid #d4af37;
      padding-bottom: 10px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 15px 0;
      border-bottom: 1px solid #e1e1e1;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-row strong {
      color: #000;
      font-weight: 600;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-size: 12px;
    }
    .info-row span {
      color: #000;
      text-align: right;
      font-size: 14px;
    }
    .services-section {
      margin: 30px 0;
    }
    .services-section h3 {
      font-size: 14px;
      margin-bottom: 20px;
      color: #000;
      text-transform: uppercase;
      letter-spacing: 2px;
      font-weight: 400;
      border-bottom: 1px solid #d4af37;
      padding-bottom: 10px;
    }
    .service-item {
      display: flex;
      justify-content: space-between;
      padding: 15px;
      border-bottom: 1px solid #e1e1e1;
      background: #fff;
    }
    .service-item:last-child {
      border-bottom: 2px solid #e1e1e1;
    }
    .service-item span {
      color: #000;
      font-size: 14px;
    }
    .service-item strong {
      color: #d4af37;
      font-weight: 600;
      font-size: 14px;
    }
    .total-section {
      background: #000;
      margin: 30px 0;
      padding: 35px;
      text-align: center;
      border-top: 3px solid #d4af37;
      border-bottom: 3px solid #d4af37;
    }
    .total-label {
      font-size: 12px;
      margin-bottom: 10px;
      color: #d4af37;
      text-transform: uppercase;
      letter-spacing: 2px;
      font-weight: 400;
    }
    .total-amount {
      font-size: 42px;
      font-weight: 300;
      color: #d4af37;
      letter-spacing: 2px;
    }
    .important-note {
      background: #fff;
      border: 2px solid #000;
      padding: 25px;
      margin: 30px 0;
      text-align: center;
    }
    .important-note strong {
      color: #000;
      font-size: 14px;
      display: block;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 2px;
      font-weight: 600;
    }
    .important-note p {
      color: #000;
      font-size: 13px;
      margin: 0;
      line-height: 1.6;
    }
    .booking-ref-section {
      background: #e1e1e1;
      padding: 25px;
      text-align: center;
      margin: 30px 0;
      border-left: 4px solid #d4af37;
    }
    .booking-ref-section p:first-child {
      font-size: 11px;
      color: #000;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
      font-weight: 600;
    }
    .booking-ref-section p:last-child {
      font-size: 20px;
      font-weight: 600;
      color: #000;
      letter-spacing: 3px;
      font-family: 'Courier New', monospace;
    }
    .cta-button {
      text-align: center;
      margin: 35px 0;
    }
    .cta-button a {
      display: inline-block;
      background: #d4af37;
      color: #000;
      padding: 18px 50px;
      text-decoration: none;
      font-weight: 600;
      font-size: 13px;
      transition: all 0.3s;
      text-transform: uppercase;
      letter-spacing: 2px;
      border: 2px solid #d4af37;
    }
    .cta-button a:hover {
      background: #000;
      color: #d4af37;
    }
    .closing-text {
      margin-top: 30px;
      font-size: 14px;
      color: #000;
      text-align: center;
      font-style: italic;
    }
    .footer {
      background: #000;
      padding: 40px;
      text-align: center;
      color: #e1e1e1;
      border-top: 3px solid #d4af37;
    }
    .footer-title {
      color: #d4af37;
      font-size: 20px;
      font-weight: 400;
      margin-bottom: 15px;
      letter-spacing: 3px;
      text-transform: uppercase;
    }
    .footer p {
      margin: 10px 0;
      font-size: 13px;
      line-height: 1.8;
      color: #e1e1e1;
    }
    .footer-divider {
      margin: 25px 0;
      border-top: 1px solid #d4af37;
      padding-top: 20px;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <div class="reminder-badge">Appointment Reminder</div>
      <h1>Your Appointment Awaits</h1>
      <div class="hours-remaining">In ${hoursUntilAppointment} Hour${hoursUntilAppointment !== 1 ? 's' : ''}</div>
    </div>

    <div class="content">
      <p class="greeting">
        Dear <strong>${customerName}</strong>,<br/><br/>
        This is a courteous reminder about your upcoming appointment at our establishment. 
        We look forward to serving you with excellence.
      </p>

      <div class="info-card">
        <h2>Appointment Details</h2>
        
        <div class="info-row">
          <strong>Branch</strong>
          <span>${branchName}</span>
        </div>
        
        <div class="info-row">
          <strong>Address</strong>
          <span>${branchAddress}</span>
        </div>
        
        <div class="info-row">
          <strong>Your Barber</strong>
          <span>${barberName}</span>
        </div>
        
        <div class="info-row">
          <strong>Date</strong>
          <span>${formattedDate}</span>
        </div>
        
        <div class="info-row">
          <strong>Time</strong>
          <span>${time}</span>
        </div>
        
        <div class="info-row">
          <strong>Duration</strong>
          <span>${duration} minutes</span>
        </div>
      </div>

      <div class="services-section">
        <h3>Services Reserved</h3>
        ${servicesHTML}
      </div>

      <div class="total-section">
        <div class="total-label">Total Amount</div>
        <div class="total-amount">£${totalPrice.toFixed(2)}</div>
      </div>

      <div class="important-note">
        <strong>Please Note</strong>
        <p>We kindly request your arrival 5-10 minutes prior to your scheduled time. Should you need to reschedule or cancel, please inform us at your earliest convenience.</p>
      </div>

      <div class="booking-ref-section">
        <p>Booking Reference</p>
        <p>${bookingRef}</p>
      </div>

      <div class="cta-button">
        <a href="https://barber-appointment-six.vercel.app">View My Bookings</a>
      </div>

      <p class="closing-text">
        We look forward to welcoming you.
      </p>
    </div>

    <div class="footer">
      <div class="footer-title">Barber Shop</div>
      <p>Thank you for entrusting us with your grooming requirements.</p>
      <p>We are dedicated to delivering exceptional service.</p>
      
      <div class="footer-divider">
        <p>For assistance, please contact: ${process.env.EMAIL_USER}</p>
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