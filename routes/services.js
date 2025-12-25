import express from 'express';
import Service from '../models/Service.js';
import { authenticateBranchAdmin, checkPermission } from './auth.js'; 

const router = express.Router();

// GET all services - for main admin
router.get('/', async (req, res) => {
  try {
    const services = await Service.find().populate('branches', 'name').sort({ gender: 1, name: 1 });
    console.log(` GET /api/services → ${services.length} services found`);
    res.json(services);
  } catch (error) {
    console.error(' GET services error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET services by gender - for main admin
router.get('/gender/:gender', async (req, res) => {
  try {
    const { gender } = req.params;
    
    if (!['male', 'female'].includes(gender.toLowerCase())) {
      return res.status(400).json({ message: 'Gender must be "male" or "female"' });
    }
    
    const services = await Service.find({ gender: gender.toLowerCase() }).populate('branches', 'name');
    console.log(` GET /api/services/gender/${gender} → ${services.length} services found`);
    res.json(services);
  } catch (error) {
    console.error(' GET services by gender error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// CREATE service - for main admin
router.post('/', async (req, res) => {
  try {
    const { name, duration, price, gender, branches } = req.body;

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
      gender: gender.toLowerCase(),
      branches: branches || []
    });

    await service.save();
    const populated = await Service.findById(service._id).populate('branches', 'name');
    console.log(' Service created:', service._id, '-', service.name);
    res.status(201).json(populated);
  } catch (error) {
    console.error(' CREATE service error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// UPDATE service - for main admin
router.put('/:id', async (req, res) => {
  try {
    const { name, duration, price, gender, branches } = req.body;

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
      gender: gender.toLowerCase(),
      branches: branches || []
    };

    const service = await Service.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    ).populate('branches', 'name');

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

// DELETE service - for main admin
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

// For branch admin - get services for their branch
router.get('/branch', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const services = await Service.find({ branches: req.branchId }).sort({ gender: 1, name: 1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// For branch admin - add service for their branch
router.post('/branch', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const { name, duration, price, gender } = req.body;
    // Similar validation as above

    const service = new Service({ 
      name, duration, price, gender,
      branches: [req.branchId]
    });

    await service.save();
    res.status(201).json(service);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// For branch admin - update service if in their branch
router.put('/:id', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });
    
    if (!service.branches.includes(req.branchId)) {
      return res.status(403).json({ message: 'Unauthorized to update this service' });
    }

    const updated = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// For branch admin - delete service if in their branch
router.delete('/:id', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });
    
    if (!service.branches.includes(req.branchId)) {
      return res.status(403).json({ message: 'Unauthorized to delete this service' });
    }

    await Service.findByIdAndDelete(req.params.id);
    res.json({ message: 'Service deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;