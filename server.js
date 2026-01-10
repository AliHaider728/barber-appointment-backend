import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import passport from 'passport';

// ENV FIRST (VERY IMPORTANT) 
dotenv.config();

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
import reminderRoutes from './routes/reminders.js';
// REMINDER CRON SERVICE
import { startReminderCron } from './routes/reminderCronService.js';

// CLOUDINARY
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('  Cloudinary Loaded:', {
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
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// MONGODB CONNECTION (SERVERLESS SAFE)
let isConnected = false;

async function connectToDatabase() {
  if (isConnected && mongoose.connection.readyState === 1) {
    console.log('  Using existing database connection');
    return mongoose.connection;
  }

  console.log('  Creating new database connection');
  mongoose.set('strictQuery', false);

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 1,
      minPoolSize: 0,
    });

    isConnected = true;
    console.log('  MongoDB Connected');
    
    // START REMINDER CRON AFTER DB CONNECTION
    if (process.env.NODE_ENV !== 'production') {
      // Only run cron in development/local
      startReminderCron();
    }
    
    return mongoose.connection;
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
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
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// STRIPE WEBHOOK (RAW BODY)
app.use('/api/webhooks', webhookRoutes);

// BODY PARSERS 
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static('uploads'));

// HEALTH CHECK
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Barber Appointment API Running',
    emailConfigured: !!(
      process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD
    ),
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/barbers', barberRoutes);
app.use('/api/barber-shifts', barberShiftRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/payments', paymentRoute);
app.use('/api/leaves', leaveRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/branch-admin', branchAdminRoutes);
app.use('/api/reminders', reminderRoutes);

// 404 HANDLER
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
  });
});

// GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error('❌ SERVER ERROR:', err);
  res.status(500).json({
    error: err.message || 'Server Error',
  });
});

// EXPORT FOR VERCEL 
export default app;