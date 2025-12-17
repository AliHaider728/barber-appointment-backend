// routes/webhooks.js
import express from 'express';
import Appointment from '../models/Appointment.js';
import Payment from '../models/Payment.js';
import Barber from '../models/Barber.js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    const { Stripe } = await import('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
  } catch (err) {
  }
}

const PLATFORM_FEE_PERCENTAGE = 10;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  if (!WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Webhook secret not configured' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

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
      case 'transfer.failed':
        await handleTransferFailed(event.data.object);
        break;
      default:
    }

    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function handlePaymentSuccess(paymentIntent) {
  try {
    const appointment = await Appointment.findOne({ 
      paymentIntentId: paymentIntent.id 
    }).populate('barber');

    if (!appointment) {
      return;
    }

    const totalAmount = paymentIntent.amount / 100;
    const platformFee = (totalAmount * PLATFORM_FEE_PERCENTAGE) / 100;
    const barberAmount = totalAmount - platformFee;

    let payment = await Payment.findOne({ 
      stripePaymentIntentId: paymentIntent.id 
    });

    if (!payment) {
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
    }

    if (appointment.status === 'pending') {
      appointment.status = 'confirmed';
      appointment.paymentStatus = 'paid';
      await appointment.save();
    }

    if (appointment.barber.stripeAccountId) {
      await transferToBarber(payment, appointment.barber);
    }

  } catch (error) {
  }
}

async function handlePaymentFailed(paymentIntent) {
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
  }
}

async function handleAccountUpdated(account) {
  try {
    const barber = await Barber.findOne({ stripeAccountId: account.id });

    if (!barber) {
      return;
    }

    if (account.details_submitted && account.charges_enabled && account.payouts_enabled) {
      await transferPendingPayments(barber);
    }

  } catch (error) {
  }
}

async function transferPendingPayments(barber) {
  try {
    const pendingPayments = await Payment.find({
      barber: barber._id,
      status: 'succeeded',
      transferStatus: 'pending'
    });

    for (const payment of pendingPayments) {
      await transferToBarber(payment, barber);
    }

  } catch (error) {
  }
}

async function transferToBarber(payment, barber) {
  if (!stripe) {
    return;
  }

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

  } catch (error) {
    payment.transferStatus = 'failed';
    payment.errorMessage = error.message;
    await payment.save();
  }
}

async function handleTransferCreated(transfer) {
  try {
    const payment = await Payment.findOne({ 
      stripeTransferId: transfer.id 
    });

    if (payment && payment.transferStatus === 'pending') {
      payment.transferStatus = 'completed';
      await payment.save();
    }

  } catch (error) {
  }
}

async function handleTransferFailed(transfer) {
  try {
    const payment = await Payment.findOne({ 
      stripeTransferId: transfer.id 
    });

    if (payment) {
      payment.transferStatus = 'failed';
      payment.errorMessage = 'Transfer to barber failed';
      await payment.save();
    }

  } catch (error) {
  }
}

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
    res.status(500).json({ error: error.message });
  }
});

export default router;