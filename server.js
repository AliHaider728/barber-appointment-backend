import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import passport from 'passport';

// ROUTES
import authRoutes from './routes/auth.js';
import appointmentRoutes from './routes/appointments.js';
import barberRoutes from "./routes/barbers.js";
import branchRoutes from './routes/branches.js';
import serviceRoutes from './routes/services.js';
import barberShiftRoutes from './routes/barberShifts.js';
import paymentRoute from './routes/payments.js';
import leaveRoutes from './routes/leaves.js'; 

dotenv.config();

// CLOUDINARY
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('Cloudinary config loaded:', {
  cloud: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY?.slice(0, 6) + '...',
});


// EXPRESS APP
const app = express();

// Passport init
app.use(passport.initialize());

// Set CSP and COOP headers
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://accounts.google.com");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
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
      callback(null, true); // allow all for dev
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static('uploads'));

// MONGODB CONNECTION WITH CACHING FOR SERVERLESS
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) {
    console.log('Using cached database connection');
    return cachedDb;
  }

  console.log('Creating new database connection');
  mongoose.set('strictQuery', false);
  
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    cachedDb = mongoose.connection;
    console.log('MongoDB Connected Successfully');
    return cachedDb;
  } catch (err) {
    console.error('MongoDB Connection Error:', err);
    throw err;
  }
}

// Connect to DB immediately
connectToDatabase().catch(err => {
  console.error('Initial DB connection failed:', err);
});

// HEALTH CHECK ENDPOINT
app.get('/', async (req, res) => {
  res.json({
    status: 'OK',
    message: 'API Running',
    timestamp: new Date().toISOString(),
    routes: [
      'GET /api/auth',
      'POST /api/auth/login',
      'POST /api/auth/signup',
      'POST /api/auth/google',
      'GET /api/barbers',
      'GET /api/branches',
      'GET /api/services'
    ]
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

// 404 PAGE
app.use('*', (req, res) => {
  console.log('404 - Route not found:', req.originalUrl);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error('ERROR:', err);
  res.status(500).json({ error: err.message || 'Server Error' });
});

// VERCEL SERVERLESS EXPORT
// This is the critical part for Vercel
export default app;