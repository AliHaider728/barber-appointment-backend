import express from 'express';
import Service from '../models/Service.js';
import { authenticateAdmin, authenticateBranchAdmin, checkPermission } from './auth.js';

const router = express.Router();

 
// HELPER FUNCTIONS
 

const normalizeBranches = (branches) => {
  if (!branches) return [];
  if (Array.isArray(branches)) return branches;
  return [branches];
};

const extractBranchId = (branch) => {
  if (typeof branch === 'string') return branch;
  if (branch?._id) return branch._id.toString();
  return null;
};

 
// MAIN ADMIN ROUTES
 

// GET all services (Main Admin)
router.get('/', async (req, res) => {
  try {
    const services = await Service.find()
      .populate('branches', 'name city address')
      .populate('createdBy', 'fullName email')
      .sort({ gender: 1, name: 1 });
    
    console.log(`✅ GET /api/services → ${services.length} services found`);
    res.json(services);
  } catch (error) {
    console.error('❌ GET services error:', error);
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
    
    const services = await Service.find({ gender: gender.toLowerCase() })
      .populate('branches', 'name city')
      .sort({ name: 1 });
    
    console.log(`✅ GET /api/services/gender/${gender} → ${services.length} services`);
    res.json(services);
  } catch (error) {
    console.error('❌ GET by gender error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET services by branch
router.get('/branch/:branchId', async (req, res) => {
  try {
    const { branchId } = req.params;
    
    const services = await Service.find({
      $or: [
        { isGlobal: true },
        { branches: branchId }
      ]
    })
      .populate('branches', 'name city')
      .sort({ gender: 1, name: 1 });
    
    console.log(`✅ GET /api/services/branch/${branchId} → ${services.length} services`);
    res.json(services);
  } catch (error) {
    console.error('❌ GET by branch error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// CREATE service (Main Admin)
router.post('/', async (req, res) => {
  try {
    const { name, duration, price, gender, branches, isGlobal } = req.body;

    console.log('📝 POST /api/services - Received:', req.body);

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

    // ✅ FIXED: No duplicate check - allow same service for different branches
    const normalizedBranches = normalizeBranches(branches);

    const service = new Service({ 
      name: name.trim(), 
      duration: duration.trim(), 
      price: price.trim(),
      gender: gender.toLowerCase(),
      branches: normalizedBranches,
      isGlobal: isGlobal || false,
      createdBy: req.admin?._id || null
    });

    await service.save();

    const populated = await Service.findById(service._id)
      .populate('branches', 'name city address')
      .populate('createdBy', 'fullName email');
    
    console.log(`✅ Service created: ${service.name} (${normalizedBranches.length} branches)`);
    res.status(201).json(populated);
  } catch (error) {
    console.error('❌ CREATE service error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// UPDATE service (Main Admin)
router.put('/:id', async (req, res) => {
  try {
    const { name, duration, price, gender, branches, isGlobal } = req.body;

    console.log('📝 PUT /api/services/:id - Received:', { id: req.params.id, body: req.body });

    const existingService = await Service.findById(req.params.id);
    if (!existingService) {
      return res.status(404).json({ message: 'Service not found' });
    }

    if (!name || !duration || !price || !gender) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!['male', 'female'].includes(gender.toLowerCase())) {
      return res.status(400).json({ message: 'Gender must be either "male" or "female"' });
    }

    let normalizedBranches = normalizeBranches(branches);
    
    if (!branches || normalizedBranches.length === 0) {
      normalizedBranches = normalizeBranches(existingService.branches);
    }

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
      branches: cleanBranches,
      isGlobal: isGlobal !== undefined ? isGlobal : existingService.isGlobal
    };

    const service = await Service.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    )
      .populate('branches', 'name city address')
      .populate('createdBy', 'fullName email');

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    console.log(`✅ Service updated: ${service.name} (${cleanBranches.length} branches)`);
    res.json(service);
  } catch (error) {
    console.error('❌ UPDATE service error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// DELETE service (Main Admin)
router.delete('/:id', async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    console.log(`✅ Service deleted: ${service.name}`);
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('❌ DELETE service error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

 
// BRANCH ADMIN ROUTES
 

// GET services for branch admin's branch
router.get('/branch-admin', authenticateBranchAdmin, async (req, res) => {
  try {
    const branchId = req.admin.assignedBranch._id;

    const services = await Service.find({
      $or: [
        { isGlobal: true },
        { branches: branchId }
      ]
    })
      .populate('branches', 'name city address')
      .sort({ gender: 1, name: 1 });

    console.log(`✅ Branch Admin GET services → ${services.length} services for branch ${branchId}`);
    res.json(services);
  } catch (error) {
    console.error('❌ Branch Admin GET error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// CREATE service (Branch Admin) - Auto-assign to their branch
router.post('/branch-admin', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const { name, duration, price, gender } = req.body;
    const branchId = req.admin.assignedBranch._id;

    if (!name || !duration || !price || !gender) {
      return res.status(400).json({ message: 'All fields required' });
    }

    if (!['male', 'female'].includes(gender.toLowerCase())) {
      return res.status(400).json({ message: 'Gender must be "male" or "female"' });
    }

    const service = new Service({ 
      name: name.trim(), 
      duration: duration.trim(), 
      price: price.trim(),
      gender: gender.toLowerCase(),
      branches: [branchId],
      isGlobal: false,
      createdBy: req.admin._id
    });

    await service.save();

    const populated = await Service.findById(service._id)
      .populate('branches', 'name city address');

    console.log(`✅ Branch Admin created service: ${service.name} for branch ${branchId}`);
    res.status(201).json(populated);
  } catch (error) {
    console.error('❌ Branch Admin CREATE error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ NEW: UPDATE service (Branch Admin)
router.put('/branch-admin/:id', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const { name, duration, price, gender } = req.body;
    const branchId = req.admin.assignedBranch._id;

    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // ✅ Check if branch admin can edit this service
    const canEdit = service.isGlobal || service.branches.some(b => b.toString() === branchId.toString());
    
    if (!canEdit) {
      return res.status(403).json({ message: 'You can only edit services for your branch' });
    }

    if (!name || !duration || !price || !gender) {
      return res.status(400).json({ message: 'All fields required' });
    }

    const updates = {
      name: name.trim(),
      duration: duration.trim(),
      price: price.trim(),
      gender: gender.toLowerCase()
    };

    const updated = await Service.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).populate('branches', 'name city address');

    console.log(`✅ Branch Admin updated service: ${updated.name}`);
    res.json(updated);
  } catch (error) {
    console.error('❌ Branch Admin UPDATE error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ NEW: DELETE service (Branch Admin)
router.delete('/branch-admin/:id', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const branchId = req.admin.assignedBranch._id;
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // ✅ Can only delete if service is specific to their branch (not global)
    const canDelete = !service.isGlobal && service.branches.some(b => b.toString() === branchId.toString());

    if (!canDelete) {
      return res.status(403).json({ 
        message: 'You cannot delete global services or services from other branches' 
      });
    }

    await Service.findByIdAndDelete(req.params.id);
    console.log(`✅ Branch Admin deleted service: ${service.name}`);
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('❌ Branch Admin DELETE error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

 
// UTILITY ROUTES
 

// FIX DATABASE - Convert non-array branches to arrays
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
        console.log(`✅ Fixed service: ${service.name} - branches:`, normalizedBranches);
      }
    }

    res.json({ 
      message: `Fixed ${fixedCount} services`, 
      totalServices: services.length 
    });
  } catch (error) {
    console.error('❌ Fix branches error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;