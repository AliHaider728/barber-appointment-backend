import express from 'express';
import Appointment from '../models/Appointment.js';
import Payment from '../models/Payment.js';
import Barber from '../models/Barber.js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

//   SANDBOX STRIPE INITIALIZATION
let stripe = null;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (STRIPE_SECRET_KEY) {
  try {
    const { default: Stripe } = await import('stripe');
    stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
    console.log('  Stripe initialized for webhooks (SANDBOX)');
  } catch (err) {
    console.error('  Stripe import failed:', err.message);
  }
}

const PLATFORM_FEE_PERCENTAGE = 10;

//   IMPORTANT: Get this from Stripe Dashboard → Developers → Webhooks
// For testing, you can leave it empty, but for production use the signing secret
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

/*   MAIN WEBHOOK ENDPOINT */
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) {
    console.error('  Stripe not configured');
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify webhook signature (if secret is configured)
    if (WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
      console.log(`  Webhook signature verified: ${event.type}`);
    } else {
      // For testing without webhook secret
      event = JSON.parse(req.body.toString());
      console.log(`  Webhook received (no signature verification): ${event.type}`);
    }
  } catch (err) {
    console.error('  Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Processing webhook: ${event.type}`);

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
        await handleTransferReversed(event.data.object);
        break;

      case 'transfer.updated':
        await handleTransferUpdated(event.data.object);
        break;

      case 'transfer.failed':
        // Legacy event name - same handler
        await handleTransferReversed(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('  Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/*   PAYMENT SUCCESS HANDLER */
async function handlePaymentSuccess(paymentIntent) {
  
  console.log('Processing successful payment:', paymentIntent.id);

  try {
    // Find appointment by payment intent ID
    const appointment = await Appointment.findOne({ 
      paymentIntentId: paymentIntent.id 
    }).populate('barber');
 
    if (!appointment) {
      console.error('  Appointment not found for payment:', paymentIntent.id);
      return;
    }

    console.log('Found appointment:', appointment._id);

    // Calculate amounts
    const totalAmount = paymentIntent.amount / 100; // Convert cents to pounds
    const platformFee = (totalAmount * PLATFORM_FEE_PERCENTAGE) / 100;
    const barberAmount = totalAmount - platformFee;

    console.log(`  Amount breakdown:
      - Total: £${totalAmount}
      - Platform Fee (10%): £${platformFee}
      - Barber Share (90%): £${barberAmount}`);

    // Check if payment record already exists
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
      console.log('  Payment record created:', payment._id);
    } else {
      console.log(' Payment record already exists:', payment._id);
    }

    // Update appointment status
    if (appointment.status === 'pending') {
      appointment.status = 'confirmed';
      appointment.paymentStatus = 'paid';
      await appointment.save();
      console.log('  Appointment confirmed:', appointment._id);
    }

    // Transfer to barber if they have Stripe account
    if (appointment.barber.stripeAccountId) {
      console.log('  Barber has Stripe account - initiating transfer');
      await transferToBarber(payment, appointment.barber);
    } else {
      console.log(`  Barber "${appointment.barber.name}" has no Stripe account - payment held`);
    }

  } catch (error) {
    console.error('  Error handling payment success:', error);
    throw error;
  }
}

/*   PAYMENT FAILED HANDLER */
async function handlePaymentFailed(paymentIntent) {
  console.log('  Payment failed:', paymentIntent.id);

  try {
    const appointment = await Appointment.findOne({ 
      paymentIntentId: paymentIntent.id 
    });

    if (appointment) {
      appointment.status = 'rejected';
      appointment.paymentStatus = 'failed';
      await appointment.save();
      console.log('  Appointment marked as rejected:', appointment._id);
    }

    const payment = await Payment.findOne({ 
      stripePaymentIntentId: paymentIntent.id 
    });

    if (payment) {
      payment.status = 'failed';
      payment.errorMessage = paymentIntent.last_payment_error?.message || 'Payment failed';
      await payment.save();
      console.log('Payment record updated as failed:', payment._id);
    }

  } catch (error) {
    console.error('Error handling payment failure:', error);
  }
}

/*   ACCOUNT UPDATED HANDLER */
async function handleAccountUpdated(account) {
  console.log('  Stripe account updated:', account.id);

  try {
    // Find barber with this Stripe account
    const barber = await Barber.findOne({ stripeAccountId: account.id });

    if (!barber) {
      console.log('  Barber not found for account:', account.id);
      return;
    }

    console.log('  Found barber:', barber.name);

    // Check if account is now fully onboarded
    const isFullyOnboarded = account.details_submitted && 
                            account.charges_enabled && 
                            account.payouts_enabled;

    if (isFullyOnboarded) {
      console.log(`  Barber "${barber.name}" is now fully onboarded`);
      
      // Transfer all pending payments to this barber
      await transferPendingPayments(barber);
    } else {
      console.log(`  Barber "${barber.name}" onboarding incomplete:
        - Details submitted: ${account.details_submitted}
        - Charges enabled: ${account.charges_enabled}
        - Payouts enabled: ${account.payouts_enabled}`);
    }

  } catch (error) {
    console.error('  Error handling account update:', error);
  }
}

/*   TRANSFER PENDING PAYMENTS */
async function transferPendingPayments(barber) {
  try {
    // Find all pending payments for this barber
    const pendingPayments = await Payment.find({
      barber: barber._id,
      status: 'succeeded',
      transferStatus: 'pending'
    });

    console.log(`  Found ${pendingPayments.length} pending payment(s) for "${barber.name}"`);

    // Transfer each payment
    for (const payment of pendingPayments) {
      await transferToBarber(payment, barber);
    }

  } catch (error) {
    console.error('  Error transferring pending payments:', error);
  }
}

/*   TRANSFER TO BARBER */
async function transferToBarber(payment, barber) {
  if (!stripe) {
    console.error('  Stripe not available for transfer');
    return;
  }

  try {
    console.log(`  Transferring £${payment.barberAmount.toFixed(2)} to "${barber.name}"`);

    // Verify barber has valid Stripe account
    const account = await stripe.accounts.retrieve(barber.stripeAccountId);
    
    if (!account.charges_enabled || !account.payouts_enabled) {
      console.log(`  Barber account not ready for transfers yet`);
      return;
    }

    // Create transfer
    const transfer = await stripe.transfers.create({
      amount: Math.round(payment.barberAmount * 100), // Convert to cents
      currency: 'gbp',
      destination: barber.stripeAccountId,
      metadata: {
        paymentId: payment._id.toString(),
        barberId: barber._id.toString(),
        barberName: barber.name
      }
    });

    // Update payment record
    payment.stripeTransferId = transfer.id;
    payment.transferStatus = 'completed';
    await payment.save();

    console.log('  Transfer successful:', transfer.id);

  } catch (error) {
    console.error('  Transfer failed:', error.message);
    
    payment.transferStatus = 'failed';
    payment.errorMessage = error.message;
    await payment.save();
  }
}

/*   TRANSFER CREATED HANDLER */
async function handleTransferCreated(transfer) {
  console.log('   Transfer created:', transfer.id);

  try {
    const payment = await Payment.findOne({ 
      stripeTransferId: transfer.id 
    });

    if (payment && payment.transferStatus === 'pending') {
      payment.transferStatus = 'completed';
      await payment.save();
      console.log('  Payment transfer status updated to completed');
    }

  } catch (error) {
    console.error('  Error handling transfer created:', error);
  }
}

/*   TRANSFER REVERSED HANDLER (Updated name) */
async function handleTransferReversed(transfer) {
  console.log('  Transfer reversed:', transfer.id);

  try {
    const payment = await Payment.findOne({ 
      stripeTransferId: transfer.id 
    });

    if (payment) {
      payment.transferStatus = 'failed';
      payment.errorMessage = 'Transfer reversed or failed';
      await payment.save();
      console.log('  Payment transfer status updated to failed');
    }

  } catch (error) {
    console.error('  Error handling transfer reversal:', error);
  }
}

/*   TRANSFER UPDATED HANDLER (replaces transfer.paid) */
async function handleTransferUpdated(transfer) {
  console.log('  Transfer updated:', transfer.id, '- Status:', transfer.status);

  try {
    const payment = await Payment.findOne({ 
      stripeTransferId: transfer.id 
    });


    if (payment) {
      // If transfer is paid/completed
      if (transfer.status === 'paid' || transfer.status === 'in_transit') {
        console.log('  Transfer successfully paid to barber');
        if (payment.transferStatus !== 'completed') {
          payment.transferStatus = 'completed';
          await payment.save();
        }
      }
      // If transfer failed
      else if (transfer.status === 'failed' || transfer.status === 'canceled') {
        payment.transferStatus = 'failed';
        payment.errorMessage = `Transfer ${transfer.status}`;
        await payment.save();
        console.log('  Transfer failed/canceled');
      }
    }

  } catch (error) {
    console.error('  Error handling transfer update:', error);
  }
}

/*   MANUAL RETRY ENDPOINT (for failed transfers) */
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
    console.error('  Retry transfer error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;