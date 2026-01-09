import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

transporter.verify((error) => {
  if (error) {
    console.error('Email transporter failed:', error);
  } else {
    console.log('Email server ready');
  }
});

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
    totalPrice,
    paymentStatus = 'Pending'
  } = bookingDetails;

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
      background: #D4AF37;
      padding: 30px;
      text-align: center;
      color: #000;
    }
    .header h1 {
      font-size: 28px;
      font-weight: 700;
      margin: 0;
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
      padding: 20px;
      margin: 20px 0;
      text-align: center;
      border-radius: 8px;
      border: 2px dashed #D4AF37;
    }
    .booking-ref strong {
      font-size: 24px;
      color: #D4AF37;
    }
    .row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #eee;
    }
    .row:last-child {
      border-bottom: none;
    }
    .row strong {
      color: #666;
      font-weight: 600;
    }
    .services-section {
      margin: 25px 0;
    }
    .services-section h3 {
      margin-bottom: 15px;
      color: #333;
    }
    .service-item {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px dotted #ddd;
    }
    .total {
      background: #D4AF37;
      margin: 25px 0;
      padding: 20px;
      text-align: center;
      border-radius: 8px;
    }
    .total-amount {
      font-size: 32px;
      font-weight: 700;
      color: #000;
    }
    .payment-status {
      background: #fff3cd;
      border: 2px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 8px;
      text-align: center;
    }
    .payment-status strong {
      color: #856404;
      font-size: 18px;
    }
    .footer {
      background: #f8f8f8;
      padding: 20px;
      text-align: center;
      font-size: 13px;
      color: #666;
    }
    .footer p {
      margin: 5px 0;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>Booking Confirmed!</h1>
    </div>

    <div class="content">
      <p class="greeting">Dear <strong>${customerName}</strong>,</p>
      <p>Your barber appointment has been successfully confirmed. We look forward to seeing you!</p>

      <div class="booking-ref">
        <p style="margin-bottom:10px;">Booking Reference</p>
        <strong>${bookingRef}</strong>
      </div>

      <div class="row">
        <strong>Branch:</strong>
        <span>${branchName}</span>
      </div>
      <div class="row">
        <strong>Address:</strong>
        <span>${branchAddress}</span>
      </div>
      <div class="row">
        <strong>Your Barber:</strong>
        <span>${barberName}</span>
      </div>
      <div class="row">
        <strong>Date:</strong>
        <span>${new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>
      <div class="row">
        <strong>Time:</strong>
        <span>${time}</span>
      </div>
      <div class="row">
        <strong>Duration:</strong>
        <span>${duration} minutes</span>
      </div>

      <div class="services-section">
        <h3>Services Booked</h3>
        ${services.map(s => `
          <div class="service-item">
            <span>${s.name}</span>
            <strong>${s.price}</strong>
          </div>
        `).join('')}
      </div>

      <div class="total">
        <p style="font-size:16px; margin-bottom:10px;">Total Amount</p>
        <div class="total-amount">£${totalPrice.toFixed(2)}</div>
      </div>

      <div class="payment-status">
        <strong>Payment Status: ${paymentStatus}</strong>
        <p style="margin-top:10px; color:#856404;">Please bring cash or card to complete payment at the salon.</p>
      </div>

      <p style="margin-top:25px; font-size:14px; color:#666;">
        If you need to reschedule or cancel, please contact us as soon as possible.
      </p>
    </div>

    <div class="footer">
      <p><strong>This is an automated confirmation email.</strong></p>
      <p>For inquiries, contact us at: ${process.env.EMAIL_USER}</p>
      <p>© 2026 Barber Appointments. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;
};

export const sendBookingConfirmation = async (email, bookingDetails) => {
  try {
    console.log('📧 Attempting to send email to:', email);
    console.log('📧 Email config:', {
      user: process.env.EMAIL_USER ? 'Set ✅' : 'Missing ❌',
      pass: process.env.EMAIL_APP_PASSWORD ? 'Set ✅' : 'Missing ❌'
    });

    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      throw new Error('Email credentials not configured in environment variables');
    }

    const info = await transporter.sendMail({
      from: {
        name: 'Barber Appointments',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: `Booking Confirmed - Ref: ${bookingDetails.bookingRef}`,
      html: getBookingEmailHTML(bookingDetails)
    });
 
    console.log('✅ Email sent successfully:', info.messageId);
    console.log('✅ Accepted recipients:', info.accepted);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
    console.error('❌ Full error:', error);
    return { success: false, error: error.message };
  }
};