import express from 'express';
import Booking from '../models/Booking.js';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';

const router = express.Router();

// GET movie analytics for a given period
router.get('/movie/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    const { startDate, endDate } = req.query;
    
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        date: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    }
    
    // Get all bookings for the movie
    const bookings = await Booking.find({
      movie: movieId,
      status: 'confirmed',
      ...dateFilter
    }).populate('movie', 'title');
    
    // Calculate analytics
    const totalBookings = bookings.length;
    const totalTickets = bookings.reduce((sum, booking) => sum + booking.seats.length, 0);
    const totalGMV = bookings.reduce((sum, booking) => sum + booking.totalAmount, 0);
    const averageTicketPrice = totalTickets > 0 ? totalGMV / totalTickets : 0;
    
    // Daily breakdown
    const dailyStats = {};
    bookings.forEach(booking => {
      const date = booking.date.toISOString().split('T')[0];
      if (!dailyStats[date]) {
        dailyStats[date] = {
          bookings: 0,
          tickets: 0,
          revenue: 0
        };
      }
      dailyStats[date].bookings += 1;
      dailyStats[date].tickets += booking.seats.length;
      dailyStats[date].revenue += booking.totalAmount;
    });
    
    res.json({
      movie: bookings[0]?.movie || { title: 'Unknown' },
      period: { startDate, endDate },
      summary: {
        totalBookings,
        totalTickets,
        totalGMV,
        averageTicketPrice
      },
      dailyBreakdown: dailyStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET overall analytics
router.get('/overview', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        date: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    }
    
    // Get all confirmed bookings
    const bookings = await Booking.find({
      status: 'confirmed',
      ...dateFilter
    }).populate('movie', 'title');
    
    // Calculate overall stats
    const totalBookings = bookings.length;
    const totalTickets = bookings.reduce((sum, booking) => sum + booking.seats.length, 0);
    const totalGMV = bookings.reduce((sum, booking) => sum + booking.totalAmount, 0);
    
    // Movie-wise breakdown
    const movieStats = {};
    bookings.forEach(booking => {
      const movieTitle = booking.movie.title;
      if (!movieStats[movieTitle]) {
        movieStats[movieTitle] = {
          bookings: 0,
          tickets: 0,
          revenue: 0
        };
      }
      movieStats[movieTitle].bookings += 1;
      movieStats[movieTitle].tickets += booking.seats.length;
      movieStats[movieTitle].revenue += booking.totalAmount;
    });
    
    // Theater-wise breakdown
    const theaterStats = {};
    const theaterBookings = await Booking.find({
      status: 'confirmed',
      ...dateFilter
    }).populate('theater', 'name');
    
    theaterBookings.forEach(booking => {
      const theaterName = booking.theater.name;
      if (!theaterStats[theaterName]) {
        theaterStats[theaterName] = {
          bookings: 0,
          tickets: 0,
          revenue: 0
        };
      }
      theaterStats[theaterName].bookings += 1;
      theaterStats[theaterName].tickets += booking.seats.length;
      theaterStats[theaterName].revenue += booking.totalAmount;
    });
    
    res.json({
      period: { startDate, endDate },
      summary: {
        totalBookings,
        totalTickets,
        totalGMV,
        averageTicketPrice: totalTickets > 0 ? totalGMV / totalTickets : 0
      },
      movieBreakdown: movieStats,
      theaterBreakdown: theaterStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET top performing movies
router.get('/top-movies', async (req, res) => {
  try {
    const { limit = 10, startDate, endDate } = req.query;
    
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        date: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    }
    
    const bookings = await Booking.find({
      status: 'confirmed',
      ...dateFilter
    }).populate('movie', 'title genre');
    
    const movieStats = {};
    bookings.forEach(booking => {
      const movieTitle = booking.movie.title;
      if (!movieStats[movieTitle]) {
        movieStats[movieTitle] = {
          title: movieTitle,
          genre: booking.movie.genre,
          bookings: 0,
          tickets: 0,
          revenue: 0
        };
      }
      movieStats[movieTitle].bookings += 1;
      movieStats[movieTitle].tickets += booking.seats.length;
      movieStats[movieTitle].revenue += booking.totalAmount;
    });
    
    const topMovies = Object.values(movieStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, parseInt(limit));
    
    res.json(topMovies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET booking trends
router.get('/trends', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const bookings = await Booking.find({
      status: 'confirmed',
      date: {
        $gte: startDate,
        $lte: endDate
      }
    });
    
    // Daily trends
    const dailyTrends = {};
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      dailyTrends[dateKey] = {
        date: dateKey,
        bookings: 0,
        tickets: 0,
        revenue: 0
      };
    }
    
    bookings.forEach(booking => {
      const dateKey = booking.date.toISOString().split('T')[0];
      if (dailyTrends[dateKey]) {
        dailyTrends[dateKey].bookings += 1;
        dailyTrends[dateKey].tickets += booking.seats.length;
        dailyTrends[dateKey].revenue += booking.totalAmount;
      }
    });
    
    res.json({
      period: { startDate, endDate },
      dailyTrends: Object.values(dailyTrends)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET seat occupancy analytics
router.get('/occupancy', async (req, res) => {
  try {
    const { theaterId, hallName, date } = req.query;
    
    if (!theaterId || !hallName || !date) {
      return res.status(400).json({ error: 'theaterId, hallName, and date are required' });
    }
    
    // Get all shows for the specified theater, hall, and date
    const shows = await Show.find({
      theater: theaterId,
      hall: hallName,
      date: new Date(date),
      isActive: true
    });
    
    const occupancyStats = [];
    
    for (const show of shows) {
      const bookings = await Booking.find({
        show: show._id,
        date: show.date,
        status: { $in: ['pending', 'confirmed'] }
      });
      
      const totalBookedSeats = bookings.reduce((sum, booking) => sum + booking.seats.length, 0);
      const occupancyRate = show.totalCapacity > 0 ? (totalBookedSeats / show.totalCapacity) * 100 : 0;
      
      occupancyStats.push({
        show: show,
        totalCapacity: show.totalCapacity,
        bookedSeats: totalBookedSeats,
        availableSeats: show.totalCapacity - totalBookedSeats,
        occupancyRate: Math.round(occupancyRate * 100) / 100
      });
    }
    
    res.json(occupancyStats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
