import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

// Verify transporter configuration
transporter.verify((error) => {
  if (error) {
    console.error('Email transporter verification failed:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});

// Booking confirmation email HTML template
const getBookingEmailHTML = (bookingDetails) => {
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
    totalPrice
  } = bookingDetails;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #f4f4f4;
      color: #333;
      line-height: 1.6;
    }
    .email-container {
      max-width: 600px;
      margin: 20px auto;
      background: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0,0,0,0.08);
    }
    .header {
      background: #D4AF37;
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      font-size: 26px;
      color: #000;
      letter-spacing: 1px;
    }
    .content {
      padding: 30px;
    }
    .greeting {
      font-size: 16px;
      margin-bottom: 20px;
    }
    .booking-ref {
      background: #f8f8f8;
      border: 1px solid #e0e0e0;
      padding: 15px;
      text-align: center;
      font-size: 18px;
      font-weight: 600;
      margin: 20px 0;
      letter-spacing: 1px;
    }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: #D4AF37;
      margin: 25px 0 15px;
      border-bottom: 2px solid #D4AF37;
      padding-bottom: 6px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #eee;
    }
    .detail-label {
      font-weight: 600;
      color: #555;
    }
    .detail-value {
      text-align: right;
    }
    .services-list {
      background: #fafafa;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 15px;
    }
    .service-item {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px dashed #ddd;
    }
    .service-item:last-child {
      border-bottom: none;
    }
    .total-box {
      background: #D4AF37;
      color: #000;
      text-align: center;
      padding: 15px;
      font-size: 20px;
      font-weight: 700;
      margin: 25px 0;
      border-radius: 6px;
    }
    .important-box {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin-top: 20px;
      border-radius: 4px;
    }
    .important-box h3 {
      font-size: 15px;
      margin-bottom: 10px;
      color: #856404;
    }
    .important-box ul {
      margin-left: 18px;
      color: #856404;
    }
    .important-box li {
      margin: 6px 0;
    }
    .footer {
      background: #f8f8f8;
      text-align: center;
      padding: 20px;
      font-size: 13px;
      color: #666;
      border-top: 1px solid #e0e0e0;
    }
    @media (max-width: 600px) {
      .detail-row {
        flex-direction: column;
      }
      .detail-value {
        text-align: left;
        margin-top: 4px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>Booking Confirmation</h1>
    </div>

    <div class="content">
      <p class="greeting">Dear <strong>${customerName}</strong>,</p>
      <p>Your appointment has been successfully confirmed. Below are the details of your booking.</p>

      <div class="booking-ref">
        Booking Reference: ${bookingRef}
      </div>

      <h2 class="section-title">Appointment Details</h2>

      <div class="detail-row"><span class="detail-label">Branch</span><span class="detail-value">${branchName}</span></div>
      <div class="detail-row"><span class="detail-label">Address</span><span class="detail-value">${branchAddress}</span></div>
      <div class="detail-row"><span class="detail-label">Barber</span><span class="detail-value">${barberName}</span></div>
      <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${new Date(date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
      <div class="detail-row"><span class="detail-label">Time</span><span class="detail-value">${time}</span></div>
      <div class="detail-row"><span class="detail-label">Duration</span><span class="detail-value">${duration} minutes</span></div>

      <h2 class="section-title">Services</h2>
      <div class="services-list">
        ${services.map(service => `
          <div class="service-item">
            <span>${service.name}</span>
            <span>${service.price}</span>
          </div>
        `).join('')}
      </div>

      <div class="total-box">
        Total Amount: £${totalPrice.toFixed(2)}
      </div>

      <div class="important-box">
        <h3>Important Information</h3>
        <ul>
          <li>Please arrive at least 5 minutes before your appointment</li>
          <li>Cancellations or rescheduling require 24 hours notice</li>
          <li>Please keep this email for your records</li>
          <li>Payment will be made at the salon</li>
        </ul>
      </div>
    </div>

    <div class="footer">
      <p>Thank you for choosing our services.</p>
      <p>Contact: ${process.env.EMAIL_USER}</p>
      <p>This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
`;
};

// Send booking confirmation email
export const sendBookingConfirmation = async (email, bookingDetails) => {
  try {
    console.log('Preparing to send booking confirmation email:', email);

    const mailOptions = {
      from: {
        name: 'Barber Appointments',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: `Booking Confirmation - Ref: ${bookingDetails.bookingRef}`,
      html: getBookingEmailHTML(bookingDetails),
      text: `
Dear ${bookingDetails.customerName},

Your appointment has been confirmed.

Booking Reference: ${bookingDetails.bookingRef}

Branch: ${bookingDetails.branchName}
Barber: ${bookingDetails.barberName}
Date: ${new Date(bookingDetails.date).toLocaleDateString('en-GB')}
Time: ${bookingDetails.time}
Duration: ${bookingDetails.duration} minutes
Total: £${bookingDetails.totalPrice.toFixed(2)}

Thank you for choosing our services.
      `.trim()
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email sending failed:', error);
    return { success: false, error: error.message };
  }
};

export default { sendBookingConfirmation };
