import express from 'express';
import Theater from '../models/Theater.js';

const router = express.Router();

// GET all theaters
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, city, isActive = true } = req.query;
    
    let query = { isActive: isActive === 'true' };
    
    if (city) {
      query['address.city'] = { $regex: city, $options: 'i' };
    }
    
    const theaters = await Theater.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });
    
    const total = await Theater.countDocuments(query);
    
    res.json({
      theaters,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET theater by ID
router.get('/:id', async (req, res) => {
  try {
    const theater = await Theater.findById(req.params.id);
    if (!theater) {
      return res.status(404).json({ error: 'Theater not found' });
    }
    res.json(theater);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create new theater
router.post('/', async (req, res) => {
  try {
    const theater = new Theater(req.body);
    const savedTheater = await theater.save();
    res.status(201).json(savedTheater);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update theater
router.put('/:id', async (req, res) => {
  try {
    const theater = await Theater.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!theater) {
      return res.status(404).json({ error: 'Theater not found' });
    }
    res.json(theater);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE theater (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const theater = await Theater.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!theater) {
      return res.status(404).json({ error: 'Theater not found' });
    }
    res.json({ message: 'Theater deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST add hall to theater
router.post('/:id/halls', async (req, res) => {
  try {
    const theater = await Theater.findById(req.params.id);
    if (!theater) {
      return res.status(404).json({ error: 'Theater not found' });
    }
    
    theater.halls.push(req.body);
    const savedTheater = await theater.save();
    res.status(201).json(savedTheater);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update hall in theater
router.put('/:id/halls/:hallId', async (req, res) => {
  try {
    const theater = await Theater.findById(req.params.id);
    if (!theater) {
      return res.status(404).json({ error: 'Theater not found' });
    }
    
    const hallIndex = theater.halls.findIndex(hall => hall._id.toString() === req.params.hallId);
    if (hallIndex === -1) {
      return res.status(404).json({ error: 'Hall not found' });
    }
    
    theater.halls[hallIndex] = { ...theater.halls[hallIndex].toObject(), ...req.body };
    const savedTheater = await theater.save();
    res.json(savedTheater);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE hall from theater
router.delete('/:id/halls/:hallId', async (req, res) => {
  try {
    const theater = await Theater.findById(req.params.id);
    if (!theater) {
      return res.status(404).json({ error: 'Theater not found' });
    }
    
    theater.halls = theater.halls.filter(hall => hall._id.toString() !== req.params.hallId);
    const savedTheater = await theater.save();
    res.json({ message: 'Hall deleted successfully', theater: savedTheater });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET theaters by city
router.get('/city/:city', async (req, res) => {
  try {
    const theaters = await Theater.find({
      'address.city': { $regex: req.params.city, $options: 'i' },
      isActive: true
    });
    res.json(theaters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET hall layout for a specific theater and hall
router.get('/:id/halls/:hallId/layout', async (req, res) => {
  try {
    const theater = await Theater.findById(req.params.id);
    if (!theater) {
      return res.status(404).json({ error: 'Theater not found' });
    }
    
    const hall = theater.halls.find(h => h._id.toString() === req.params.hallId);
    if (!hall) {
      return res.status(404).json({ error: 'Hall not found' });
    }
    
    res.json({
      theaterName: theater.name,
      hallName: hall.name,
      hallNumber: hall.hallNumber,
      totalCapacity: hall.totalCapacity,
      rows: hall.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
