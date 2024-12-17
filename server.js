require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();

// --- Ühendus MongoDB-ga ---
const MONGO_URI = process.env.MONGO_URI;
const SESSION_SECRET = process.env.SESSION_SECRET || 'DEFAULT_SECRET';

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB ühendatud'))
  .catch(err => console.error('Viga MongoDB ühendamisel:', err));

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

// --- Busside skeem ---
const busSchema = new mongoose.Schema({
  busNumber: { type: String, required: true },
  seats: { type: Number, required: true },
  route: { type: String, required: true },
  departurePoint: { type: String, required: true }, // Lähtepunkt
  destinationPoint: { type: String, required: true }, // Sihtpunkt
  departureTime: { type: String, required: true } // Väljumisaeg
});

const Bus = mongoose.model('Bus', busSchema);

// --- Kasutajate skeem ---
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
});
const User = mongoose.model('User', userSchema);

// --- Autentimise kontroll ---
function authRequired(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Autentimine on vajalik' });
  }
  next();
}

// --- Administraatori õiguste kontroll ---
function adminRequired(req, res, next) {
  if (!req.session.role || req.session.role !== 'admin') {
    return res.status(403).json({ message: 'Juurdepääs keelatud. Vajalik administraatori roll.' });
  }
  next();
}

// --- Registreerimine ---
app.post('/register', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'Kasutaja on juba olemas' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, role: role || 'user' });
    await newUser.save();

    req.session.userId = newUser._id;
    req.session.role = newUser.role;

    res.status(201).json({ message: 'Kasutaja loodud', role: newUser.role, userId: newUser._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Viga registreerimisel' });
  }
});

// --- Sisselogimine ---
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Vale kasutajanimi või parool' });
    }
    req.session.userId = user._id;
    req.session.role = user.role;
    res.status(200).json({ message: 'Sisselogimine õnnestus', role: user.role, userId: user._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Viga sisselogimisel' });
  }
});

// --- Busside nimekiri ---
app.get('/api/buses', async (req, res) => {
  try {
    const buses = await Bus.find();
    res.status(200).json(buses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Viga busside hankimisel' });
  }
});

// --- Bussi kustutamine (ainult administraator) ---
app.delete('/api/buses/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const bus = await Bus.findByIdAndDelete(req.params.id);
    if (!bus) return res.status(404).json({ message: 'Bussi ei leitud' });
    res.status(200).json({ message: 'Buss kustutatud' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Viga bussi kustutamisel' });
  }
});

// --- Bussi muutmine (ainult administraator) ---
app.put('/api/buses/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const { busNumber, seats, route, departurePoint, destinationPoint, departureTime } = req.body;
    const bus = await Bus.findByIdAndUpdate(
      req.params.id,
      { busNumber, seats, route, departurePoint, destinationPoint, departureTime },
      { new: true, runValidators: true }
    );

    if (!bus) return res.status(404).json({ message: 'Buss ei leitud' });
    res.status(200).json({ message: 'Buss on uuendatud', bus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Serveri viga bussi muutmisel' });
  }
});


// --- Bussi lisamine (ainult administraator) ---
app.post('/api/buses', authRequired, adminRequired, async (req, res) => {
  try {
    const { busNumber, seats, route, departurePoint, destinationPoint, departureTime } = req.body;

    if (!busNumber || !seats || !route || !departurePoint || !destinationPoint || !departureTime) {
      return res.status(400).json({ message: 'Palun täitke kõik väljad' });
    }

    const newBus = new Bus({ busNumber, seats, route, departurePoint, destinationPoint, departureTime });
    await newBus.save();

    res.status(201).json({ message: 'Buss on edukalt lisatud', bus: newBus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Serveri viga bussi lisamisel' });
  }
});


// --- Serveri käivitamine ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server töötab aadressil http://localhost:${PORT}`);
});
