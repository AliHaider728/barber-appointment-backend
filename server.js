import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import passport from 'passport';

// ⚠️ ENV FIRST (VERY IMPORTANT) 
dotenv.config();

// Verify critical env vars
console.log('🔍 Environment Check:');
console.log('  - EMAIL_USER:', process.env.EMAIL_USER ? '✅ Set' : '❌ Missing');
console.log('  - EMAIL_APP_PASSWORD:', process.env.EMAIL_APP_PASSWORD ? '✅ Set' : '❌ Missing');
console.log('  - MONGODB_URI:', process.env.MONGODB_URI ? '✅ Set' : '❌ Missing');
console.log('  - JWT_SECRET:', process.env.JWT_SECRET ? '✅ Set' : '❌ Missing');

// ROUTES
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
import otpRoutes from './routes/otpRoutes.js';
import branchAdminRoutes from './routes/branchAdmin.js';

// CLOUDINARY
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('✅ Cloudinary Loaded:', {
  cloud: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY?.slice(0, 6) + '...',
});

// EXPRESS APP
const app = express();

// Passport init
app.use(passport.initialize());

// SECURITY HEADERS
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://accounts.google.com"
  );
  res.setHeader(
    'Cross-Origin-Opener-Policy',
    'same-origin-allow-popups'
  );
  next();
});

// CORS
const allowedOrigins = [
  'http://localhost:5173',
   'https://barber-appointment-six.vercel.app',
   'https://barber-appointment-b7dlepb5e-alis-projects-58e3c939.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Still allow but log it
      console.log('⚠️ Request from non-whitelisted origin:', origin);
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// MONGODB CONNECTION (SERVERLESS SAFE)
let isConnected = false;

async function connectToDatabase() {
  if (isConnected && mongoose.connection.readyState === 1) {
    console.log('✅ Using existing database connection');
    return mongoose.connection;
  }

  console.log('🔄 Creating new database connection...');
  mongoose.set('strictQuery', false);

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 1,
      minPoolSize: 0,
    });

    isConnected = true;
    console.log('✅ MongoDB Connected');
    return mongoose.connection;
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
    isConnected = false;
    throw err;
  }
}

// DB Middleware
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// ⚠️ STRIPE WEBHOOK (RAW BODY) - MUST BE BEFORE JSON PARSER
app.use('/api/webhooks', webhookRoutes);

// BODY PARSERS 
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static('uploads'));

// Request Logger (for debugging)
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// HEALTH CHECK
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: '🚀 Barber Appointment API Running',
    version: '2.0.0',
    emailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD),
    timestamp: new Date().toISOString(),
    routes: {
      auth: '/api/auth',
      admins: '/api/admins',
      branchAdmin: '/api/branch-admin',
      barbers: '/api/barbers',
      branches: '/api/branches',
      services: '/api/services',
      appointments: '/api/appointments',
      shifts: '/api/barber-shifts',
      leaves: '/api/leaves',
      payments: '/api/payments',
      otp: '/api/otp'
    }
  });
});

// 🔥 ROUTES - REGISTER ALL ROUTES
console.log('📌 Registering API routes...');

// Auth routes
app.use('/api/auth', authRoutes);
console.log('✅ Auth routes: /api/auth');

// Admin routes (Main Admin management)
app.use('/api/admins', adminRoutes);
console.log('✅ Admin routes: /api/admins');

// Branch Admin routes
app.use('/api/branch-admin', branchAdminRoutes);
console.log('✅ Branch Admin routes: /api/branch-admin');

// Other routes
app.use('/api/appointments', appointmentRoutes);
console.log('✅ Appointment routes: /api/appointments');

app.use('/api/barbers', barberRoutes);
console.log('✅ Barber routes: /api/barbers');

app.use('/api/barber-shifts', barberShiftRoutes);
console.log('✅ Barber Shift routes: /api/barber-shifts');

app.use('/api/branches', branchRoutes);
console.log('✅ Branch routes: /api/branches');

app.use('/api/services', serviceRoutes);
console.log('✅ Service routes: /api/services');

app.use('/api/payments', paymentRoute);
console.log('✅ Payment routes: /api/payments');

app.use('/api/leaves', leaveRoutes);
console.log('✅ Leave routes: /api/leaves');

app.use('/api/otp', otpRoutes);
console.log('✅ OTP routes: /api/otp');

console.log('✅ All routes registered successfully!\n');

// 404 HANDLER
app.use('*', (req, res) => {
  console.log('❌ 404 - Route not found:', req.method, req.originalUrl);
  res.status(404).json({
    error: 'Route not found',
    method: req.method,
    path: req.originalUrl,
    message: `The endpoint ${req.method} ${req.originalUrl} does not exist`,
    availableEndpoints: {
      health: 'GET /',
      auth: 'POST /api/auth/login, POST /api/auth/signup',
      admins: 'GET /api/admins, POST /api/admins/request-creation, POST /api/admins/verify-otp',
      test: 'GET /api/admins/test'
    }
  });
});

// GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error('❌ SERVER ERROR:', err.message);
  console.error('Stack:', err.stack);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// EXPORT FOR VERCEL 
export default app;

 