import express from 'express';
import Branch from '../models/Branch.js';

const router = express.Router();

// GET all branches
router.get('/', async (req, res) => {
  try {
    const branches = await Branch.find();
    res.json(branches);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single branch
router.get('/:id', async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    res.json(branch);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// CREATE new branch
router.post('/', async (req, res) => {
  const { name, city, address, openingHours, phone } = req.body;
  try {
    const branch = new Branch({ name, city, address, openingHours, phone });
    await branch.save();
    res.status(201).json(branch);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// UPDATE branch
router.put('/:id', async (req, res) => {
  try {
    const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    res.json(branch);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE branch
router.delete('/:id', async (req, res) => {
  try {
    const branch = await Branch.findByIdAndDelete(req.params.id);
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    res.json({ message: 'Branch deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;