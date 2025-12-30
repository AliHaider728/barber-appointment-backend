import express from 'express';
import Service from '../models/Service.js';
import Barber from '../models/Barber.js';
import { authenticateBranchAdmin, checkPermission } from './auth.js';

const router = express.Router();

//  HELPER: Normalize branches to always be an array
const normalizeBranches = (branches) => {
  if (!branches) return [];
  if (Array.isArray(branches)) return branches;
  return [branches];
};

//  HELPER: Extract branch ID safely
const extractBranchId = (branch) => {
  if (typeof branch === 'string') return branch;
  if (branch?._id) return branch._id.toString();
  return null;
};

// GET all services - for main admin
router.get('/', async (req, res) => {
  try {
    const services = await Service.find().populate('branches', 'name').sort({ gender: 1, name: 1 });
    console.log(` GET /api/services → ${services.length} services found`);
    res.json(services);
  } catch (error) {
    console.error('  GET services error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET services by gender - for barbers/customers
router.get('/gender/:gender', async (req, res) => {
  try {
    const { gender } = req.params;
    
    if (!['male', 'female'].includes(gender.toLowerCase())) {
      return res.status(400).json({ message: 'Gender must be "male" or "female"' });
    }
    
    const services = await Service.find({ gender: gender.toLowerCase() })
      .populate('branches', 'name city')
      .sort({ name: 1 });
    
    console.log(` GET /api/services/gender/${gender} → ${services.length} services found`);
    res.json(services);
  } catch (error) {
    console.error('  GET services by gender error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET services by branch - for filtering
router.get('/branch/:branchId', async (req, res) => {
  try {
    const { branchId } = req.params;
    
    const services = await Service.find({ branches: branchId })
      .populate('branches', 'name city')
      .sort({ gender: 1, name: 1 });
    
    console.log(` GET /api/services/branch/${branchId} → ${services.length} services found`);
    res.json(services);
  } catch (error) {
    console.error('  GET services by branch error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// CREATE service - for main admin
router.post('/', async (req, res) => {
  try {
    const { name, duration, price, gender, branches } = req.body;

    console.log('  POST /api/services - Received:', req.body);

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

    //  Normalize branches to array
    const normalizedBranches = normalizeBranches(branches);

    const service = new Service({ 
      name: name.trim(), 
      duration: duration.trim(), 
      price: price.trim(),
      gender: gender.toLowerCase(),
      branches: normalizedBranches
    });

    await service.save();

    const populated = await Service.findById(service._id).populate('branches', 'name city');
    console.log(' Service created:', service._id, '-', service.name, '- branches:', normalizedBranches.length);
    res.status(201).json(populated);
  } catch (error) {
    console.error('  CREATE service error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// UPDATE service - for main admin/barbers
router.put('/:id', async (req, res) => {
  try {
    const { name, duration, price, gender, branches } = req.body;

    console.log('  PUT /api/services/:id - Received:', { id: req.params.id, body: req.body });

    // Find existing service first
    const existingService = await Service.findById(req.params.id);
    if (!existingService) {
      return res.status(404).json({ message: 'Service not found' });
    }

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

    //  Normalize branches - handle both array and single values
    let normalizedBranches = normalizeBranches(branches);
    
    // If branches is provided, use it; otherwise keep existing
    if (!branches || normalizedBranches.length === 0) {
      normalizedBranches = normalizeBranches(existingService.branches);
    }

    //  Remove duplicates and clean branch IDs
    const cleanBranches = [...new Set(
      normalizedBranches
        .map(extractBranchId)
        .filter(Boolean)
    )];

    const updateData = {
      name: name.trim(),
      duration: duration.trim(),
      price: price.trim(),
      gender: gender.toLowerCase(),
      branches: cleanBranches
    };

    console.log('Updating service with:', updateData);

    const service = await Service.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    ).populate('branches', 'name city');

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    console.log(' Service updated:', service._id, '- branches:', cleanBranches.length);
    res.json(service);
  } catch (error) {
    console.error('  UPDATE service error:', error);
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
    console.error('  DELETE service error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

//  FIX DATABASE - Convert any non-array branches to arrays
router.post('/fix-branches', async (req, res) => {
  try {
    const services = await Service.find();
    let fixedCount = 0;

    for (const service of services) {
      if (!Array.isArray(service.branches)) {
        const normalizedBranches = normalizeBranches(service.branches);
        service.branches = normalizedBranches;
        await service.save();
        fixedCount++;
        console.log(`Fixed service: ${service.name} - branches:`, normalizedBranches);
      }
    }

    res.json({ 
      message: `${fixedCount} services`, 
      totalServices: services.length 
    });
  } catch (error) {
    console.error('branches error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// For branch admin - get services for their branch
router.get('/branch-admin', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const services = await Service.find({ branches: req.branchId })
      .sort({ gender: 1, name: 1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// For branch admin - add service for their branch
router.post('/branch-admin', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const { name, duration, price, gender } = req.body;

    if (!name || !duration || !price || !gender) {
      return res.status(400).json({ message: 'All fields required' });
    }

    const service = new Service({ 
      name: name.trim(), 
      duration: duration.trim(), 
      price: price.trim(),
      gender: gender.toLowerCase(),
      branches: [req.branchId]
    });

    await service.save();
    console.log('Branch admin created service:', service.name);
    res.status(201).json(service);
  } catch (error) {
    console.error('Branch admin service creation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;