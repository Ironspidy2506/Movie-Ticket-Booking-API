import express from 'express';
import Booking from '../models/Booking.js';
import Show from '../models/Show.js';
import Movie from '../models/Movie.js';
import Theater from '../models/Theater.js';

const router = express.Router();

// GET all bookings
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, status, customerEmail } = req.query;
    
    let query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (customerEmail) {
      query.customerEmail = customerEmail;
    }
    
    const bookings = await Booking.find(query)
      .populate('movie', 'title')
      .populate('theater', 'name')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });
    
    const total = await Booking.countDocuments(query);
    
    res.json({
      bookings,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET booking by ID
router.get('/:id', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('movie', 'title duration genre')
      .populate('theater', 'name address');
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create new booking with concurrency control
router.post('/', async (req, res) => {
  const session = await Booking.startSession();
  session.startTransaction();
  
  try {
    const { showId, seats, customerName, customerEmail, customerPhone } = req.body;
    
    // Validate show exists
    const show = await Show.findById(showId).populate('movie theater');
    if (!show || !show.isActive) {
      throw new Error('Show not found or inactive');
    }
    
    // Check if seats are available (concurrency control)
    const existingBookings = await Booking.find({
      show: showId,
      date: show.date,
      status: { $in: ['pending', 'confirmed'] }
    });
    
    const bookedSeats = existingBookings.flatMap(booking => 
      booking.seats.map(seat => `${seat.row}-${seat.column}`)
    );
    
    const requestedSeats = seats.map(seat => `${seat.row}-${seat.column}`);
    
    // Check for conflicts
    const conflictingSeats = requestedSeats.filter(seat => bookedSeats.includes(seat));
    if (conflictingSeats.length > 0) {
      throw new Error(`Seats already booked: ${conflictingSeats.join(', ')}`);
    }
    
    // Calculate total amount
    const totalAmount = seats.reduce((sum, seat) => sum + seat.price, 0);
    
    // Create booking
    const booking = new Booking({
      show: showId,
      movie: show.movie._id,
      theater: show.theater._id,
      hall: show.hall,
      date: show.date,
      startTime: show.startTime,
      seats: seats,
      totalAmount: totalAmount,
      customerName,
      customerEmail,
      customerPhone,
      bookingExpiry: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes expiry
    });
    
    const savedBooking = await booking.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(201).json(savedBooking);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ error: error.message });
  }
});

// POST group booking with alternative suggestions
router.post('/group', async (req, res) => {
  try {
    const { movieId, theaterId, date, numSeats, customerName, customerEmail, customerPhone } = req.body;
    
    // Find available shows for the movie and theater
    const shows = await Show.find({
      movie: movieId,
      theater: theaterId,
      date: new Date(date),
      isActive: true
    }).populate('movie theater');
    
    if (shows.length === 0) {
      return res.status(404).json({ error: 'No shows found for the specified criteria' });
    }
    
    const bookingResults = [];
    
    for (const show of shows) {
      // Get theater hall layout
      const theater = await Theater.findById(theaterId);
      const hall = theater.halls.find(h => h.name === show.hall);
      
      if (!hall) continue;
      
      // Get existing bookings for this show
      const existingBookings = await Booking.find({
        show: show._id,
        date: show.date,
        status: { $in: ['pending', 'confirmed'] }
      });
      
      const bookedSeats = existingBookings.flatMap(booking => 
        booking.seats.map(seat => `${seat.row}-${seat.column}`)
      );
      
      // Find consecutive seats
      const availableSeats = findConsecutiveSeats(hall, bookedSeats, numSeats);
      
      if (availableSeats.length > 0) {
        bookingResults.push({
          show: show,
          availableSeats: availableSeats,
          totalAmount: availableSeats.reduce((sum, seat) => sum + show.price, 0)
        });
      }
    }
    
    if (bookingResults.length === 0) {
      // Suggest alternative movies and times
      const alternatives = await suggestAlternatives(movieId, theaterId, date, numSeats);
      return res.status(200).json({
        message: 'No consecutive seats available for the requested criteria',
        alternatives: alternatives
      });
    }
    
    res.json({
      message: 'Available booking options found',
      options: bookingResults
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to find consecutive seats
function findConsecutiveSeats(hall, bookedSeats, numSeats) {
  const availableSeats = [];
  
  for (const row of hall.rows) {
    const rowSeats = [];
    
    for (let col = 1; col <= row.totalSeats; col++) {
      const seatKey = `${row.rowNumber}-${col}`;
      if (!bookedSeats.includes(seatKey)) {
        rowSeats.push({
          row: row.rowNumber,
          column: col,
          seatNumber: `${row.rowNumber}${col}`,
          price: 0 // Will be set by the booking logic
        });
      }
    }
    
    // Find consecutive seats in this row
    for (let i = 0; i <= rowSeats.length - numSeats; i++) {
      const consecutive = rowSeats.slice(i, i + numSeats);
      if (consecutive.length === numSeats) {
        availableSeats.push(consecutive);
      }
    }
  }
  
  return availableSeats.length > 0 ? availableSeats[0] : [];
}

// Helper function to suggest alternatives
async function suggestAlternatives(movieId, theaterId, date, numSeats) {
  const alternatives = [];
  
  // Find other movies in the same theater
  const otherShows = await Show.find({
    theater: theaterId,
    date: new Date(date),
    isActive: true
  }).populate('movie');
  
  for (const show of otherShows) {
    if (show.movie._id.toString() !== movieId) {
      const theater = await Theater.findById(theaterId);
      const hall = theater.halls.find(h => h.name === show.hall);
      
      if (hall) {
        const existingBookings = await Booking.find({
          show: show._id,
          date: show.date,
          status: { $in: ['pending', 'confirmed'] }
        });
        
        const bookedSeats = existingBookings.flatMap(booking => 
          booking.seats.map(seat => `${seat.row}-${seat.column}`)
        );
        
        const availableSeats = findConsecutiveSeats(hall, bookedSeats, numSeats);
        
        if (availableSeats.length > 0) {
          alternatives.push({
            movie: show.movie,
            show: show,
            availableSeats: availableSeats.length
          });
        }
      }
    }
  }
  
  return alternatives;
}

// PUT update booking status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    res.json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE cancel booking
router.delete('/:id', async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled' },
      { new: true }
    );
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET available seats for a show
router.get('/show/:showId/seats', async (req, res) => {
  try {
    const show = await Show.findById(req.params.showId).populate('theater');
    if (!show) {
      return res.status(404).json({ error: 'Show not found' });
    }
    
    const theater = await Theater.findById(show.theater._id);
    const hall = theater.halls.find(h => h.name === show.hall);
    
    if (!hall) {
      return res.status(404).json({ error: 'Hall not found' });
    }
    
    // Get booked seats
    const existingBookings = await Booking.find({
      show: req.params.showId,
      date: show.date,
      status: { $in: ['pending', 'confirmed'] }
    });
    
    const bookedSeats = existingBookings.flatMap(booking => 
      booking.seats.map(seat => `${seat.row}-${seat.column}`)
    );
    
    // Generate seat layout
    const seatLayout = hall.rows.map(row => ({
      rowNumber: row.rowNumber,
      seats: Array.from({ length: row.totalSeats }, (_, i) => {
        const seatNumber = i + 1;
        const seatKey = `${row.rowNumber}-${seatNumber}`;
        return {
          row: row.rowNumber,
          column: seatNumber,
          seatNumber: `${row.rowNumber}${seatNumber}`,
          isAisle: row.aisleSeats.includes(seatNumber),
          isBooked: bookedSeats.includes(seatKey),
          price: show.price
        };
      })
    }));
    
    res.json({
      show: show,
      hall: hall,
      seatLayout: seatLayout,
      totalCapacity: hall.totalCapacity,
      bookedSeats: bookedSeats.length,
      availableSeats: hall.totalCapacity - bookedSeats.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
