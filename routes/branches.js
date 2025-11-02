
// routes/branches.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import mongoose from 'mongoose';
import Branch from '../models/Branch.js';

const router = express.Router();

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only .png, .jpg, .jpeg, .webp allowed!'));
    }
  }
});

// GET all branches
router.get('/', async (req, res) => {
  try {
    const branches = await Branch.find().sort({ createdAt: -1 });
    res.json(branches);
  } catch (error) {
    console.error('GET /branches error:', error);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

// GET single branch
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid branch ID' });
    }
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    res.json(branch);
  } catch (error) {
    console.error('GET /branches/:id error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// CREATE branch
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { name, city, address, openingHours, phone } = req.body;

    if (!name || !city || !address || !openingHours || !phone) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const image = req.file ? `/uploads/${req.file.filename}` : null;

    const branch = new Branch({
      name: name.trim(),
      city: city.trim(),
      address: address.trim(),
      openingHours: openingHours.trim(),
      phone: phone.trim(),
      image
    });

    await branch.save();
    res.status(201).json(branch);
  } catch (error) {
    console.error('POST /branches error:', error);
    res.status(500).json({ error: 'Failed to create branch', details: error.message });
  }
});

// UPDATE branch
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid branch ID' });
    }

    const { name, city, address, openingHours, phone } = req.body;
    if (!name || !city || !address || !openingHours || !phone) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const updateData = {
      name: name.trim(),
      city: city.trim(),
      address: address.trim(),
      openingHours: openingHours.trim(),
      phone: phone.trim()
    };

    // Only update image if new file uploaded
    if (req.file) {
      updateData.image = `/uploads/${req.file.filename}`;
    }

    const branch = await Branch.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    });

    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    res.json(branch);
  } catch (error) {
    console.error('PUT /branches/:id error:', error);
    res.status(500).json({ error: 'Failed to update branch', details: error.message });
  }
});

// DELETE branch
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid branch ID' });
    }

    const branch = await Branch.findByIdAndDelete(id);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    res.json({ message: 'Branch deleted successfully' });
  } catch (error) {
    console.error('DELETE /branches/:id error:', error);
    res.status(500).json({ error: 'Failed to delete branch' });
  }
});

export default router;


// backend/routes/branches.js
// import express from 'express';
// import multer from 'multer';
// import path from 'path';
// import Branch from '../models/Branch.js';

// const router = express.Router();

// // Multer setup for image upload
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'uploads/');
//   },
//   filename: (req, file, cb) => {
//     cb(null, Date.now() + path.extname(file.originalname));
//   }
// });
// const upload = multer({ storage });

// // GET all branches
// router.get('/', async (req, res) => {
//   try {
//     const branches = await Branch.find();
//     res.json(branches);
//   } catch (error) {
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // GET single branch
// router.get('/:id', async (req, res) => {
//   try {
//     const branch = await Branch.findById(req.params.id);
//     if (!branch) return res.status(404).json({ message: 'Branch not found' });
//     res.json(branch);
//   } catch (error) {
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // CREATE new branch (with image)
// router.post('/', upload.single('image'), async (req, res) => {
//   const { name, city, address, openingHours, phone } = req.body;
//   const image = req.file ? `/uploads/${req.file.filename}` : undefined;

//   try {
//     const branch = new Branch({ name, city, address, openingHours, phone, image });
//     await branch.save();
//     res.status(201).json(branch);
//   } catch (error) {
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // UPDATE branch (with optional image)
// router.put('/:id', upload.single('image'), async (req, res) => {
//   try {
//     const updateData = { ...req.body };
//     if (req.file) {
//       updateData.image = `/uploads/${req.file.filename}`;
//     }

//     const branch = await Branch.findByIdAndUpdate(req.params.id, updateData, { new: true });
//     if (!branch) return res.status(404).json({ message: 'Branch not found' });
//     res.json(branch);
//   } catch (error) {
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // DELETE branch
// router.delete('/:id', async (req, res) => {
//   try {
//     const branch = await Branch.findByIdAndDelete(req.params.id);
//     if (!branch) return res.status(404).json({ message: 'Branch not found' });
//     res.json({ message: 'Branch deleted' });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// export default router;