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
    console.log('  Stripe initialized successfully');
  } catch (err) {
    console.error('  Stripe initialization failed:', err.message);
  }
}

const PLATFORM_FEE_PERCENTAGE = 10;

/* 
 * 💳 CREATE PAYMENT INTENT
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

    const barber = await Barber.findById(barberId);
    if (!barber) {
      return res.status(404).json({ error: 'Barber not found' });
    }

    const totalAmount = parseFloat(totalPrice);
    const platformFee = (totalAmount * PLATFORM_FEE_PERCENTAGE) / 100;
    const barberAmount = totalAmount - platformFee;

    console.log(`  Payment breakdown:
      - Total: £${totalAmount.toFixed(2)}
      - Platform Fee (10%): £${platformFee.toFixed(2)}
      - Barber Amount (90%): £${barberAmount.toFixed(2)}`);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100),
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

    console.log('  Payment Intent created:', paymentIntent.id);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      platformFee: platformFee.toFixed(2),
      barberAmount: barberAmount.toFixed(2)
    });

  } catch (error) {
    console.error('  Create payment intent error:', error);
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

    if (!appointmentData.paymentIntentId) {
      return res.status(400).json({ 
        error: 'Payment Intent ID is required' 
      });
    }

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

    const appointment = new Appointment({
      ...appointmentData,
      status: 'pending',
      paymentStatus: 'paid',
      payOnline: true
    });

    await appointment.save();

    console.log('  Appointment created:', appointment._id);

    res.status(201).json({
      appointment,
      message: 'Appointment created successfully'
    });

  } catch (error) {
    console.error('  Create appointment error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create appointment' 
    });
  }
});

/* 
 * 🔗 STRIPE CONNECT - Check Status
 */
router.get('/stripe/status', verifyToken, async (req, res) => {
  try {
    console.log('🔍 Checking Stripe status for user:', req.user);

    if (!stripe) {
      return res.status(503).json({ 
        connected: false, 
        error: 'Stripe not configured on server' 
      });
    }

    const barberId = req.user.barberId || req.user.id;
    
    if (!barberId) {
      console.error('  No barber ID in token:', req.user);
      return res.status(400).json({ 
        connected: false,
        error: 'Barber ID missing in token' 
      });
    }

    const barber = await Barber.findById(barberId);
    if (!barber) {
      console.error('  Barber not found with ID:', barberId);
      return res.status(404).json({ 
        connected: false, 
        error: 'Barber not found' 
      });
    }

    console.log('👤 Found barber:', barber.name);

    if (!barber.stripeAccountId) {
      console.log('  No Stripe account linked');
      return res.json({
        connected: false,
        message: 'No Stripe account linked'
      });
    }

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
      console.error('  Stripe account retrieval error:', stripeError.message);
      
      barber.stripeAccountId = null;
      await barber.save();
      
      return res.json({
        connected: false,
        error: 'Invalid Stripe account',
        needsReconnect: true
      });
    }

  } catch (error) {
    console.error('  Status check error:', error);
    res.status(500).json({ 
      connected: false, 
      error: error.message 
    });
  }
});

/* 
 * 🔗 STRIPE CONNECT - Connect/Create Account
 */
router.post('/stripe/connect', verifyToken, async (req, res) => {
  try {
    console.log('🔗 Stripe connect request from user:', req.user);

    if (!stripe) {
      console.error('  Stripe not initialized');
      return res.status(503).json({ 
        error: 'Stripe not configured on server. Please contact support.' 
      });
    }

    const barberId = req.user.barberId || req.user.id;
    
    if (!barberId) {
      console.error('  No barber ID in token:', req.user);
      return res.status(400).json({ error: 'Barber ID missing in token' });
    }

    const barber = await Barber.findById(barberId);
    if (!barber) {
      console.error('  Barber not found:', barberId);
      return res.status(404).json({ error: 'Barber not found' });
    }

    console.log('👤 Found barber:', barber.name, '| Email:', barber.email);

    // If barber already has account, return success
    if (barber.stripeAccountId) {
      try {
        console.log('🔍 Checking existing Stripe account:', barber.stripeAccountId);
        const account = await stripe.accounts.retrieve(barber.stripeAccountId);
        
        if (account && account.id) {
          console.log('  Valid existing account found');
          return res.json({
            message: 'Already connected',
            accountId: account.id
          });
        }
      } catch (error) {
        console.log('⚠️ Existing account invalid:', error.message);
        console.log('🆕 Creating new account...');
        barber.stripeAccountId = null;
        await barber.save();
      }
    }

    // Create new Stripe Express account
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

    console.log('  Stripe account created:', account.id);

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
    console.error('  Stripe connect error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to connect Stripe',
      details: error.raw?.message || error.type || 'Unknown error'
    });
  }
});

/* 
 * 🏦 NEW: Get Bank Accounts
 */
router.get('/stripe/bank-accounts', verifyToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const barberId = req.user.barberId || req.user.id;
    const barber = await Barber.findById(barberId);

    if (!barber || !barber.stripeAccountId) {
      return res.json({ bankAccounts: [] });
    }

    const account = await stripe.accounts.retrieve(barber.stripeAccountId);
    const externalAccounts = await stripe.accounts.listExternalAccounts(
      barber.stripeAccountId,
      { object: 'bank_account', limit: 10 }
    );

    res.json({
      bankAccounts: externalAccounts.data || [],
      defaultAccount: account.external_accounts?.default_bank_account
    });

  } catch (error) {
    console.error('  Get bank accounts error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* 
 * 🔗 NEW: Dashboard Link (for account management)
 */
router.post('/stripe/dashboard-link', verifyToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const barberId = req.user.barberId || req.user.id;
    const barber = await Barber.findById(barberId);

    if (!barber || !barber.stripeAccountId) {
      return res.status(404).json({ error: 'No Stripe account found' });
    }

    const loginLink = await stripe.accounts.createLoginLink(
      barber.stripeAccountId
    );

    res.json({ url: loginLink.url });

  } catch (error) {
    console.error('  Dashboard link error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* 
 * 💸 NEW: Transfer Pending Payments
 */
router.post('/stripe/transfer-pending', verifyToken, async (req, res) => {
  try {
    console.log('💸 Transfer pending payments request');

    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const barberId = req.user.barberId || req.user.id;
    const barber = await Barber.findById(barberId);

    if (!barber) {
      return res.status(404).json({ error: 'Barber not found' });
    }

    if (!barber.stripeAccountId) {
      return res.status(400).json({ error: 'No Stripe account connected' });
    }

    // Verify account is ready
    const account = await stripe.accounts.retrieve(barber.stripeAccountId);
    if (!account.charges_enabled || !account.payouts_enabled) {
      return res.status(400).json({ 
        error: 'Stripe account not fully set up. Please complete onboarding.' 
      });
    }

    // Find all pending payments
    const pendingPayments = await Payment.find({
      barber: barber._id,
      status: 'succeeded',
      transferStatus: 'pending'
    });

    if (pendingPayments.length === 0) {
      return res.json({ 
        message: 'No pending payments to transfer',
        transferred: 0
      });
    }

    console.log(`📊 Found ${pendingPayments.length} pending payment(s)`);

    let successCount = 0;
    let totalTransferred = 0;
    const errors = [];

    // Transfer each payment
    for (const payment of pendingPayments) {
      try {
        const transfer = await stripe.transfers.create({
          amount: Math.round(payment.barberAmount * 100),
          currency: 'gbp',
          destination: barber.stripeAccountId,
          transfer_group: payment.appointment.toString(),
          metadata: {
            paymentId: payment._id.toString(),
            appointmentId: payment.appointment.toString(),
            barberId: barber._id.toString()
          }
        });

        payment.stripeTransferId = transfer.id;
        payment.transferStatus = 'completed';
        await payment.save();

        successCount++;
        totalTransferred += payment.barberAmount;

        console.log(`  Transfer successful: £${payment.barberAmount.toFixed(2)}`);

      } catch (transferError) {
        console.error(`  Transfer failed for payment ${payment._id}:`, transferError.message);
        
        payment.transferStatus = 'failed';
        payment.errorMessage = transferError.message;
        await payment.save();

        errors.push({
          paymentId: payment._id,
          error: transferError.message
        });
      }
    }

    res.json({
      message: `Successfully transferred ${successCount} payment(s)`,
      transferred: successCount,
      total: pendingPayments.length,
      amount: totalTransferred.toFixed(2),
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('  Transfer pending error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* 
 *   Get Barber Payments
 */
router.get('/barber/me', verifyToken, async (req, res) => {
  try {
    console.log('  Fetching payments for user:', req.user);

    const barberId = req.user.barberId || req.user.id;
    
    if (!barberId) {
      return res.status(400).json({ error: 'Barber ID missing' });
    }

    const barber = await Barber.findById(barberId);
    if (!barber) {
      return res.status(404).json({ error: 'Barber not found' });
    }

    const payments = await Payment.find({ barber: barber._id })
      .sort({ createdAt: -1 })
      .limit(50);

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

    res.json({ payments, summary });

  } catch (error) {
    console.error('  Get payments error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* 
 *   Get Single Payment
 */
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
    console.error('  Get payment error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;