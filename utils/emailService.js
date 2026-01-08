import nodemailer from 'nodemailer';

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
    }
    .header {
      background: #D4AF37;
      padding: 25px;
      text-align: center;
      font-size: 24px;
      font-weight: 700;
    }
    .content {
      padding: 25px;
    }
    .booking-ref {
      background: #f8f8f8;
      padding: 15px;
      margin: 20px 0;
      text-align: center;
      font-weight: 600;
    }
    .row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .services div {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
    }
    .total {
      background: #D4AF37;
      margin: 20px 0;
      padding: 15px;
      text-align: center;
      font-size: 18px;
      font-weight: 700;
    }
    .footer {
      background: #f8f8f8;
      padding: 15px;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">Booking Confirmation</div>

    <div class="content">
      <p>Dear <strong>${customerName}</strong>,</p>
      <p>Your appointment has been successfully confirmed.</p>

      <div class="booking-ref">
        Booking Reference: ${bookingRef}
      </div>

      <div class="row"><span>Branch</span><span>${branchName}</span></div>
      <div class="row"><span>Address</span><span>${branchAddress}</span></div>
      <div class="row"><span>Barber</span><span>${barberName}</span></div>
      <div class="row"><span>Date</span><span>${new Date(date).toLocaleDateString('en-GB')}</span></div>
      <div class="row"><span>Time</span><span>${time}</span></div>
      <div class="row"><span>Duration</span><span>${duration} minutes</span></div>

      <h3 style="margin-top:20px;">Services</h3>
      <div class="services">
        ${services.map(s => `
          <div>
            <span>${s.name}</span>
            <span>${s.price}</span>
          </div>
        `).join('')}
      </div>

      <div class="total">
        Total Amount: £${totalPrice.toFixed(2)}
      </div>
    </div>

    <div class="footer">
      <p>This is an automated email. Please do not reply.</p>
      <p>Contact: ${process.env.EMAIL_USER}</p>
    </div>
  </div>
</body>
</html>
`;
};

// ✅ NAMED EXPORT ONLY (NO DEFAULT EXPORT)
export const sendBookingConfirmation = async (email, bookingDetails) => {
  try {
    const info = await transporter.sendMail({
      from: {
        name: 'Barber Appointments',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: `Booking Confirmation - Ref: ${bookingDetails.bookingRef}`,
      html: getBookingEmailHTML(bookingDetails)
    });

    console.log('Email sent:', info.messageId);
    return { success: true };
  } catch (error) {
    console.error('Email error:', error);
    return { success: false, error: error.message };
  }
};
