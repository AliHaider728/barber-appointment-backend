// backend/routes/appointments.js
import express from 'express';
import Appointment from '../models/Appointment.js';

const router = express.Router();

// GET all appointments with populated branch name
router.get('/', async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .populate('branch', 'name city') // Branch name + city
      .sort({ date: -1 }); // Latest first
    res.json(appointments);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST new appointment (status = pending by default)
router.post('/', async (req, res) => {
  const { customerName, email, phone, date, service, barber, branch } = req.body;

  try {
    const appointment = new Appointment({
      customerName,
      email,
      phone,
      date,
      service,
      barber,
      branch,
      status: 'pending', // Default status
    });

    await appointment.save();
    const populated = await Appointment.findById(appointment._id).populate('branch', 'name');
    res.status(201).json(populated);
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// UPDATE appointment status (Approve / Reject)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // Only allow status update

  if (!['pending', 'confirmed', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    const appointment = await Appointment.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).populate('branch', 'name');

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    res.json(appointment);
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE appointment
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const appointment = await Appointment.findByIdAndDelete(id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    res.json({ message: 'Appointment deleted successfully' });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;