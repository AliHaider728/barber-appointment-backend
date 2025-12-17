// app.js or index.js
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import passport from 'passport';

// ============================================
// ROUTES IMPORT
// ============================================
import authRoutes from './routes/auth.js';
import appointmentRoutes from './routes/appointments.js';
import barberRoutes from "./routes/barbers.js";
import branchRoutes from './routes/branches.js';
import serviceRoutes from './routes/services.js';
import barberShiftRoutes from './routes/barberShifts.js';
import paymentRoute from './routes/payments.js';
import leaveRoutes from './routes/leaves.js'; 
import adminRoutes from './routes/admins.js';
import webhookRoutes from './routes/webhooks.js'; 
import otpRoutes from './routes/otpRoutes.js';  // ✅ OTP Routes

// ============================================
// ENVIRONMENT VARIABLES
// ============================================
dotenv.config();

// ✅ Verify critical environment variables on startup
console.log('🔍 [STARTUP] Checking environment variables...');
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'EMAIL_USER', 'EMAIL_APP_PASSWORD'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ [STARTUP] Missing required environment variables:', missingEnvVars);
  console.error('❌ [STARTUP] Please check your .env file');
} else {
  console.log('✅ [STARTUP] All required environment variables are set');
  console.log(`✅ [EMAIL] Configured with: ${process.env.EMAIL_USER}`);
}

// ============================================
// CLOUDINARY CONFIGURATION
// ============================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('☁️ [CLOUDINARY] Configuration loaded:', {
  cloud: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY?.slice(0, 6) + '...',
});

// ============================================
// EXPRESS APP INITIALIZATION
// ============================================
const app = express();

// Passport initialization
app.use(passport.initialize());

// ============================================
// SECURITY HEADERS
// ============================================
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://accounts.google.com");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

// ============================================
// CORS CONFIGURATION
// ============================================
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://barber-appointment-six.vercel.app',
  'https://barber-appointment-b7dlepb5e-alis-projects-58e3c939.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️ [CORS] Blocked origin: ${origin}`);
      callback(null, true); // Still allow, but log warning
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ============================================
// MONGODB CONNECTION (Serverless Optimized)
// ============================================
let isConnected = false;

async function connectToDatabase() {
  if (isConnected && mongoose.connection.readyState === 1) {
    console.log('♻️ [DB] Using existing database connection');
    return mongoose.connection;
  }

  console.log('🔌 [DB] Creating new database connection...');
  mongoose.set('strictQuery', false);
  
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 1,
      minPoolSize: 0,
    });
    
    isConnected = true;
    console.log('✅ [DB] MongoDB Connected Successfully');
    return mongoose.connection;
  } catch (err) {
    console.error('❌ [DB] MongoDB Connection Error:', err.message);
    isConnected = false;
    throw err;
  }
}

// Database connection middleware
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error('❌ [DB] Connection failed:', error);
    res.status(500).json({ 
      error: 'Database connection failed',
      message: 'Please try again later'
    });
  }
});

// ============================================
// WEBHOOKS (Must be BEFORE JSON parsing)
// ============================================
// Stripe webhooks need raw body for signature verification
app.use('/api/webhooks', webhookRoutes);

// ============================================
// BODY PARSING MIDDLEWARE
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static('uploads'));

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get('/', async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
  const emailConfigured = !!(process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD);
  
  res.json({
    status: 'OK',
    message: 'Barber Appointment API is running',
    timestamp: new Date().toISOString(),
    version: '2.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: dbStatus,
      email: emailConfigured ? 'Configured' : 'Not Configured',
      cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? 'Configured' : 'Not Configured'
    },
    endpoints: {
      auth: [
        'POST /api/auth/login',
        'POST /api/auth/signup',
        'POST /api/auth/google',
        'GET /api/auth/me'
      ],
      otp: [
        'POST /api/otp/send-otp',
        'POST /api/otp/verify-otp',
        'POST /api/otp/resend-otp'
      ],
      business: [
        'GET /api/barbers',
        'GET /api/branches',
        'GET /api/services',
        'GET /api/appointments'
      ]
    }
  });
});

// ============================================
// API ROUTES
// ============================================
console.log('📍 [ROUTES] Registering API routes...');

// Authentication & OTP
app.use('/api/auth', authRoutes);
app.use('/api/otp', otpRoutes);  // ✅ Separate OTP routes

// Business Logic
app.use('/api/appointments', appointmentRoutes);
app.use('/api/barbers', barberRoutes);
app.use('/api/barber-shifts', barberShiftRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/payments', paymentRoute);
app.use('/api/leaves', leaveRoutes);
app.use('/api/admins', adminRoutes);

console.log('✅ [ROUTES] All routes registered successfully');

// ============================================
// 404 HANDLER
// ============================================
app.use('*', (req, res) => {
  console.log(`❌ [404] Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    message: 'The requested endpoint does not exist'
  });
});

// ============================================
// GLOBAL ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  console.error('❌ [ERROR]', err);
  
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGTERM', () => {
  console.log('🛑 [SHUTDOWN] SIGTERM received, closing server gracefully...');
  mongoose.connection.close(false, () => {
    console.log('✅ [SHUTDOWN] MongoDB connection closed');
    process.exit(0);
  });
});

// ============================================
// VERCEL SERVERLESS EXPORT
// ============================================
export default app;