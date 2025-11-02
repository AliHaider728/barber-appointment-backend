
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

// CORS - Allow frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173', // Vite default
  credentials: true
}));

// Body parsers with higher limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Static uploads
app.use('/uploads', express.static('uploads'));

// MongoDB Connection
mongoose.set('strictQuery', false);
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/barbers', barberRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/services', serviceRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



// import express from 'express';
// import mongoose from 'mongoose';
// import cors from 'cors';
// import dotenv from 'dotenv';
// import authRoutes from './routes/auth.js';
// import appointmentRoutes from './routes/appointments.js';
// import barberRoutes from './routes/barbers.js';
// import branchRoutes from './routes/branches.js';
// import serviceRoutes from './routes/services.js';




// dotenv.config();


// const app = express();

//  app.use(express.json());
// app.use('/uploads', express.static('uploads')); 

// // Middleware
// app.use(cors({
//   origin: process.env.FRONTEND_URL || 'http://localhost:5173',
//   credentials: true
// }));

// // Increase payload limit for base64 images
// app.use(express.json({ limit: '10mb' }));  // IMPORTANT FOR BASE64
// app.use(express.urlencoded({ limit: '10mb', extended: true }));

// // MongoDB Connection
// mongoose.set('strictQuery', false);
// mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
//   .then(() => console.log('MongoDB connected'))
//   .catch(err => console.error('MongoDB connection error:', err));


// app.use('/api/auth', authRoutes);
// app.use('/api/appointments', appointmentRoutes);
// app.use('/api/barbers', barberRoutes);
// app.use('/api/branches', branchRoutes);
// app.use('/api/services', serviceRoutes);

// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));