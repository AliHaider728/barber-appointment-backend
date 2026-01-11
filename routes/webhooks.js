// backend/routes/webhooks.js - FIXED VERSION
import express from 'express';
import Appointment from '../models/Appointment.js';
import Payment from '../models/Payment.js';
import Barber from '../models/Barber.js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

// STRIPE INITIALIZATION
let stripe = null;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (STRIPE_SECRET_KEY) {
  try {
    const { default: Stripe } = await import('stripe');
    stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
    console.log('✅ Stripe initialized for webhooks');
  } catch (err) {
    console.error('❌ Stripe import failed:', err.message);
  }
}

const PLATFORM_FEE_PERCENTAGE = 10;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

/* 🎯 MAIN WEBHOOK ENDPOINT */
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) {
    console.error('❌ Stripe not configured');
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify webhook signature
    if (WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
      console.log(`✅ Webhook verified: ${event.type}`);
    } else {
      event = JSON.parse(req.body.toString());
      console.log(`⚠️ Webhook (no verification): ${event.type}`);
    }
  } catch (err) {
    console.error('❌ Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`\n🔔 Processing: ${event.type}`);
  console.log('📦 Event Data:', JSON.stringify(event.data.object, null, 2));

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'account.updated':
        await handleAccountUpdated(event.data.object);
        break;

      case 'transfer.created':
        await handleTransferCreated(event.data.object);
        break;

      case 'transfer.updated':
        await handleTransferUpdated(event.data.object);
        break;

      case 'transfer.reversed':
      case 'transfer.failed':
        await handleTransferFailed(event.data.object);
        break;

      default:
        console.log(`ℹ️ Unhandled: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/* 💰 PAYMENT SUCCESS HANDLER */
async function handlePaymentSuccess(paymentIntent) {
  console.log('\n💰 Payment Success:', paymentIntent.id);

  try {
    // Find appointment
    const appointment = await Appointment.findOne({ 
      paymentIntentId: paymentIntent.id 
    }).populate('barber');

    if (!appointment) {
      console.error('❌ Appointment not found:', paymentIntent.id);
      return;
    }

    console.log('✅ Found appointment:', appointment._id);

    // Calculate amounts
    const totalAmount = paymentIntent.amount / 100;
    const platformFee = (totalAmount * PLATFORM_FEE_PERCENTAGE) / 100;
    const barberAmount = totalAmount - platformFee;

    console.log(`💵 Breakdown:
    - Total: £${totalAmount}
    - Platform (10%): £${platformFee}
    - Barber (90%): £${barberAmount}`);

    // Check existing payment
    let payment = await Payment.findOne({ 
      stripePaymentIntentId: paymentIntent.id 
    });

    if (!payment) {
      // Create payment record
      payment = new Payment({
        appointment: appointment._id,
        barber: appointment.barber._id,
        customerEmail: paymentIntent.receipt_email || appointment.email,
        customerName: paymentIntent.metadata?.customerName || appointment.customerName,
        totalAmount,
        platformFee,
        barberAmount,
        stripePaymentIntentId: paymentIntent.id,
        status: 'succeeded',
        transferStatus: 'pending',
        paymentMethod: 'card'
      });

      await payment.save();
      console.log('✅ Payment created:', payment._id);
    } else {
      // Update existing
      payment.status = 'succeeded';
      await payment.save();
      console.log('✅ Payment updated:', payment._id);
    }

    // Update appointment
    appointment.status = 'confirmed';
    appointment.paymentStatus = 'paid';
    await appointment.save();
    console.log('✅ Appointment confirmed');

    // Try transfer to barber
    if (appointment.barber.stripeAccountId) {
      console.log('🔄 Initiating transfer to barber...');
      await transferToBarber(payment, appointment.barber);
    } else {
      console.log(`⚠️ Barber "${appointment.barber.name}" has no Stripe account - holding payment`);
    }

  } catch (error) {
    console.error('❌ Payment success error:', error);
    throw error;
  }
}

/* ❌ PAYMENT FAILED HANDLER */
async function handlePaymentFailed(paymentIntent) {
  console.log('\n❌ Payment Failed:', paymentIntent.id);

  try {
    const appointment = await Appointment.findOne({ 
      paymentIntentId: paymentIntent.id 
    });

    if (appointment) {
      appointment.status = 'rejected';
      appointment.paymentStatus = 'failed';
      await appointment.save();
    }

    const payment = await Payment.findOne({ 
      stripePaymentIntentId: paymentIntent.id 
    });

    if (payment) {
      payment.status = 'failed';
      payment.errorMessage = paymentIntent.last_payment_error?.message || 'Payment failed';
      await payment.save();
    }

  } catch (error) {
    console.error('❌ Payment failed handler error:', error);
  }
}

/* 👤 ACCOUNT UPDATED HANDLER */
async function handleAccountUpdated(account) {
  console.log('\n👤 Account Updated:', account.id);

  try {
    const barber = await Barber.findOne({ stripeAccountId: account.id });

    if (!barber) {
      console.log('⚠️ Barber not found for account:', account.id);
      return;
    }

    console.log(`✅ Barber: ${barber.name}`);

    const isFullyOnboarded = account.details_submitted && 
                            account.charges_enabled && 
                            account.payouts_enabled;

    console.log(`📊 Onboarding Status:
    - Details: ${account.details_submitted}
    - Charges: ${account.charges_enabled}
    - Payouts: ${account.payouts_enabled}`);

    if (isFullyOnboarded) {
      console.log('✅ Fully onboarded - transferring pending payments');
      await transferPendingPayments(barber);
    }

  } catch (error) {
    console.error('❌ Account update error:', error);
  }
}

/* 💸 TRANSFER PENDING PAYMENTS */
async function transferPendingPayments(barber) {
  try {
    const pendingPayments = await Payment.find({
      barber: barber._id,
      status: 'succeeded',
      transferStatus: 'pending'
    });

    console.log(`📋 Found ${pendingPayments.length} pending payment(s)`);

    for (const payment of pendingPayments) {
      await transferToBarber(payment, barber);
    }

  } catch (error) {
    console.error('❌ Transfer pending error:', error);
  }
}

/* 🚀 TRANSFER TO BARBER */
async function transferToBarber(payment, barber) {
  if (!stripe) {
    console.error('❌ Stripe not available');
    return;
  }

  try {
    console.log(`\n🚀 Transferring £${payment.barberAmount.toFixed(2)} to ${barber.name}`);

    // Verify account
    const account = await stripe.accounts.retrieve(barber.stripeAccountId);
    
    if (!account.charges_enabled || !account.payouts_enabled) {
      console.log('⚠️ Account not ready for transfers');
      return;
    }

    // Create transfer
    const transfer = await stripe.transfers.create({
      amount: Math.round(payment.barberAmount * 100),
      currency: 'gbp',
      destination: barber.stripeAccountId,
      metadata: {
        paymentId: payment._id.toString(),
        appointmentId: payment.appointment.toString(),
        barberId: barber._id.toString(),
        barberName: barber.name,
        customerName: payment.customerName
      },
      description: `Payment for ${payment.customerName} - Appointment ${payment.appointment}`
    });

    // Update payment
    payment.stripeTransferId = transfer.id;
    payment.transferStatus = 'completed';
    await payment.save();

    console.log('✅ Transfer successful:', transfer.id);

  } catch (error) {
    console.error('❌ Transfer failed:', error.message);
    
    payment.transferStatus = 'failed';
    payment.errorMessage = error.message;
    await payment.save();
  }
}

/* ✅ TRANSFER CREATED */
async function handleTransferCreated(transfer) {
  console.log('\n✅ Transfer Created:', transfer.id);

  try {
    const payment = await Payment.findOne({ 
      stripeTransferId: transfer.id 
    });

    if (payment && payment.transferStatus === 'pending') {
      payment.transferStatus = 'completed';
      await payment.save();
      console.log('✅ Payment status updated');
    }

  } catch (error) {
    console.error('❌ Transfer created error:', error);
  }
}

/* 🔄 TRANSFER UPDATED */
async function handleTransferUpdated(transfer) {
  console.log('\n🔄 Transfer Updated:', transfer.id, '- Status:', transfer.status);

  try {
    const payment = await Payment.findOne({ 
      stripeTransferId: transfer.id 
    });

    if (payment) {
      if (transfer.status === 'paid' || transfer.status === 'in_transit') {
        payment.transferStatus = 'completed';
        await payment.save();
        console.log('✅ Transfer paid to barber');
      } else if (transfer.status === 'failed' || transfer.status === 'canceled') {
        payment.transferStatus = 'failed';
        payment.errorMessage = `Transfer ${transfer.status}`;
        await payment.save();
        console.log('❌ Transfer failed/canceled');
      }
    }

  } catch (error) {
    console.error('❌ Transfer update error:', error);
  }
}

/* ❌ TRANSFER FAILED */
async function handleTransferFailed(transfer) {
  console.log('\n❌ Transfer Failed:', transfer.id);

  try {
    const payment = await Payment.findOne({ 
      stripeTransferId: transfer.id 
    });

    if (payment) {
      payment.transferStatus = 'failed';
      payment.errorMessage = 'Transfer reversed or failed';
      await payment.save();
      console.log('❌ Payment marked as failed');
    }

  } catch (error) {
    console.error('❌ Transfer failed handler error:', error);
  }
}

/* 🔁 MANUAL RETRY ENDPOINT */
router.post('/retry-transfer/:paymentId', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId)
      .populate('barber');

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.transferStatus === 'completed') {
      return res.status(400).json({ error: 'Already transferred' });
    }

    if (!payment.barber.stripeAccountId) {
      return res.status(400).json({ error: 'Barber has no Stripe account' });
    }

    await transferToBarber(payment, payment.barber);

    res.json({ 
      success: true, 
      message: 'Transfer retry initiated',
      transferStatus: payment.transferStatus
    });

  } catch (error) {
    console.error('❌ Retry error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;