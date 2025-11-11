import express from 'express';
import Appointment from '../models/Appointment.js';
import Service from '../models/Service.js';
import Barber from '../models/Barber.js';
import mongoose from 'mongoose';

const router = express.Router();

// CREATE APPOINTMENT
router.post('/', async (req, res) => {
  try {
    const { customerName, email, phone, date, selectedServices, barber, branch, duration } = req.body;

    if (!customerName || !email || !phone || !date || !barber || !branch || !duration) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!selectedServices || selectedServices.length === 0) {
      return res.status(400).json({ message: 'At least one service required' });
    }

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(barber) || !mongoose.Types.ObjectId.isValid(branch)) {
      return res.status(400).json({ message: 'Invalid barber or branch ID' });
    }

    // Fetch service details
    const serviceIds = selectedServices.map(s => s.serviceRef);
    const services = await Service.find({ _id: { $in: serviceIds } });

    if (services.length !== serviceIds.length) {
      return res.status(400).json({ message: 'One or more services not found' });
    }

    // Build enriched services
    const enrichedServices = selectedServices.map(sel => {
      const service = services.find(s => s._id.toString() === sel.serviceRef);
      return {
        serviceRef: service._id,
        name: service.name,
        price: service.price,
        duration: service.duration
      };
    });

    // Calculate total price
    const totalPrice = enrichedServices.reduce((sum, s) => {
      return sum + parseFloat(s.price.replace('£', ''));
    }, 0);

    // Create appointment
    const appointment = new Appointment({
      customerName: customerName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      date: new Date(date),
      services: enrichedServices,
      totalPrice,
      duration,
      barber,
      branch,
      status: 'pending'
    });

    await appointment.save();

    // Populate response
    const populated = await Appointment.findById(appointment._id)
      .populate('barber', 'name')
      .populate('branch', 'name city')
      .populate('services.serviceRef', 'name price duration');

    res.status(201).json(populated);
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ GET ALL APPOINTMENTS (YE ROUTE MISSING THA!)
router.get('/', async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .populate('barber', 'name')
      .populate('branch', 'name city address')
      .populate('services.serviceRef', 'name price duration')
      .sort({ date: -1 }); // Latest appointments first

    res.json(appointments);
  } catch (error) {
    console.error('GET all appointments error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET BY BARBER & DATE (for time slots)
router.get('/barber/:barberId/date/:date', async (req, res) => {
  try {
    const { barberId, date } = req.params;
    
    const start = new Date(date);
    const end = new Date(date);
    end.setDate(end.getDate() + 1);

    const bookings = await Appointment.find({
      barber: barberId,
      date: { $gte: start, $lt: end }
    }).select('date duration status');

    res.json(Array.isArray(bookings) ? bookings : []);
  } catch (error) {
    console.error('GET bookings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// UPDATE STATUS
router.put('/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'confirmed', 'rejected', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    )
      .populate('barber', 'name')
      .populate('branch', 'name city')
      .populate('services.serviceRef', 'name price');

    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    res.json(appointment);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndDelete(req.params.id);
    if (!appointment) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;