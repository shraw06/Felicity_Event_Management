require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const { registerSocketHandlers } = require('./utils/socketHandler');

// Connect to database
connectDB();

const app = express();
const Participant = require('./models/Participant');
const Organizer = require('./models/Organizer');
const Admin = require('./models/Admin');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve uploaded payment-proof images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/participants', require('./routes/participantRoutes'));
app.use('/api/organizers', require('./routes/organizerRoutes'));
app.use('/api/admins', require('./routes/adminRoutes'));
app.use('/api/events', require('./routes/eventRoutes'));
app.use('/api/forum', require('./routes/forumRoutes'));

// Basic route for testing
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to MERN API' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: err.message || 'Server Error',
  });
});

const PORT = process.env.PORT || 5000;

// Create HTTP server and attach Socket.IO
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
});

registerSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

