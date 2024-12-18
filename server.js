require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');

const app = express();

// --- MongoDB Connection ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/busdb';
const SESSION_SECRET = process.env.SESSION_SECRET || 'DEFAULT_SECRET';

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- Middleware ---
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 1000 * 60 * 60 },
}));

// --- Swagger Configuration ---
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Bus Management API',
      version: '1.0.0',
      description: 'API for managing buses and users',
    },
    servers: [{ url: 'http://localhost:5000' }],
  },
  apis: ['./server.js'],
};
const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// --- Schemas ---
const busSchema = new mongoose.Schema({
  busNumber: { type: String, required: true },
  seats: { type: Number, required: true },
  route: { type: String, required: true },
  departurePoint: { type: String, required: true },
  destinationPoint: { type: String, required: true },
  departureTime: { type: String, required: true },
});
const Bus = mongoose.model('Bus', busSchema);

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
});
const User = mongoose.model('User', userSchema);

// --- Middleware Functions ---
function authRequired(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  next();
}

function adminRequired(req, res, next) {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

// --- API Routes ---
/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: User already exists
 */
app.post('/register', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, role });
    await newUser.save();

    req.session.userId = newUser._id;
    req.session.role = newUser.role;

    res.status(201).json({ message: 'User registered successfully', role: newUser.role, userId: newUser._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error registering user' });
  }
});

/**
 * @swagger
 * /login:
 *   post:
 *     summary: Log in a user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }
    req.session.userId = user._id;
    req.session.role = user.role;
    res.status(200).json({ message: 'Login successful', role: user.role, userId: user._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error logging in' });
  }
});

/**
 * @swagger
 * /api/buses:
 *   get:
 *     summary: Get all buses
 *     responses:
 *       200:
 *         description: List of buses
 */
app.get('/api/buses', async (req, res) => {
  try {
    const buses = await Bus.find();
    res.status(200).json(buses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching buses' });
  }
});

/**
 * @swagger
 * /api/buses:
 *   post:
 *     summary: Add a new bus
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               busNumber:
 *                 type: string
 *               seats:
 *                 type: number
 *               route:
 *                 type: string
 *               departurePoint:
 *                 type: string
 *               destinationPoint:
 *                 type: string
 *               departureTime:
 *                 type: string
 *     responses:
 *       201:
 *         description: Bus added successfully
 *       400:
 *         description: Invalid input
 */
app.post('/api/buses', authRequired, adminRequired, async (req, res) => {
  try {
    const { busNumber, seats, route, departurePoint, destinationPoint, departureTime } = req.body;
    const newBus = new Bus({ busNumber, seats, route, departurePoint, destinationPoint, departureTime });
    await newBus.save();
    res.status(201).json({ message: 'Bus added successfully', bus: newBus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error adding bus' });
  }
});

/**
 * @swagger
 * /api/buses/{id}:
 *   put:
 *     summary: Update a bus
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               busNumber:
 *                 type: string
 *               seats:
 *                 type: number
 *               route:
 *                 type: string
 *               departurePoint:
 *                 type: string
 *               destinationPoint:
 *                 type: string
 *               departureTime:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bus updated successfully
 *       404:
 *         description: Bus not found
 */
app.put('/api/buses/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const { busNumber, seats, route, departurePoint, destinationPoint, departureTime } = req.body;
    const bus = await Bus.findByIdAndUpdate(req.params.id, { busNumber, seats, route, departurePoint, destinationPoint, departureTime }, { new: true });
    if (!bus) return res.status(404).json({ message: 'Bus not found' });
    res.status(200).json({ message: 'Bus updated successfully', bus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating bus' });
  }
});

/**
 * @swagger
 * /api/buses/{id}:
 *   delete:
 *     summary: Delete a bus
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the bus to delete
 *     responses:
 *       200:
 *         description: Bus deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Bus deleted successfully
 *       404:
 *         description: Bus not found
 *       500:
 *         description: Server error
 */

app.delete('/api/buses/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const bus = await Bus.findByIdAndDelete(req.params.id);
    if (!bus) {
      return res.status(404).json({ message: 'Bus not found' });
    }
    res.status(200).json({ message: 'Bus deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error deleting bus' });
  }
});

/**
 * @swagger
 * /logout:
 *   post:
 *     summary: Log out the current user
 *     responses:
 *       200:
 *         description: Logout successful
 */
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error logging out' });
    }
    res.status(200).json({ message: 'Logout successful' });
  });
});

// --- Server Initialization ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

