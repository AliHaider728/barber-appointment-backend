// routes/otpRoutes.js
import express from 'express';
import nodemailer from 'nodemailer';

const router = express.Router();

const otpStore = new Map();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

router.post('/send-otp', async (req, res) => {
  try {
    const { email, fullName } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email required' 
      });
    }

    const otp = generateOTP();
    const expiryTime = Date.now() + 10 * 60 * 1000;

    otpStore.set(email, {
      otp,
      expiryTime,
      fullName: fullName || 'User',
      verified: false
    });

    const mailOptions = {
      from: `"Barber Appointment System" <${process.env.EMAIL_USER}>`,
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
              <h1>Email Verification</h1>
            </div>
            <div class="content">
              <h2>Hello ${fullName || 'User'}</h2>
              <p>Thank you for signing up with Barber Appointment System.</p>
              <p>Your One-Time Password (OTP) for email verification is:</p>
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              <p>Please enter this code to verify your email address.</p>
              <p class="warning">This OTP will expire in 10 minutes.</p>
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

    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'OTP sent successfully to your email'
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Failed to send OTP: ' + error.message 
    });
  }
});

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

    if (Date.now() > storedData.expiryTime) {
      otpStore.delete(email);
      return res.status(400).json({ 
        success: false,
        message: 'OTP has expired. Please request a new one.' 
      });
    }

    if (storedData.otp !== otp.toString()) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid OTP. Please try again.' 
      });
    }

    storedData.verified = true;
    otpStore.set(email, storedData);

    res.json({
      success: true,
      message: 'OTP verified successfully'
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Verification failed: ' + error.message 
    });
  }
});

router.post('/resend-otp', async (req, res) => {
  try {
    const { email, fullName } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email required' 
      });
    }

    otpStore.delete(email);

    const otp = generateOTP();
    const expiryTime = Date.now() + 10 * 60 * 1000;

    otpStore.set(email, {
      otp,
      expiryTime,
      fullName: fullName || 'User',
      verified: false
    });

    const mailOptions = {
      from: `"Barber Appointment System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'New OTP Code',
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
              <h1>New OTP Code</h1>
            </div>
            <div class="content">
              <h2>Hello ${fullName || 'User'}</h2>
              <p>Your new OTP code is:</p>
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              <p>This OTP will expire in 10 minutes.</p>
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
    res.status(500).json({ 
      success: false,
      message: 'Failed to resend OTP: ' + error.message 
    });
  }
});

export const isEmailVerified = (email) => {
  const storedData = otpStore.get(email);
  return storedData && storedData.verified;
};

export const clearOTP = (email) => {
  otpStore.delete(email);
};

export default router;