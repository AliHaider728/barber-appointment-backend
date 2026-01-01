// backend/routes/payments.js - ENHANCED VERSION
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
    console.log('✅ Stripe initialized');
  } catch (err) {
    console.error('❌ Stripe init failed:', err.message);
  }
}

const PLATFORM_FEE_PERCENTAGE = 10;

/* 💳 CREATE PAYMENT INTENT */
router.post('/create-payment-intent', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const { totalPrice, customerEmail, customerName, barberId } = req.body;
    if (!totalPrice || !barberId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const barber = await Barber.findById(barberId);
    if (!barber) {
      return res.status(404).json({ error: 'Barber not found' });
    }

    const totalAmount = parseFloat(totalPrice);
    const platformFee = (totalAmount * PLATFORM_FEE_PERCENTAGE) / 100;
    const barberAmount = totalAmount - platformFee;

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

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      platformFee: platformFee.toFixed(2),
      barberAmount: barberAmount.toFixed(2)
    });
  } catch (error) {
    console.error('❌ Payment intent error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* 📅 CREATE APPOINTMENT WITH PAYMENT */
router.post('/create-appointment-with-payment', async (req, res) => {
  try {
    const appointmentData = req.body;
    if (!appointmentData.paymentIntentId) {
      return res.status(400).json({ error: 'Payment Intent ID required' });
    }

    const existingAppointment = await Appointment.findOne({
      paymentIntentId: appointmentData.paymentIntentId
    });

    if (existingAppointment) {
      return res.json({ appointment: existingAppointment, message: 'Already created' });
    }

    const appointment = new Appointment({
      ...appointmentData,
      status: 'pending',
      paymentStatus: 'paid',
      payOnline: true
    });

    await appointment.save();
    res.status(201).json({ appointment, message: 'Appointment created' });
  } catch (error) {
    console.error('❌ Appointment error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* 🔍 CHECK STRIPE STATUS */
router.get('/stripe/status', verifyToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ connected: false, error: 'Stripe not configured' });
    }

    const barberId = req.user.barberId || req.user.id;
    if (!barberId) {
      return res.status(400).json({ connected: false, error: 'Barber ID missing' });
    }

    const barber = await Barber.findById(barberId);
    if (!barber) {
      return res.status(404).json({ connected: false, error: 'Barber not found' });
    }

    if (!barber.stripeAccountId) {
      return res.json({ connected: false, message: 'No Stripe account linked' });
    }

    try {
      const account = await stripe.accounts.retrieve(barber.stripeAccountId);
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
      console.error('❌ Invalid Stripe account:', stripeError.message);
      barber.stripeAccountId = null;
      await barber.save();
      return res.json({ connected: false, error: 'Invalid account', needsReconnect: true });
    }
  } catch (error) {
    console.error('❌ Status check error:', error);
    res.status(500).json({ connected: false, error: error.message });
  }
});

/* 🔗 CONNECT STRIPE ACCOUNT */
router.post('/stripe/connect', verifyToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const barberId = req.user.barberId || req.user.id;
    const barber = await Barber.findById(barberId);
    if (!barber) {
      return res.status(404).json({ error: 'Barber not found' });
    }

    // Check existing account
    if (barber.stripeAccountId) {
      try {
        const account = await stripe.accounts.retrieve(barber.stripeAccountId);
        if (account && account.id) {
          return res.json({ message: 'Already connected', accountId: account.id });
        }
      } catch (error) {
        console.log('⚠️ Existing account invalid, creating new');
        barber.stripeAccountId = null;
        await barber.save();
      }
    }

    // Create new Express account
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
        product_description: 'Barbershop services',
        support_email: barber.email
      },
      metadata: {
        barberId: barber._id.toString(),
        barberName: barber.name
      }
    });

    barber.stripeAccountId = account.id;
    await barber.save();

    // Return account ID - frontend will handle onboarding internally
    res.json({
      accountId: account.id,
      message: 'Account created - complete setup in dashboard',
      needsOnboarding: true
    });

  } catch (error) {
    console.error('❌ Connect error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* 🏦 GET BANK ACCOUNTS */
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

    const externalAccounts = await stripe.accounts.listExternalAccounts(
      barber.stripeAccountId,
      { object: 'bank_account', limit: 10 }
    );

    res.json({ bankAccounts: externalAccounts.data || [] });
  } catch (error) {
    console.error('❌ Get banks error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* ➕ ADD BANK ACCOUNT (WORKING - Test Mode) */
router.post('/stripe/add-bank-account', verifyToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const { accountHolderName, accountNumber, sortCode, setAsDefault } = req.body;
    
    if (!accountHolderName || !accountNumber || !sortCode) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const barberId = req.user.barberId || req.user.id;
    const barber = await Barber.findById(barberId);

    if (!barber || !barber.stripeAccountId) {
      return res.status(404).json({ error: 'No Stripe account found' });
    }

    // For UK bank accounts - Create bank account token
    const token = await stripe.tokens.create({
      bank_account: {
        country: 'GB',
        currency: 'gbp',
        account_holder_name: accountHolderName,
        account_holder_type: 'individual',
        routing_number: sortCode, // UK sort code (6 digits)
        account_number: accountNumber // UK account number (8 digits)
      }
    });

    console.log('✅ Bank token created:', token.id);

    // Add to Connect account as external account
    const bankAccount = await stripe.accounts.createExternalAccount(
      barber.stripeAccountId,
      { external_account: token.id }
    );

    console.log('✅ Bank added to Connect account:', bankAccount.id);

    // Set as default for GBP if requested
    if (setAsDefault) {
      await stripe.accounts.update(barber.stripeAccountId, {
        default_for_currency: { gbp: bankAccount.id }
      });
      console.log('✅ Set as default bank');
    }

    res.json({
      message: 'Bank account added successfully',
      bankAccount: {
        id: bankAccount.id,
        last4: bankAccount.last4,
        bank_name: bankAccount.bank_name
      }
    });

  } catch (error) {
    console.error('❌ Add bank error:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.raw?.message || error.code || 'Invalid bank details'
    });
  }
});

/* 🗑️ DELETE BANK ACCOUNT (NEW) */
router.delete('/stripe/bank-accounts/:bankId', verifyToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const barberId = req.user.barberId || req.user.id;
    const barber = await Barber.findById(barberId);

    if (!barber || !barber.stripeAccountId) {
      return res.status(404).json({ error: 'No Stripe account found' });
    }

    await stripe.accounts.deleteExternalAccount(
      barber.stripeAccountId,
      req.params.bankId
    );

    res.json({ message: 'Bank account removed' });
  } catch (error) {
    console.error('❌ Delete bank error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* ⭐ SET DEFAULT BANK (NEW) */
router.put('/stripe/bank-accounts/:bankId/default', verifyToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const barberId = req.user.barberId || req.user.id;
    const barber = await Barber.findById(barberId);

    if (!barber || !barber.stripeAccountId) {
      return res.status(404).json({ error: 'No Stripe account found' });
    }

    await stripe.accounts.update(barber.stripeAccountId, {
      default_for_currency: { gbp: req.params.bankId }
    });

    res.json({ message: 'Default bank account updated' });
  } catch (error) {
    console.error('❌ Set default error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* 💸 TRANSFER PENDING PAYMENTS */
router.post('/stripe/transfer-pending', verifyToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const barberId = req.user.barberId || req.user.id;
    const barber = await Barber.findById(barberId);

    if (!barber || !barber.stripeAccountId) {
      return res.status(404).json({ error: 'No Stripe account' });
    }

    // Verify account ready
    const account = await stripe.accounts.retrieve(barber.stripeAccountId);
    if (!account.charges_enabled || !account.payouts_enabled) {
      return res.status(400).json({ error: 'Complete Stripe setup first' });
    }

    // Find pending payments
    const pendingPayments = await Payment.find({
      barber: barber._id,
      status: 'succeeded',
      transferStatus: 'pending'
    });

    if (pendingPayments.length === 0) {
      return res.json({ message: 'No pending payments', transferred: 0 });
    }

    let successCount = 0;
    let totalTransferred = 0;

    // Transfer each
    for (const payment of pendingPayments) {
      try {
        const transfer = await stripe.transfers.create({
          amount: Math.round(payment.barberAmount * 100),
          currency: 'gbp',
          destination: barber.stripeAccountId,
          metadata: {
            paymentId: payment._id.toString(),
            barberId: barber._id.toString()
          }
        });

        payment.stripeTransferId = transfer.id;
        payment.transferStatus = 'completed';
        await payment.save();

        successCount++;
        totalTransferred += payment.barberAmount;
      } catch (err) {
        console.error('Transfer failed:', err.message);
        payment.transferStatus = 'failed';
        payment.errorMessage = err.message;
        await payment.save();
      }
    }

    res.json({
      message: `Transferred ${successCount} payment(s)`,
      transferred: successCount,
      total: pendingPayments.length,
      amount: totalTransferred.toFixed(2)
    });

  } catch (error) {
    console.error('❌ Transfer error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* 💰 GET BARBER PAYMENTS */
router.get('/barber/me', verifyToken, async (req, res) => {
  try {
    const barberId = req.user.barberId || req.user.id;
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
    console.error('❌ Get payments error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;