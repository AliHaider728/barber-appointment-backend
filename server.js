import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import appointmentRoutes from './routes/appointments.js';
import barberRoutes from './routes/barbers.js';
import branchRoutes from './routes/branches.js';
import serviceRoutes from './routes/services.js';

dotenv.config();

const app = express();

// ✅ Allow only your frontend (Vercel) domain
const allowedOrigins = [
  'https://barber-appointment-six.vercel.app', // your frontend live URL
  'http://localhost:3000' // optional: for local testing
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  })
);

app.use(express.json());
app.use('/uploads', express.static('uploads')); // <-- Serve images

// ✅ MongoDB Connection
mongoose.set('strictQuery', false);
mongoose
  .connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// ✅ Routes
app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/barbers', barberRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/services', serviceRoutes);

// ✅ Default route for health check
app.get('/', (req, res) => {
  res.send('Backend is running successfully 🚀');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
