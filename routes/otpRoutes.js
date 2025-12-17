import express from 'express';
import nodemailer from 'nodemailer';

const router = express.Router();

// In-memory OTP storage (production mein Redis/Database use karein)
const otpStore = new Map();

// ✅ FIXED: Consistent environment variable name
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD  // Changed from MAIL_APP_PASSWORD
  }
});

// ✅ Verify email configuration on startup
transporter.verify(function(error, success) {
  if (error) {
    console.error('❌ [EMAIL] Configuration error:', error.message);
    console.error('❌ [EMAIL] Check your EMAIL_USER and EMAIL_APP_PASSWORD in .env file');
  } else {
    console.log('✅ [EMAIL] Nodemailer is ready to send emails');
    console.log(`✅ [EMAIL] Using: ${process.env.EMAIL_USER}`);
  }
});

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ============================================
// ROUTE: Send OTP to Email
// ============================================
router.post('/send-otp', async (req, res) => {
  try {
    const { email, fullName } = req.body;

    console.log('[OTP] Send request received:', { email, fullName });

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email required' 
      });
    }

    // ✅ Check if email credentials are configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      console.error('❌ [OTP] Email credentials not configured in environment variables');
      return res.status(500).json({ 
        success: false,
        message: 'Email service not configured. Please contact administrator.' 
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiryTime = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP with expiry
    otpStore.set(email, {
      otp,
      expiryTime,
      fullName: fullName || 'User',
      verified: false
    });

    console.log(`[OTP] Generated for ${email}: ${otp} (expires in 10 min)`);

    // Email template
    const mailOptions = {
      from: `"Barber Appointment System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '✂️ Email Verification - OTP Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #D4AF37 0%, #F4D03F 100%); padding: 30px; text-align: center; }
            .header h1 { color: #000; margin: 0; font-size: 28px; }
            .content { padding: 40px 30px; text-align: center; }
            .otp-box { background-color: #f8f9fa; border: 2px dashed #D4AF37; border-radius: 8px; padding: 20px; margin: 30px 0; }
            .otp-code { font-size: 36px; font-weight: bold; color: #D4AF37; letter-spacing: 8px; margin: 10px 0; }
            .warning { color: #dc3545; font-size: 14px; margin-top: 20px; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #6c757d; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✂️ Email Verification</h1>
            </div>
            <div class="content">
              <h2>Hello ${fullName || 'User'}! 👋</h2>
              <p>Thank you for signing up with Barber Appointment System.</p>
              <p>Your One-Time Password (OTP) for email verification is:</p>
              
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              
              <p>Please enter this code to verify your email address.</p>
              <p class="warning">⚠️ This OTP will expire in 10 minutes.</p>
              <p style="font-size: 14px; color: #6c757d; margin-top: 30px;">
                If you didn't request this code, please ignore this email.
              </p>
            </div>
            <div class="footer">
              <p>Powered by TecnoSphere ✨</p>
              <p>© 2025 Barber Appointment System. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    // Send email
    await transporter.sendMail(mailOptions);

    console.log(`✅ [OTP] Email sent successfully to ${email}`);

    res.json({
      success: true,
      message: 'OTP sent successfully to your email'
    });

  } catch (error) {
    console.error('❌ [OTP] Send error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to send OTP: ' + error.message 
    });
  }
});

// ============================================
// ROUTE: Verify OTP
// ============================================
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    console.log('[OTP] Verify request:', { email, otp: otp ? '******' : 'missing' });

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and OTP required' 
      });
    }

    const storedData = otpStore.get(email);

    if (!storedData) {
      console.log(`❌ [OTP] No OTP found for ${email}`);
      return res.status(400).json({ 
        success: false,
        message: 'No OTP found for this email. Please request a new one.' 
      });
    }

    // Check if OTP expired
    if (Date.now() > storedData.expiryTime) {
      otpStore.delete(email);
      console.log(`❌ [OTP] Expired for ${email}`);
      return res.status(400).json({ 
        success: false,
        message: 'OTP has expired. Please request a new one.' 
      });
    }

    // Verify OTP
    if (storedData.otp !== otp.toString()) {
      console.log(`❌ [OTP] Invalid OTP for ${email}`);
      return res.status(400).json({ 
        success: false,
        message: 'Invalid OTP. Please try again.' 
      });
    }

    // Mark as verified
    storedData.verified = true;
    otpStore.set(email, storedData);

    console.log(`✅ [OTP] Verified successfully for ${email}`);

    res.json({
      success: true,
      message: 'OTP verified successfully'
    });

  } catch (error) {
    console.error('❌ [OTP] Verify error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Verification failed: ' + error.message 
    });
  }
});

// ============================================
// ROUTE: Resend OTP
// ============================================
router.post('/resend-otp', async (req, res) => {
  try {
    const { email, fullName } = req.body;

    console.log('[OTP] Resend request:', { email });

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email required' 
      });
    }

    // Check if email credentials are configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      console.error('❌ [OTP] Email credentials not configured');
      return res.status(500).json({ 
        success: false,
        message: 'Email service not configured. Please contact administrator.' 
      });
    }

    // Delete old OTP
    otpStore.delete(email);

    // Generate new OTP
    const otp = generateOTP();
    const expiryTime = Date.now() + 10 * 60 * 1000;

    otpStore.set(email, {
      otp,
      expiryTime,
      fullName: fullName || 'User',
      verified: false
    });

    console.log(`[OTP] New OTP generated for ${email}: ${otp}`);

    const mailOptions = {
      from: `"Barber Appointment System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '✂️ New OTP Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #D4AF37 0%, #F4D03F 100%); padding: 30px; text-align: center; }
            .header h1 { color: #000; margin: 0; font-size: 28px; }
            .content { padding: 40px 30px; text-align: center; }
            .otp-box { background-color: #f8f9fa; border: 2px dashed #D4AF37; border-radius: 8px; padding: 20px; margin: 30px 0; }
            .otp-code { font-size: 36px; font-weight: bold; color: #D4AF37; letter-spacing: 8px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✂️ New OTP Code</h1>
            </div>
            <div class="content">
              <h2>Hello ${fullName || 'User'}! 👋</h2>
              <p>Your new OTP code is:</p>
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              <p>⚠️ This OTP will expire in 10 minutes.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);

    console.log(`✅ [OTP] Resent successfully to ${email}`);

    res.json({
      success: true,
      message: 'New OTP sent successfully'
    });

  } catch (error) {
    console.error('❌ [OTP] Resend error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to resend OTP: ' + error.message 
    });
  }
});

// ============================================
// Helper Functions (for auth.js to import)
// ============================================

// Check if email is verified
export const isEmailVerified = (email) => {
  const storedData = otpStore.get(email);
  return storedData && storedData.verified;
};

// Clear OTP after successful signup
export const clearOTP = (email) => {
  otpStore.delete(email);
  console.log(`[OTP] Cleared for ${email}`);
};

// Get OTP store (for debugging)
export const getOTPStore = () => {
  return otpStore;
};

export default router;