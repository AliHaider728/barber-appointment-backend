import express from 'express';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const router = express.Router();

// In-memory OTP storage (production mein database)
const otpStore = new Map();

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Gmail address
    pass: process.env.EMAIL_APP_PASSWORD // Gmail App Password
  }
});

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ROUTE: Send OTP to email
router.post('/send-otp', async (req, res) => {
  try {
    const { email, fullName } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email required' });
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

    console.log(`[OTP] Generated for ${email}: ${otp}`);

    // Email template
    const mailOptions = {
      from: `"Barber Appointment" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Email Verification - OTP Code',
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
              <h1>  Email Verification</h1>
            </div>
            <div class="content">
              <h2>Hello ${fullName || 'User'}!</h2>
              <p>Thank you for signing up with Barber Appointment System.</p>
              <p>Your One-Time Password (OTP) for email verification is:</p>
              
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              
              <p>Please enter this code to verify your email address.</p>
              <p class="warning">  This OTP will expire in 10 minutes.</p>
              <p style="font-size: 14px; color: #6c757d; margin-top: 30px;">
                If you didn't request this code, please ignore this email.
              </p>
            </div>
            <div class="footer">
              <p>Powered by TecnoSphere</p>
              <p>© 2025 Barber Appointment System. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    // Send email
    await transporter.sendMail(mailOptions);

    console.log(`[OTP] Email sent to ${email}`);

    res.json({
      success: true,
      message: 'OTP sent successfully to your email'
    });

  } catch (error) {
    console.error('[OTP] Send error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to send OTP: ' + error.message 
    });
  }
});

// ROUTE: Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and OTP required' 
      });
    }

    const storedData = otpStore.get(email);

    if (!storedData) {
      return res.status(400).json({ 
        success: false,
        message: 'No OTP found for this email. Please request a new one.' 
      });
    }

    // Check if OTP expired
    if (Date.now() > storedData.expiryTime) {
      otpStore.delete(email);
      return res.status(400).json({ 
        success: false,
        message: 'OTP has expired. Please request a new one.' 
      });
    }

    // Verify OTP
    if (storedData.otp !== otp.toString()) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid OTP. Please try again.' 
      });
    }

    // Mark as verified
    storedData.verified = true;
    otpStore.set(email, storedData);

    console.log(`[OTP] Verified successfully for ${email}`);

    res.json({
      success: true,
      message: 'OTP verified successfully'
    });

  } catch (error) {
    console.error('[OTP] Verify error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Verification failed: ' + error.message 
    });
  }
});

// ROUTE: Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { email, fullName } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email required' });
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

    console.log(`[OTP] Resent for ${email}: ${otp}`);

    const mailOptions = {
      from: `"Barber Appointment" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Email Verification - New OTP Code',
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
              <h1>  New OTP Code</h1>
            </div>
            <div class="content">
              <h2>Hello ${fullName || 'User'}!</h2>
              <p>Your new OTP code is:</p>
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              <p>  This OTP will expire in 10 minutes.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'New OTP sent successfully'
    });

  } catch (error) {
    console.error('[OTP] Resend error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to resend OTP: ' + error.message 
    });
  }
});

// Helper function to check if email is verified
export const isEmailVerified = (email) => {
  const storedData = otpStore.get(email);
  return storedData && storedData.verified;
};

// Helper function to clear OTP after successful signup
export const clearOTP = (email) => {
  otpStore.delete(email);
};

export default router;