// backend/routes/branches.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import Branch from '../models/Branch.js';

const router = express.Router();

// Multer setup for image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

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

// CREATE new branch (with image)
router.post('/', upload.single('image'), async (req, res) => {
  const { name, city, address, openingHours, phone } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : undefined;

  try {
    const branch = new Branch({ name, city, address, openingHours, phone, image });
    await branch.save();
    res.status(201).json(branch);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// UPDATE branch (with optional image)
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (req.file) {
      updateData.image = `/uploads/${req.file.filename}`;
    }

    const branch = await Branch.findByIdAndUpdate(req.params.id, updateData, { new: true });
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