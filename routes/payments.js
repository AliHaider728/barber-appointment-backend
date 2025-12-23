// backend/routes/payments.js
import express from 'express';
import Appointment from '../models/Appointment.js'
import Payment from '../models/Payment.js';
import Barber from '../models/Barber.js';
import { verifyToken } from './auth.js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

// Stripe initialization
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    const { default: Stripe } = await import('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
    console.log('✅ Stripe initialized successfully');
  } catch (err) {
    console.error('❌ Stripe initialization failed:', err.message);
  }
}

const PLATFORM_FEE_PERCENTAGE = 10;

/* 
 * 💳 CREATE PAYMENT INTENT (MISSING ROUTE - THIS WAS THE 404 ERROR)
 */
router.post('/create-payment-intent', async (req, res) => {
  try {
    console.log('🔷 Creating payment intent:', req.body);

    if (!stripe) {
      return res.status(503).json({ 
        error: 'Stripe not configured on server' 
      });
    }

    const { totalPrice, customerEmail, customerName, barberId } = req.body;

    if (!totalPrice || !barberId) {
      return res.status(400).json({ 
        error: 'Missing required fields: totalPrice or barberId' 
      });
    }

    // Validate barber exists
    const barber = await Barber.findById(barberId);
    if (!barber) {
      return res.status(404).json({ error: 'Barber not found' });
    }

    // Calculate amounts
    const totalAmount = parseFloat(totalPrice);
    const platformFee = (totalAmount * PLATFORM_FEE_PERCENTAGE) / 100;
    const barberAmount = totalAmount - platformFee;

    console.log(`💰 Payment breakdown:
      - Total: £${totalAmount.toFixed(2)}
      - Platform Fee (10%): £${platformFee.toFixed(2)}
      - Barber Amount (90%): £${barberAmount.toFixed(2)}`);

    // Create Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Convert to pence
      currency: 'gbp',
      receipt_email: customerEmail || null,
      metadata: {
        customerName: customerName || 'Guest',
        barberId: barberId,
        barberName: barber.name,
        platformFee: platformFee.toFixed(2),
        barberAmount: barberAmount.toFixed(2)
      },
      description: `Appointment with ${barber.name}`
    });

    console.log('✅ Payment Intent created:', paymentIntent.id);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      platformFee: platformFee.toFixed(2),
      barberAmount: barberAmount.toFixed(2)
    });

  } catch (error) {
    console.error('❌ Create payment intent error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create payment intent' 
    });
  }
});

/* 
 * 📅 CREATE APPOINTMENT WITH PAYMENT
 */
router.post('/create-appointment-with-payment', async (req, res) => {
  try {
    console.log('📅 Creating appointment with payment');

    const appointmentData = req.body;

    // Validate required fields
    if (!appointmentData.paymentIntentId) {
      return res.status(400).json({ 
        error: 'Payment Intent ID is required' 
      });
    }

    // Check if appointment already exists for this payment
    const existingAppointment = await Appointment.findOne({
      paymentIntentId: appointmentData.paymentIntentId
    });

    if (existingAppointment) {
      console.log('⚠️ Appointment already exists for this payment');
      return res.json({
        appointment: existingAppointment,
        message: 'Appointment already created'
      });
    }

    // Check slot availability
    const conflictingAppointment = await Appointment.findOne({
      barber: appointmentData.barber,
      date: appointmentData.date,
      time: appointmentData.time,
      status: { $in: ['pending', 'confirmed'] }
    });

    if (conflictingAppointment) {
      return res.status(409).json({ 
        error: 'Time slot no longer available' 
      });
    }

    // Create appointment
    const appointment = new Appointment({
      ...appointmentData,
      status: 'pending', // Will be confirmed by webhook
      paymentStatus: 'paid',
      payOnline: true
    });

    await appointment.save();

    console.log('✅ Appointment created:', appointment._id);

    res.status(201).json({
      appointment,
      message: 'Appointment created successfully'
    });

  } catch (error) {
    console.error('❌ Create appointment error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create appointment' 
    });
  }
});

/* 
 * 🔗 STRIPE CONNECT ROUTES 
 */

// Check Stripe connection status
router.get('/stripe/status', verifyToken, async (req, res) => {
  try {
    console.log('🔍 Checking Stripe status for user:', req.user);

    if (!stripe) {
      return res.status(503).json({ 
        connected: false, 
        error: 'Stripe not configured on server' 
      });
    }

    const barber = await Barber.findById(req.user.barberId);
    if (!barber) {
      return res.status(404).json({ 
        connected: false, 
        error: 'Barber not found' 
      });
    }

    console.log('👤 Found barber:', barber.name);

    if (!barber.stripeAccountId) {
      console.log('❌ No Stripe account linked');
      return res.json({
        connected: false,
        message: 'No Stripe account linked'
      });
    }

    // Verify account with Stripe
    try {
      const account = await stripe.accounts.retrieve(barber.stripeAccountId);
      
      console.log('📊 Stripe account status:', {
        id: account.id,
        detailsSubmitted: account.details_submitted,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled
      });

      const isFullyOnboarded = account.details_submitted && 
                               account.charges_enabled && 
                               account.payouts_enabled;

      return res.json({
        connected: true,
        accountId: barber.stripeAccountId,
        fullyOnboarded: isFullyOnboarded,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted
      });

    } catch (stripeError) {
      console.error('❌ Stripe account retrieval error:', stripeError.message);
      
      // Account might be deleted or invalid - reset it
      barber.stripeAccountId = null;
      await barber.save();
      
      return res.json({
        connected: false,
        error: 'Invalid Stripe account',
        needsReconnect: true
      });
    }

  } catch (error) {
    console.error('❌ Status check error:', error);
    res.status(500).json({ 
      connected: false, 
      error: error.message 
    });
  }
});

// Connect or manage Stripe account
router.post('/stripe/connect', verifyToken, async (req, res) => {
  try {
    console.log('🔗 Stripe connect request from user:', req.user);

    if (!stripe) {
      console.error('❌ Stripe not initialized');
      return res.status(503).json({ 
        error: 'Stripe not configured on server. Please contact support.' 
      });
    }

    const barber = await Barber.findById(req.user.barberId);
    if (!barber) {
      console.error('❌ Barber not found:', req.user.barberId);
      return res.status(404).json({ error: 'Barber not found' });
    }

    console.log('👤 Found barber:', barber.name, '| Email:', barber.email);

    // If barber already has account, create login link
    if (barber.stripeAccountId) {
      try {
        console.log('🔍 Checking existing Stripe account:', barber.stripeAccountId);
        const account = await stripe.accounts.retrieve(barber.stripeAccountId);
        
        if (account && account.id) {
          console.log('✅ Valid existing account found');
          
          // Create login link to dashboard
          const loginLink = await stripe.accounts.createLoginLink(
            barber.stripeAccountId
          );
          
          console.log('🔗 Login link created');
          return res.json({
            loginUrl: loginLink.url,
            message: 'Redirecting to Stripe dashboard'
          });
        }
      } catch (error) {
        console.log('⚠️ Existing account invalid:', error.message);
        console.log('🆕 Creating new account...');
        barber.stripeAccountId = null;
        await barber.save();
      }
    }

    // Create new Stripe Connect account
    console.log('🆕 Creating new Stripe Express account...');
    
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'GB',
      email: barber.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true }
      },
      business_type: 'individual',
      business_profile: {
        name: barber.name,
        product_description: 'Professional barbershop services',
        support_email: barber.email
      },
      metadata: {
        barberId: barber._id.toString(),
        barberName: barber.name,
        shopName: barber.shopName || barber.name
      }
    }); 

    console.log('✅ Stripe account created:', account.id);

    // Save account ID to barber
    barber.stripeAccountId = account.id;
    await barber.save();
    console.log('💾 Account ID saved to database');

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONTEND_URL}/barber/dashboard`,
      return_url: `${process.env.FRONTEND_URL}/barber/dashboard`,
      type: 'account_onboarding'
    });

    console.log('🔗 Onboarding link created:', accountLink.url);

    res.json({
      onboardingUrl: accountLink.url,
      accountId: account.id,
      message: 'Redirecting to Stripe onboarding'
    });

  } catch (error) {
    console.error('❌ Stripe connect error:', error);
    console.error('Error details:', {
      message: error.message,
      type: error.type,
      code: error.code,
      rawMessage: error.raw?.message
    });
    
    res.status(500).json({ 
      error: error.message || 'Failed to connect Stripe',
      details: error.raw?.message || error.type || 'Unknown error',
      type: error.type
    });
  }
});

/* 
 * 💰 PAYMENT QUERIES 
 */

// Get barber payments and summary
router.get('/barber/me', verifyToken, async (req, res) => {
  try {
    console.log('💰 Fetching payments for user:', req.user);

    const barber = await Barber.findById(req.user.barberId);
    if (!barber) {
      return res.status(404).json({ error: 'Barber not found' });
    }

    console.log('👤 Found barber:', barber.name);

    // Get all payments for this barber
    const payments = await Payment.find({ barber: barber._id })
      .sort({ createdAt: -1 })
      .limit(50);

    console.log(`📊 Found ${payments.length} payments`);

    // Calculate summary
    const summary = {
      totalEarnings: 0,
      pendingAmount: 0,
      transferredAmount: 0,
      totalPayments: payments.length
    }; 

    payments.forEach(payment => {
      if (payment.status === 'succeeded') {
        summary.totalEarnings += payment.barberAmount;
        
        if (payment.transferStatus === 'completed') {
          summary.transferredAmount += payment.barberAmount;
        } else if (payment.transferStatus === 'pending') {
          summary.pendingAmount += payment.barberAmount;
        }
      }
    });

    console.log('📊 Summary:', summary);

    res.json({ payments, summary });

  } catch (error) {
    console.error('❌ Get payments error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single payment details
router.get('/:paymentId', verifyToken, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId)
      .populate('appointment')
      .populate('barber');

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);
  } catch (error) {
    console.error('❌ Get payment error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;