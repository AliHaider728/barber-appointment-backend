import dotenv from 'dotenv';
//   dotenv MUST be loaded first

dotenv.config();

import express from 'express';
import nodemailer from 'nodemailer';

const router = express.Router();

// In-memory OTP storage (Production: Redis / DB recommended)
const otpStore = new Map();

 
// Email Transporter Setup
 

//   Consistent environment variable names
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_APP_PASSWORD,
  },
});

//   Verify email configuration on startup
transporter.verify((error) => {
  if (error) {
    console.error('  [EMAIL] Configuration error:', error.message);
    console.error('  [EMAIL] Check EMAIL_USER & EMAIL_APP_PASSWORD');
  } else {
    console.log('  [EMAIL] Nodemailer is ready');
    console.log(`  [EMAIL] Using account: ${EMAIL_USER}`);
  }
});

 
// Helpers
 

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const checkEmailEnv = (res) => {
  if (!EMAIL_USER || !EMAIL_APP_PASSWORD) {
    console.error('  [OTP] Email credentials not configured');
    res.status(500).json({
      success: false,
      message: 'Email service not configured. Please contact administrator.',
    });
    return false;
  }
  return true;
};
 
 
// ROUTE: Send OTP
 

router.post('/send-otp', async (req, res) => {
  try {
    const { email, fullName } = req.body;

    console.log('[OTP] Send request:', { email, fullName });

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email required' });
    }

    if (!checkEmailEnv(res)) return;

    const otp = generateOTP();
    const expiryTime = Date.now() + 2 * 60 * 1000; // 2 minutes

    otpStore.set(email, {
      otp,
      expiryTime,
      fullName: fullName || 'User',
      verified: false,
    });

    console.log(`[OTP] Generated for ${email}: ${otp}`);

    const mailOptions = {
      from: `"Barber Appointment System" <${EMAIL_USER}>`,
      to: email,
      subject: '  Email Verification - OTP Code',
      html: `
        <h2>Hello ${fullName || 'User'} 👋</h2>
        <p>Your OTP code is:</p>
        <h1 style="letter-spacing:8px;">${otp}</h1>
        <p>This code will expire in 10 minutes.</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    console.log(`  [OTP] Email sent to ${email}`);

    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('  [OTP] Send error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

 
// ROUTE: Verify OTP
 

router.post('/verify-otp', (req, res) => {
  try {
    const { email, otp } = req.body;

    console.log('[OTP] Verify request:', { email });

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP required' });
    }

    const data = otpStore.get(email);

    if (!data) {
      return res.status(400).json({ success: false, message: 'OTP not found' });
    }

    if (Date.now() > data.expiryTime) {
      otpStore.delete(email);
      return res.status(400).json({ success: false, message: 'OTP expired' });
    }

    if (data.otp !== otp.toString()) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    data.verified = true;
    otpStore.set(email, data);

    console.log(`  [OTP] Verified: ${email}`);

    res.json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    console.error('  [OTP] Verify error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

 
// ROUTE: Resend OTP
 

router.post('/resend-otp', async (req, res) => {
  try {
    const { email, fullName } = req.body;

    console.log('[OTP] Resend request:', { email });

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email required' });
    }

    if (!checkEmailEnv(res)) return;

    otpStore.delete(email);

    const otp = generateOTP();
    const expiryTime = Date.now() + 10 * 60 * 1000;

    otpStore.set(email, {
      otp,
      expiryTime,
      fullName: fullName || 'User',
      verified: false,
    });

    const mailOptions = {
      from: `"Barber Appointment System" <${EMAIL_USER}>`,
      to: email,
      subject: '  New OTP Code',
      html: `<h2>Your new OTP is: <b>${otp}</b></h2>`,
    };

    await transporter.sendMail(mailOptions);

    console.log(`  [OTP] Resent to ${email}`);

    res.json({ success: true, message: 'New OTP sent successfully' });
  } catch (error) {
    console.error('  [OTP] Resend error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

 
// Helper Exports
 

export const isEmailVerified = (email) => {
  const data = otpStore.get(email);
  return data && data.verified;
};

export const clearOTP = (email) => {
  otpStore.delete(email);
};

export default router;
