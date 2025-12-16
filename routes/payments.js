// backend/routes/payments.js
import express from 'express';
import Appointment from '../models/Appointment.js';
import Payment from '../models/Payment.js';
import Barber from '../models/Barber.js';
import Service from '../models/Service.js'; 
import mongoose from 'mongoose'; 
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();
const router = express.Router();

const PLATFORM_FEE_PERCENTAGE = 10;

// Stripe initialization
let stripe = null;

if (process.env.STRIPE_SECRET_KEY) {
  try {
    const { Stripe } = await import('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
    console.log('  Stripe initialized successfully');
  } catch (err) {
    console.error('  Stripe import failed:', err.message);
  }
} else {
  console.log('  STRIPE_SECRET_KEY not found');
}

// Middleware to verify barber token
const verifyBarber = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey123456789');
    
    if (decoded.role !== 'barber') {
      return res.status(403).json({ message: 'Access denied - barber only' });
    }

    req.barber = decoded;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
};

// ==================== BARBER ROUTES ====================

// GET all payments for logged-in barber
router.get('/barber/me', verifyBarber, async (req, res) => {
  try {
    const barberId = req.barber.barberId || req.barber.id;
    
    if (!barberId) {
      return res.status(400).json({ message: 'Barber ID not found in token' });
    }

    console.log('📋 Fetching payments for barber:', barberId);

    const payments = await Payment.find({ barber: barberId })
      .populate('appointment')
      .sort({ createdAt: -1 });

    console.log('  Found', payments.length, 'payments');

    const summary = {
      totalEarnings: payments
        .filter(p => p.status === 'succeeded')
        .reduce((sum, p) => sum + (p.barberAmount || 0), 0),
      pendingAmount: payments
        .filter(p => p.status === 'succeeded' && p.transferStatus === 'pending')
        .reduce((sum, p) => sum + (p.barberAmount || 0), 0),
      transferredAmount: payments
        .filter(p => p.transferStatus === 'completed')
        .reduce((sum, p) => sum + (p.barberAmount || 0), 0),
      totalPayments: payments.filter(p => p.status === 'succeeded').length
    };

    res.json({ 
      success: true,
      payments,
      summary
    });

  } catch (error) {
    console.error('  Get barber payments error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET Stripe connection status for barber
router.get('/stripe/status', verifyBarber, async (req, res) => {
  try {
    const barberId = req.barber.barberId || req.barber.id;
    
    console.log('🔍 Checking Stripe status for barber:', barberId);
    
    const barber = await Barber.findById(barberId);
    if (!barber) {
      return res.status(404).json({ message: 'Barber not found' });
    }

    const connected = !!barber.stripeAccountId;
    console.log('  Stripe status:', connected ? 'Connected' : 'Not connected');

    res.json({
      connected,
      accountId: barber.stripeAccountId || null
    });

  } catch (error) {
    console.error('  Stripe status error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// CONNECT Stripe account for barber
router.post('/stripe/connect', verifyBarber, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ 
        message: 'Stripe not configured',
        error: 'STRIPE_SECRET_KEY missing in environment variables' 
      });
    }

    const barberId = req.barber.barberId || req.barber.id;
    
    if (!barberId) {
      return res.status(400).json({ message: 'Barber ID not found in token' });
    }

    console.log('🔗 Stripe connect request for barber:', barberId);
    
    const barber = await Barber.findById(barberId);
    if (!barber) {
      return res.status(404).json({ message: 'Barber not found' });
    }

    // If barber already has Stripe account, return dashboard link
    if (barber.stripeAccountId) {
      console.log('  Barber already has Stripe account:', barber.stripeAccountId);
      
      try {
        const loginLink = await stripe.accounts.createLoginLink(barber.stripeAccountId);
        return res.json({
          connected: true,
          loginUrl: loginLink.url
        });
      } catch (stripeError) {
        console.error('  Failed to create login link:', stripeError.message);
        // If login link fails, continue to create new onboarding link
      }
    }

    console.log('🆕 Creating new Stripe Connect account');

    // Create new Stripe Connect account
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'GB',
      email: barber.email,
      capabilities: {
        transfers: { requested: true },
      },
      business_type: 'individual',
      metadata: {
        barberId: barber._id.toString(),
        barberName: barber.name
      }
    });

    console.log('  Stripe account created:', account.id);

    // Save Stripe account ID
    barber.stripeAccountId = account.id;
    await barber.save();

    console.log('  Stripe account ID saved to barber');

    // Create onboarding link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${frontendUrl}/barber/dashboard`,
      return_url: `${frontendUrl}/barber/dashboard`,
      type: 'account_onboarding',
    });

    console.log('  Onboarding link created');

    res.json({
      connected: false,
      onboardingUrl: accountLink.url,
      accountId: account.id
    });

  } catch (error) {
    console.error('  Stripe connect error:', error);
    res.status(500).json({ 
      message: 'Failed to connect Stripe',
      error: error.message,
      details: error.type || 'unknown_error'
    });
  }
});

// ==================== PAYMENT ROUTES ====================

// CREATE PAYMENT INTENT
router.post('/create-payment-intent', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ 
      error: 'Payment gateway not configured' 
    });
  }

  try {
    const { totalPrice, customerEmail, customerName, barberId } = req.body;

    if (!totalPrice || totalPrice <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!barberId || !mongoose.Types.ObjectId.isValid(barberId)) {
      return res.status(400).json({ error: 'Valid Barber ID required' });
    }

    const barber = await Barber.findById(barberId);
    if (!barber) {
      return res.status(404).json({ error: 'Barber not found' });
    }

    const platformFee = (totalPrice * PLATFORM_FEE_PERCENTAGE) / 100;
    const barberAmount = totalPrice - platformFee;
    const amountInCents = Math.round(totalPrice * 100);

    console.log(`  Creating payment intent - Total: £${totalPrice}, Platform: £${platformFee}, Barber: £${barberAmount}`);

    const paymentIntentData = {
      amount: amountInCents,
      currency: 'gbp',
      receipt_email: customerEmail || undefined,
      metadata: {
        customerName: customerName || 'Guest',
        customerEmail: customerEmail || 'no-email@temp.com',
        barberId: barberId,
        barberName: barber.name,
        platformFee: platformFee.toFixed(2),
        barberAmount: barberAmount.toFixed(2)
      }
    };

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    console.log('  Payment Intent created:', paymentIntent.id);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      platformFee: platformFee.toFixed(2),
      barberAmount: barberAmount.toFixed(2)
    });

  } catch (error) {
    console.error('  Payment intent error:', error);
    res.status(500).json({ error: 'Payment failed', details: error.message });
  }
});

// CREATE APPOINTMENT WITH PAYMENT
router.post('/create-appointment-with-payment', async (req, res) => {
  try {
    const {
      customerName,
      email,
      phone,
      date,
      selectedServices,
      barber,
      branch,
      duration,
      totalPrice,
      paymentIntentId,
      payOnline = true
    } = req.body;

    console.log('📝 Creating appointment with payment');

    if (!customerName || !email || !phone || !date || !barber || !branch || !duration) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'All fields are required' 
      });
    }

    if (!selectedServices || !Array.isArray(selectedServices) || selectedServices.length === 0) {
      return res.status(400).json({ 
        error: 'No services selected',
        message: 'At least one service is required' 
      });
    }

    if (!mongoose.Types.ObjectId.isValid(barber) || !mongoose.Types.ObjectId.isValid(branch)) {
      return res.status(400).json({ 
        error: 'Invalid IDs',
        message: 'Invalid barber or branch ID' 
      });
    }

    const serviceIds = selectedServices.map(s => s.serviceRef).filter(Boolean);
    if (serviceIds.some(id => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ 
        error: 'Invalid service IDs',
        message: 'One or more service IDs are invalid' 
      });
    }

    const services = await Service.find({ _id: { $in: serviceIds } });
    if (services.length !== serviceIds.length) {
      return res.status(404).json({ 
        error: 'Services not found',
        message: 'One or more services not found' 
      });
    }

    const enrichedServices = selectedServices.map(sel => {
      const service = services.find(s => s._id.toString() === sel.serviceRef);
      return {
        serviceRef: service._id,
        name: service.name,
        price: service.price,
        duration: service.duration
      };
    });

    const calculatedTotalPrice = totalPrice || enrichedServices.reduce((sum, s) => {
      return sum + parseFloat(s.price.replace('£', '').trim());
    }, 0);

    if (payOnline && paymentIntentId && stripe) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (paymentIntent.status !== 'succeeded') {
          return res.status(400).json({ 
            error: 'Payment incomplete',
            message: 'Payment not completed yet' 
          });
        }
        console.log('  Payment verified:', paymentIntentId);
      } catch (err) {
        return res.status(400).json({ 
          error: 'Invalid payment',
          message: 'Invalid payment intent ID' 
        });
      }
    }

    const appointmentDate = new Date(date);
    const endDate = new Date(appointmentDate.getTime() + duration * 60000);

    const conflictingBookings = await Appointment.find({
      barber,
      status: { $nin: ['rejected', 'cancelled'] },
      $or: [
        {
          date: { $lte: appointmentDate },
          $expr: {
            $gte: [
              { $add: ['$date', { $multiply: ['$duration', 60000] }] },
              appointmentDate
            ]
          }
        },
        {
          date: {
            $gte: appointmentDate,
            $lt: endDate
          }
        }
      ]
    });

    if (conflictingBookings.length > 0) {
      return res.status(409).json({ 
        error: 'Time slot conflict',
        message: 'This time slot is no longer available'
      });
    }
    
    const appointment = new Appointment({
      customerName: customerName?.trim() || 'Guest',
      email: email?.trim().toLowerCase() || 'no-email@temp.com',
      phone: phone?.trim() || 'N/A',
      date: appointmentDate,
      services: enrichedServices,
      totalPrice: calculatedTotalPrice,
      totalPriceInCents: Math.round(calculatedTotalPrice * 100),
      duration: duration || 30,
      barber,
      branch,
      status: payOnline && paymentIntentId ? 'confirmed' : 'pending',
      payOnline,
      paymentIntentId: payOnline ? paymentIntentId : null,
      paymentStatus: payOnline && paymentIntentId ? 'paid' : 'pending'
    });

    await appointment.save();
    console.log('  Appointment created:', appointment._id);

    if (payOnline && paymentIntentId) {
      const platformFee = (calculatedTotalPrice * PLATFORM_FEE_PERCENTAGE) / 100;
      const barberAmount = calculatedTotalPrice - platformFee;

      const existingPayment = await Payment.findOne({ 
        stripePaymentIntentId: paymentIntentId 
      });

      if (!existingPayment) {
        const payment = new Payment({
          appointment: appointment._id,
          barber,
          customerEmail: email?.trim().toLowerCase(),
          customerName: customerName?.trim(),
          totalAmount: calculatedTotalPrice,
          platformFee,
          barberAmount,
          stripePaymentIntentId: paymentIntentId,
          status: 'succeeded',
          transferStatus: 'pending',
          paymentMethod: 'card'
        });

        await payment.save();
        console.log('  Payment record created:', payment._id);
      }
    }

    const populated = await Appointment.findById(appointment._id)
      .populate('barber', 'name email')
      .populate('branch', 'name city address')
      .populate('services.serviceRef', 'name price duration');

    res.status(201).json({ 
      success: true, 
      appointment: populated 
    });

  } catch (error) {
    console.error('  Create appointment error:', error);
    res.status(500).json({ 
      error: 'Booking failed', 
      message: error.message 
    });
  }
});

// Health check
router.get('/', (req, res) => {
  res.json({ 
    message: 'Payments API Active',
    stripeEnabled: !!stripe,
    platformFee: `${PLATFORM_FEE_PERCENTAGE}%`,
    webhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
    status: stripe ? '  Ready' : '  Add STRIPE_SECRET_KEY',
    routes: [
      'GET /payments/',
      'GET /payments/barber/me',
      'GET /payments/stripe/status',
      'POST /payments/stripe/connect',
      'POST /payments/create-payment-intent',
      'POST /payments/create-appointment-with-payment'
    ]
  });
});

export default router;