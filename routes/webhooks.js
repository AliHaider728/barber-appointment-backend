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
    if (WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
      console.log(`✅ Webhook signature verified: ${event.type}`);
    } else {
      event = JSON.parse(req.body.toString());
      console.log(`⚠️ Webhook received (NO SIGNATURE): ${event.type}`);
    }
  } catch (err) {
    console.error('❌ Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`\n📨 Processing webhook: ${event.type}`);
  console.log(`📝 Event ID: ${event.id}`);

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

      case 'transfer.reversed':
      case 'transfer.failed':
        await handleTransferReversed(event.data.object);
        break;

      case 'transfer.updated':
        await handleTransferUpdated(event.data.object);
        break;

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/* 💳 PAYMENT SUCCESS HANDLER - CRITICAL FIX */
async function handlePaymentSuccess(paymentIntent) {
  console.log('\n💰 Processing successful payment');
  console.log(`   Payment Intent ID: ${paymentIntent.id}`);
  console.log(`   Amount: £${(paymentIntent.amount / 100).toFixed(2)}`);

  try {
    // STEP 1: Find appointment
    const appointment = await Appointment.findOne({ 
      paymentIntentId: paymentIntent.id 
    }).populate('barber');

    if (!appointment) {
      console.error(`❌ CRITICAL: No appointment found for payment ${paymentIntent.id}`);
      console.log('   This payment will be lost if appointment is not linked!');
      return;
    }

    console.log(`✅ Found appointment: ${appointment._id}`);
    console.log(`   Customer: ${appointment.customerName}`);
    console.log(`   Barber: ${appointment.barber?.name}`);

    // STEP 2: Calculate amounts
    const totalAmount = paymentIntent.amount / 100;
    const platformFee = (totalAmount * PLATFORM_FEE_PERCENTAGE) / 100;
    const barberAmount = totalAmount - platformFee;

    console.log(`💵 Amount breakdown:`);
    console.log(`   Total: £${totalAmount.toFixed(2)}`);
    console.log(`   Platform Fee (10%): £${platformFee.toFixed(2)}`);
    console.log(`   Barber Share (90%): £${barberAmount.toFixed(2)}`);

    // STEP 3: Check if payment record exists
    let payment = await Payment.findOne({ 
      stripePaymentIntentId: paymentIntent.id 
    });

    if (payment) {
      console.log(`⚠️ Payment record already exists: ${payment._id}`);
    } else {
      // STEP 4: Create payment record - THIS IS THE KEY FIX
      payment = new Payment({
        appointment: appointment._id,
        barber: appointment.barber._id,
        customerEmail: paymentIntent.receipt_email || appointment.email || 'no-email@temp.com',
        customerName: paymentIntent.metadata?.customerName || appointment.customerName || 'Guest',
        totalAmount,
        platformFee,
        barberAmount,
        stripePaymentIntentId: paymentIntent.id,
        status: 'succeeded',
        transferStatus: 'pending',
        paymentMethod: 'card'
      });

      await payment.save();
      console.log(`✅ Payment record CREATED: ${payment._id}`);
      console.log(`   Barber: ${appointment.barber.name}`);
      console.log(`   Amount: £${barberAmount.toFixed(2)}`);
    }

    // STEP 5: Update appointment status
    if (appointment.status !== 'confirmed') {
      appointment.status = 'confirmed';
      appointment.paymentStatus = 'paid';
      await appointment.save();
      console.log(`✅ Appointment confirmed`);
    }

    // STEP 6: Transfer to barber if account ready
    if (appointment.barber?.stripeAccountId) {
      console.log(`🏦 Barber has Stripe account: ${appointment.barber.stripeAccountId}`);
      await transferToBarber(payment, appointment.barber);
    } else {
      console.log(`⚠️ Barber "${appointment.barber?.name}" has NO Stripe account`);
      console.log(`   Payment will be held until account is connected`);
    }

    console.log(`\n✅ Payment processing complete for ${paymentIntent.id}\n`);

  } catch (error) {
    console.error(`❌ Error in handlePaymentSuccess:`, error);
    console.error(`   Payment Intent: ${paymentIntent.id}`);
    console.error(`   Error: ${error.message}`);
    throw error;
  }
}

/* ❌ PAYMENT FAILED HANDLER */
async function handlePaymentFailed(paymentIntent) {
  console.log(`\n❌ Payment FAILED: ${paymentIntent.id}`);

  try {
    const appointment = await Appointment.findOne({ 
      paymentIntentId: paymentIntent.id 
    });

    if (appointment) {
      appointment.status = 'rejected';
      appointment.paymentStatus = 'failed';
      await appointment.save();
      console.log(`   Appointment marked as rejected`);
    }

    const payment = await Payment.findOne({ 
      stripePaymentIntentId: paymentIntent.id 
    });

    if (payment) {
      payment.status = 'failed';
      payment.errorMessage = paymentIntent.last_payment_error?.message || 'Payment failed';
      await payment.save();
      console.log(`   Payment record updated as failed`);
    }

  } catch (error) {
    console.error(`❌ Error handling payment failure:`, error);
  }
}

/* 🏦 TRANSFER TO BARBER - ENHANCED */
async function transferToBarber(payment, barber) {
  if (!stripe) {
    console.error('❌ Stripe not available');
    return;
  }

  console.log(`\n💸 Attempting transfer to barber`);
  console.log(`   Barber: ${barber.name}`);
  console.log(`   Amount: £${payment.barberAmount.toFixed(2)}`);
  console.log(`   Stripe Account: ${barber.stripeAccountId}`);

  try {
    // Verify account is ready
    const account = await stripe.accounts.retrieve(barber.stripeAccountId);
    
    console.log(`   Account Status:`);
    console.log(`   - Charges Enabled: ${account.charges_enabled}`);
    console.log(`   - Payouts Enabled: ${account.payouts_enabled}`);
    console.log(`   - Details Submitted: ${account.details_submitted}`);

    if (!account.charges_enabled || !account.payouts_enabled) {
      console.log(`⚠️ Account not ready for transfers yet`);
      payment.transferStatus = 'pending';
      await payment.save();
      return;
    }

    // Create transfer
    console.log(`   Creating transfer...`);
    const transfer = await stripe.transfers.create({
      amount: Math.round(payment.barberAmount * 100),
      currency: 'gbp',
      destination: barber.stripeAccountId,
      description: `Payment for appointment ${payment.appointment}`,
      metadata: {
        paymentId: payment._id.toString(),
        barberId: barber._id.toString(),
        barberName: barber.name,
        appointmentId: payment.appointment.toString()
      }
    });

    // Update payment record
    payment.stripeTransferId = transfer.id;
    payment.transferStatus = 'completed';
    await payment.save();

    console.log(`✅ Transfer successful!`);
    console.log(`   Transfer ID: ${transfer.id}`);
    console.log(`   Status: ${transfer.status}`);

  } catch (error) {
    console.error(`❌ Transfer FAILED:`, error.message);
    console.error(`   Error Type: ${error.type}`);
    console.error(`   Error Code: ${error.code}`);
    
    payment.transferStatus = 'failed';
    payment.errorMessage = error.message;
    await payment.save();
  }
}

/* 👤 ACCOUNT UPDATED HANDLER */
async function handleAccountUpdated(account) {
  console.log(`\n🏦 Stripe account updated: ${account.id}`);

  try {
    const barber = await Barber.findOne({ stripeAccountId: account.id });

    if (!barber) {
      console.log(`   No barber found for account`);
      return;
    }

    console.log(`   Barber: ${barber.name}`);

    const isFullyOnboarded = account.details_submitted && 
                            account.charges_enabled && 
                            account.payouts_enabled;

    console.log(`   Onboarding Status:`);
    console.log(`   - Details: ${account.details_submitted}`);
    console.log(`   - Charges: ${account.charges_enabled}`);
    console.log(`   - Payouts: ${account.payouts_enabled}`);
    console.log(`   - Fully Ready: ${isFullyOnboarded}`);

    if (isFullyOnboarded) {
      console.log(`✅ Account fully onboarded - transferring pending payments`);
      await transferPendingPayments(barber);
    }

  } catch (error) {
    console.error(`❌ Error handling account update:`, error);
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

    console.log(`   Found ${pendingPayments.length} pending payment(s)`);

    for (const payment of pendingPayments) {
      console.log(`   Processing payment: ${payment._id}`);
      await transferToBarber(payment, barber);
    }

  } catch (error) {
    console.error(`❌ Error transferring pending payments:`, error);
  }
}

/* ✅ TRANSFER CREATED */
async function handleTransferCreated(transfer) {
  console.log(`\n✅ Transfer created: ${transfer.id}`);
  console.log(`   Amount: £${(transfer.amount / 100).toFixed(2)}`);
  console.log(`   Status: ${transfer.status}`);
}

/* ❌ TRANSFER REVERSED */
async function handleTransferReversed(transfer) {
  console.log(`\n❌ Transfer reversed/failed: ${transfer.id}`);

  try {
    const payment = await Payment.findOne({ 
      stripeTransferId: transfer.id 
    });

    if (payment) {
      payment.transferStatus = 'failed';
      payment.errorMessage = 'Transfer reversed or failed';
      await payment.save();
      console.log(`   Payment status updated to failed`);
    }
  } catch (error) {
    console.error(`❌ Error handling transfer reversal:`, error);
  }
}

/* 🔄 TRANSFER UPDATED */
async function handleTransferUpdated(transfer) {
  console.log(`\n🔄 Transfer updated: ${transfer.id}`);
  console.log(`   Status: ${transfer.status}`);

  try {
    const payment = await Payment.findOne({ 
      stripeTransferId: transfer.id 
    });

    if (payment) {
      if (transfer.status === 'paid' || transfer.status === 'in_transit') {
        payment.transferStatus = 'completed';
        await payment.save();
        console.log(`   Payment marked as completed`);
      } else if (transfer.status === 'failed' || transfer.status === 'canceled') {
        payment.transferStatus = 'failed';
        payment.errorMessage = `Transfer ${transfer.status}`;
        await payment.save();
        console.log(`   Payment marked as failed`);
      }
    }
  } catch (error) {
    console.error(`❌ Error handling transfer update:`, error);
  }
}

/* 🔄 MANUAL RETRY ENDPOINT */
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
    console.error('❌ Retry transfer error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;