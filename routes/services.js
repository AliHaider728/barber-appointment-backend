// backend/routes/services.js
import express from 'express';
import Service from '../models/Service.js';

const router = express.Router();

// GET all services
router.get('/', async (req, res) => {
  try {
    const services = await Service.find().sort({ gender: 1, name: 1 });
    console.log(` GET /api/services → ${services.length} services found`);
    res.json(services);
  } catch (error) {
    console.error(' GET services error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET services by gender
router.get('/gender/:gender', async (req, res) => {
  try {
    const { gender } = req.params;
    
    if (!['male', 'female'].includes(gender.toLowerCase())) {
      return res.status(400).json({ message: 'Gender must be "male" or "female"' });
    }
    
    const services = await Service.find({ gender: gender.toLowerCase() });
    console.log(` GET /api/services/gender/${gender} → ${services.length} services found`);
    res.json(services);
  } catch (error) {
    console.error(' GET services by gender error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// CREATE service
router.post('/', async (req, res) => {
  try {
    const { name, duration, price, gender } = req.body;

    // Validation
    if (!name || !duration || !price || !gender) {
      return res.status(400).json({ 
        message: 'All fields (name, duration, price, gender) are required' 
      });
    }

    if (!['male', 'female'].includes(gender.toLowerCase())) {
      return res.status(400).json({ 
        message: 'Gender must be either "male" or "female"' 
      });
    }

    // Check duplicate
    const existingService = await Service.findOne({ 
      name: name.trim(), 
      gender: gender.toLowerCase() 
    });
    
    if (existingService) {
      return res.status(400).json({ 
        message: `Service "${name}" already exists for ${gender} category` 
      });
    }

    const service = new Service({ 
      name: name.trim(), 
      duration: duration.trim(), 
      price: price.trim(),
      gender: gender.toLowerCase()
    });

    await service.save();
    console.log(' Service created:', service._id, '-', service.name);
    res.status(201).json(service);
  } catch (error) {
    console.error(' CREATE service error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// UPDATE service
router.put('/:id', async (req, res) => {
  try {
    const { name, duration, price, gender } = req.body;

    // Validation
    if (!name || !duration || !price || !gender) {
      return res.status(400).json({ 
        message: 'All fields are required' 
      });
    }

    if (!['male', 'female'].includes(gender.toLowerCase())) {
      return res.status(400).json({ 
        message: 'Gender must be either "male" or "female"' 
      });
    }

    const updateData = {
      name: name.trim(),
      duration: duration.trim(),
      price: price.trim(),
      gender: gender.toLowerCase()
    };

    const service = await Service.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    );

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    console.log(' Service updated:', service._id);
    res.json(service);
  } catch (error) {
    console.error(' UPDATE service error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// DELETE service
router.delete('/:id', async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    console.log(' Service deleted:', service._id, '-', service.name);
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error(' DELETE service error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
