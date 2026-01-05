import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load env vars if not already loaded
dotenv.config();

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

// Verify transporter configuration on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email transporter error:', error.message);
    console.error('   Check EMAIL_USER and EMAIL_APP_PASSWORD in .env');
  } else {
    console.log('✅ Email server is ready');
    console.log(`   Using: ${process.env.EMAIL_USER}`);
  }
});

// Generate 6-digit OTP
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP Email for Admin Creation
export const sendOTPEmail = async (email, otp, fullName) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    throw new Error('Email credentials not configured in environment variables');
  }

  const mailOptions = {
    from: `"Barbershop Admin" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: '🔐 Verify Your Admin Account - OTP Code',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #D4AF37 0%, #f6d365 100%);
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            color: #000000;
            margin: 0;
            font-size: 28px;
          }
          .content {
            padding: 40px 30px;
            text-align: center;
          }
          .otp-box {
            background-color: #f8f9fa;
            border: 2px dashed #D4AF37;
            border-radius: 8px;
            padding: 20px;
            margin: 30px 0;
          }
          .otp-code {
            font-size: 36px;
            font-weight: bold;
            color: #D4AF37;
            letter-spacing: 8px;
            margin: 10px 0;
          }
          .message {
            color: #666666;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 20px;
          }
          .warning {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            text-align: left;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #999999;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✂️ Barbershop Admin Panel</h1>
          </div>
          
          <div class="content">
            <h2>Hello ${fullName}! 👋</h2>
            <p class="message">
              Welcome to the Barbershop Admin Panel! Your account has been created.
              Please verify your email address using the OTP code below:
            </p>
            
            <div class="otp-box">
              <p style="margin: 0; color: #666; font-size: 14px;">Your OTP Code</p>
              <div class="otp-code">${otp}</div>
              <p style="margin: 0; color: #666; font-size: 14px;">Valid for 10 minutes</p>
            </div>
            
            <div class="warning">
              <strong>⚠️ Security Note:</strong> This OTP is confidential. Do not share it with anyone.
              Our team will never ask for your OTP.
            </div>
            
            <p class="message">
              If you did not request this, please ignore this email or contact support immediately.
            </p>
          </div>
          
          <div class="footer">
            <p>© 2025 Barbershop Admin Panel. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('✅ OTP email sent successfully to:', email);
    return true;
  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
    throw new Error('Failed to send verification email: ' + error.message);
  }
};

// Send Welcome Email After Verification
export const sendWelcomeEmail = async (email, fullName, role, assignedBranch) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.warn('⚠️ Email credentials not configured, skipping welcome email');
    return false;
  }

  const roleName = role === 'main_admin' ? 'Main Administrator' : 'Branch Administrator';
  const branchInfo = assignedBranch 
    ? `<p><strong>Assigned Branch:</strong> ${assignedBranch.name} - ${assignedBranch.city}</p>` 
    : '';

  const mailOptions = {
    from: `"Barbershop Admin" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: '🎉 Welcome to Barbershop Admin Panel!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            color: #ffffff;
            margin: 0;
            font-size: 28px;
          }
          .content {
            padding: 40px 30px;
          }
          .info-box {
            background-color: #f8f9fa;
            border-left: 4px solid #D4AF37;
            padding: 20px;
            margin: 20px 0;
          }
          .button {
            display: inline-block;
            background: linear-gradient(135deg, #D4AF37 0%, #f6d365 100%);
            color: #000000;
            padding: 15px 40px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
            margin: 20px 0;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #999999;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Account Verified Successfully!</h1>
          </div>
          
          <div class="content">
            <h2>Welcome, ${fullName}! 👋</h2>
            <p>Your email has been verified and your admin account is now active.</p>
            
            <div class="info-box">
              <h3>Your Account Details:</h3>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Role:</strong> ${roleName}</p>
              ${branchInfo}
            </div>
            
            <p>You can now log in to the Barbershop Admin Panel and start managing your operations.</p>
            
            <center>
              <a href="${process.env.FRONTEND_URL || 'https://barber-appointment-system.vercel.app'}/admin-login" class="button">
                Login to Admin Panel
              </a>
            </center>
            
            <p style="margin-top: 30px; color: #666;">
              If you have any questions or need assistance, please contact your system administrator.
            </p>
          </div>
          
          <div class="footer">
            <p>© 2025 Barbershop Admin Panel. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('✅ Welcome email sent to:', email);
    return true;
  } catch (error) {
    console.error('❌ Welcome email failed:', error.message);
    // Don't throw error for welcome email, it's not critical
    return false;
  }
};

// 🆕 Send notification to Main Admin when Branch Admin updates something
export const notifyMainAdminOfUpdate = async (mainAdminEmail, branchAdminName, updateType, details) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.warn('⚠️ Email not configured, skipping notification');
    return false;
  }

  const mailOptions = {
    from: `"Barbershop Notifications" <${process.env.EMAIL_USER}>`,
    to: mainAdminEmail,
    subject: `🔔 Branch Admin Update - ${updateType}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            color: #ffffff;
            margin: 0;
            font-size: 24px;
          }
          .content {
            padding: 30px;
          }
          .update-box {
            background-color: #f8f9fa;
            border-left: 4px solid #2196F3;
            padding: 20px;
            margin: 20px 0;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #999999;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 Branch Admin Update Notification</h1>
          </div>
          
          <div class="content">
            <p>Hello Main Admin,</p>
            <p><strong>${branchAdminName}</strong> has made an update in the system:</p>
            
            <div class="update-box">
              <h3>Update Type: ${updateType}</h3>
              <p>${details}</p>
              <p style="color: #666; font-size: 14px; margin-top: 10px;">
                Time: ${new Date().toLocaleString('en-US', { 
                  dateStyle: 'full', 
                  timeStyle: 'short' 
                })}
              </p>
            </div>
            
            <p style="color: #666;">
              You can review this update in the admin panel.
            </p>
          </div>
          
          <div class="footer">
            <p>© 2025 Barbershop Admin Panel. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('✅ Main Admin notification sent');
    return true;
  } catch (error) {
    console.error('❌ Main Admin notification failed:', error.message);
    return false;
  }
};

// 🆕 Send notification to Barber when Branch Admin updates their data
export const notifyBarberOfUpdate = async (barberEmail, barberName, updateType, details) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.warn('⚠️ Email not configured, skipping notification');
    return false;
  }

  const mailOptions = {
    from: `"Barbershop Notifications" <${process.env.EMAIL_USER}>`,
    to: barberEmail,
    subject: `🔔 Your ${updateType} has been updated`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%);
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            color: #ffffff;
            margin: 0;
            font-size: 24px;
          }
          .content {
            padding: 30px;
          }
          .update-box {
            background-color: #fff8e1;
            border-left: 4px solid #FF9800;
            padding: 20px;
            margin: 20px 0;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #999999;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 Update Notification</h1>
          </div>
          
          <div class="content">
            <p>Hello ${barberName},</p>
            <p>Your Branch Admin has updated your <strong>${updateType}</strong>:</p>
            
            <div class="update-box">
              <h3>Update Details:</h3>
              <p>${details}</p>
              <p style="color: #666; font-size: 14px; margin-top: 10px;">
                Updated on: ${new Date().toLocaleString('en-US', { 
                  dateStyle: 'full', 
                  timeStyle: 'short' 
                })}
              </p>
            </div>
            
            <p style="color: #666;">
              Please check your dashboard for complete details.
            </p>
          </div>
          
          <div class="footer">
            <p>© 2025 Barbershop Admin Panel. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('✅ Barber notification sent to:', barberEmail);
    return true;
  } catch (error) {
    console.error('❌ Barber notification failed:', error.message);
    return false;
  }
};

// Export default transporter for custom usage
export default transporter;