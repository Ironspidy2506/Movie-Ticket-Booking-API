import express from 'express';
import Show from '../models/Show.js';
import Movie from '../models/Movie.js';
import Theater from '../models/Theater.js';

const router = express.Router();

// GET all shows
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, movieId, theaterId, date, isActive = true } = req.query;
    
    let query = { isActive: isActive === 'true' };
    
    if (movieId) {
      query.movie = movieId;
    }
    
    if (theaterId) {
      query.theater = theaterId;
    }
    
    if (date) {
      query.date = new Date(date);
    }
    
    const shows = await Show.find(query)
      .populate('movie', 'title duration genre')
      .populate('theater', 'name address')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ date: 1, startTime: 1 });
    
    const total = await Show.countDocuments(query);
    
    res.json({
      shows,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET show by ID
router.get('/:id', async (req, res) => {
  try {
    const show = await Show.findById(req.params.id)
      .populate('movie', 'title duration genre language')
      .populate('theater', 'name address contactNumber');
    
    if (!show) {
      return res.status(404).json({ error: 'Show not found' });
    }
    res.json(show);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create new show
router.post('/', async (req, res) => {
  try {
    const { movieId, theaterId, hall, date, startTime, endTime, price } = req.body;
    
    // Validate movie exists
    const movie = await Movie.findById(movieId);
    if (!movie || !movie.isActive) {
      return res.status(400).json({ error: 'Movie not found or inactive' });
    }
    
    // Validate theater exists
    const theater = await Theater.findById(theaterId);
    if (!theater || !theater.isActive) {
      return res.status(400).json({ error: 'Theater not found or inactive' });
    }
    
    // Validate hall exists in theater
    const hallExists = theater.halls.find(h => h.name === hall);
    if (!hallExists) {
      return res.status(400).json({ error: 'Hall not found in theater' });
    }
    
    // Check for time conflicts
    const conflictingShows = await Show.find({
      theater: theaterId,
      hall: hall,
      date: new Date(date),
      isActive: true,
      $or: [
        {
          startTime: { $lt: endTime },
          endTime: { $gt: startTime }
        }
      ]
    });
    
    if (conflictingShows.length > 0) {
      return res.status(400).json({ error: 'Time slot conflicts with existing shows' });
    }
    
    const show = new Show({
      movie: movieId,
      theater: theaterId,
      hall,
      date: new Date(date),
      startTime,
      endTime,
      price
    });
    
    const savedShow = await show.save();
    const populatedShow = await Show.findById(savedShow._id)
      .populate('movie', 'title duration genre')
      .populate('theater', 'name address');
    
    res.status(201).json(populatedShow);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update show
router.put('/:id', async (req, res) => {
  try {
    const show = await Show.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('movie', 'title duration genre')
     .populate('theater', 'name address');
    
    if (!show) {
      return res.status(404).json({ error: 'Show not found' });
    }
    res.json(show);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE show (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const show = await Show.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!show) {
      return res.status(404).json({ error: 'Show not found' });
    }
    res.json({ message: 'Show deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET shows by movie
router.get('/movie/:movieId', async (req, res) => {
  try {
    const { date } = req.query;
    let query = { movie: req.params.movieId, isActive: true };
    
    if (date) {
      query.date = new Date(date);
    }
    
    const shows = await Show.find(query)
      .populate('movie', 'title duration genre')
      .populate('theater', 'name address')
      .sort({ date: 1, startTime: 1 });
    
    res.json(shows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET shows by theater
router.get('/theater/:theaterId', async (req, res) => {
  try {
    const { date } = req.query;
    let query = { theater: req.params.theaterId, isActive: true };
    
    if (date) {
      query.date = new Date(date);
    }
    
    const shows = await Show.find(query)
      .populate('movie', 'title duration genre')
      .populate('theater', 'name address')
      .sort({ date: 1, startTime: 1 });
    
    res.json(shows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET available shows for booking
router.get('/available/:movieId', async (req, res) => {
  try {
    const { theaterId, date } = req.query;
    let query = { 
      movie: req.params.movieId, 
      isActive: true,
      date: { $gte: new Date() } // Only future shows
    };
    
    if (theaterId) {
      query.theater = theaterId;
    }
    
    if (date) {
      query.date = new Date(date);
    }
    
    const shows = await Show.find(query)
      .populate('movie', 'title duration genre')
      .populate('theater', 'name address')
      .sort({ date: 1, startTime: 1 });
    
    res.json(shows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
