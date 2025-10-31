// routes/appointments.js
import express from 'express';
import Appointment from '../models/Appointment.js';
import Service from '../models/Service.js';

const router = express.Router();

// POST - Create appointment with totalPrice
router.post('/', async (req, res) => {
  try {
    const { customerName, email, phone, date, selectedServices, barber, branch } = req.body;

    if (!selectedServices || selectedServices.length === 0) {
      return res.status(400).json({ message: 'At least one service required' });
    }

    // Fetch service details
    const serviceIds = selectedServices.map(s => s.serviceRef);
    const services = await Service.find({ _id: { $in: serviceIds } });

    // Build services array with price
    const enrichedServices = selectedServices.map(selected => {
      const service = services.find(s => s._id.toString() === selected.serviceRef);
      if (!service) throw new Error(`Service not found: ${selected.serviceRef}`);
      return {
        serviceRef: service._id,
        name: service.name,
        price: service.price
      };
    });

    // Calculate total
    const totalPrice = enrichedServices.reduce((sum, s) => {
      return sum + parseFloat(s.price.replace('£', ''));
    }, 0);

    // Save appointment
    const appointment = new Appointment({
      customerName,
      email,
      phone,
      date: new Date(date),
      services: enrichedServices,
      totalPrice,
      barber,
      branch,
      status: 'pending'
    });

    await appointment.save();

    // Populate for response
    const populated = await Appointment.findById(appointment._id)
      .populate('branch', 'name city')
      .populate('services.serviceRef', 'name price');

    res.status(201).json(populated);
  } catch (error) {
    console.error('POST appointment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET all with totalPrice
router.get('/', async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .populate('branch', 'name city')
      .populate('services.serviceRef', 'name price')
      .sort({ date: -1 });

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT - Update status
router.put('/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'confirmed', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    )
      .populate('branch', 'name city')
      .populate('services.serviceRef', 'name price');

    res.json(appointment);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;