const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'pharmasoft-secret-key-change-in-production';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pharmasoft';

// ===========================
// MIDDLEWARE
// ===========================
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/routes', express.static(path.join(__dirname, 'routes')));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ===========================
// DATABASE CONNECTION
// ===========================
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    console.log(`📊 Database: ${MONGODB_URI.split('/').pop()}`);
  })
  .catch(err => {
    console.error('❌ MongoDB Error:', err);
    process.exit(1);
  });

mongoose.connection.on('error', err => {
  console.error('MongoDB error:', err);
});

// ===========================
// SCHEMAS
// ===========================
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  cart: [{
    name: String,
    price: Number,
    quantity: { type: Number, default: 1 },
    image: String
  }],
  orders: [{
    orderId: String,
    items: Array,
    total: Number,
    deliveryAddress: Object,
    paymentMethod: String,
    paymentId: String,
    paymentStatus: String,
    status: { type: String, default: 'confirmed' },
    createdAt: { type: Date, default: Date.now }
  }],
  addresses: [{
    name: String,
    phone: String,
    address: String,
    city: String,
    state: String,
    pincode: String,
    isDefault: { type: Boolean, default: false }
  }]
}, { timestamps: true });

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  oldPrice: { type: Number, min: 0 },
  discount: String,
  img: String,
  category: {
    type: String,
    required: true,
    enum: ['ayurvedic', 'generic', 'general', 'prescription']
  },
  description: String,
  inStock: { type: Boolean, default: true },
  rating: { type: Number, min: 0, max: 5, default: 0 },
  keywords: [String],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);

// ===========================
// AUTH MIDDLEWARE
// ===========================
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// ===========================
// HELPER FUNCTIONS
// ===========================
const calculateCartTotal = (cartItems) => {
  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const deliveryFee = subtotal > 500 ? 0 : 50;
  const tax = subtotal * 0.05;
  const total = subtotal + deliveryFee + tax;

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    deliveryFee: parseFloat(deliveryFee.toFixed(2)),
    tax: parseFloat(tax.toFixed(2)),
    total: parseFloat(total.toFixed(2))
  };
};

const generateOrderId = () => {
  return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
};

// ===========================
// HEALTH CHECK
// ===========================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ===========================
// AUTH ROUTES - SIMPLIFIED WITHOUT OTP
// ===========================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validate inputs
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      name: name.trim(),
      cart: [],
      orders: [],
      addresses: []
    });

    // Generate token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    console.log(`✅ New user registered: ${user.email}`);

    res.json({
      token,
      user: { id: user._id, email: user.email, name: user.name }
    });
  } catch (error) {
    console.error('Registration error:', error);

    res.status(500).json({
      error: 'Registration failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    console.log(`✅ User logged in: ${user.email}`);

    res.json({
      token,
      user: { id: user._id, email: user.email, name: user.name }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ===========================
// PRODUCT ROUTES
// ===========================
app.get('/api/products', async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = { isActive: true };

    if (category) {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { keywords: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const products = await Product.find(query);
    res.json({ products });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to get products' });
  }
});

// ===========================
// CART ROUTES
// ===========================
app.get('/api/cart', authenticateToken, async (req, res) => {
  try {
    const calculations = calculateCartTotal(req.user.cart);
    res.json({ cart: req.user.cart, calculations });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ error: 'Failed to get cart' });
  }
});

app.post('/api/cart/add', authenticateToken, async (req, res) => {
  try {
    const { name, price, image } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'Invalid product data' });
    }

    const existingItemIndex = req.user.cart.findIndex(item => item.name === name);

    if (existingItemIndex > -1) {
      req.user.cart[existingItemIndex].quantity += 1;
    } else {
      req.user.cart.push({ name, price, image, quantity: 1 });
    }

    await req.user.save();
    const calculations = calculateCartTotal(req.user.cart);

    res.json({ cart: req.user.cart, calculations });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ error: 'Failed to add to cart' });
  }
});

app.put('/api/cart/update', authenticateToken, async (req, res) => {
  try {
    const { name, quantity } = req.body;

    if (quantity === 0) {
      req.user.cart = req.user.cart.filter(item => item.name !== name);
    } else {
      const item = req.user.cart.find(item => item.name === name);
      if (item) {
        item.quantity = quantity;
      }
    }

    await req.user.save();
    const calculations = calculateCartTotal(req.user.cart);

    res.json({ cart: req.user.cart, calculations });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ error: 'Failed to update cart' });
  }
});

app.delete('/api/cart/remove', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    req.user.cart = req.user.cart.filter(item => item.name !== name);
    await req.user.save();

    const calculations = calculateCartTotal(req.user.cart);
    res.json({ cart: req.user.cart, calculations });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ error: 'Failed to remove from cart' });
  }
});

app.delete('/api/cart/clear', authenticateToken, async (req, res) => {
  try {
    req.user.cart = [];
    await req.user.save();

    res.json({ 
      cart: [], 
      calculations: { subtotal: 0, deliveryFee: 0, tax: 0, total: 0 } 
    });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

// ===========================
// ORDER ROUTES
// ===========================
app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { paymentMethod, paymentId, deliveryAddress } = req.body;

    if (req.user.cart.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const calculations = calculateCartTotal(req.user.cart);
    const orderId = generateOrderId();

    const order = {
      orderId,
      items: [...req.user.cart],
      total: calculations.total,
      deliveryAddress: deliveryAddress || req.user.addresses.find(a => a.isDefault),
      paymentMethod: paymentMethod || 'cod',
      paymentId: paymentId || null,
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'completed',
      status: 'confirmed',
      createdAt: new Date()
    };

    req.user.orders.push(order);
    req.user.cart = [];
    await req.user.save();

    res.json({ order });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const orders = req.user.orders.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );
    res.json({ orders });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

// ===========================
// ADDRESS ROUTES
// ===========================
app.get('/api/addresses', authenticateToken, async (req, res) => {
  try {
    res.json({ addresses: req.user.addresses });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ error: 'Failed to get addresses' });
  }
});

app.post('/api/addresses', authenticateToken, async (req, res) => {
  try {
    const { name, phone, address, city, state, pincode, isDefault } = req.body;

    if (!name || !phone || !address || !city || !state || !pincode) {
      return res.status(400).json({ error: 'All address fields required' });
    }

    if (isDefault || req.user.addresses.length === 0) {
      req.user.addresses.forEach(addr => addr.isDefault = false);
    }

    const newAddress = {
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      isDefault: isDefault || req.user.addresses.length === 0
    };

    req.user.addresses.push(newAddress);
    await req.user.save();

    res.json({ address: newAddress });
  } catch (error) {
    console.error('Add address error:', error);
    res.status(500).json({ error: 'Failed to add address' });
  }
});

app.put('/api/addresses/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const addressIndex = req.user.addresses.findIndex(
      (addr, idx) => idx.toString() === id || addr._id?.toString() === id
    );

    if (addressIndex === -1) {
      return res.status(404).json({ error: 'Address not found' });
    }

    if (updates.isDefault) {
      req.user.addresses.forEach(addr => addr.isDefault = false);
    }

    Object.assign(req.user.addresses[addressIndex], updates);
    await req.user.save();

    res.json({ address: req.user.addresses[addressIndex] });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ error: 'Failed to update address' });
  }
});

app.delete('/api/addresses/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    req.user.addresses = req.user.addresses.filter(
      (addr, idx) => idx.toString() !== id && addr._id?.toString() !== id
    );
    
    await req.user.save();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ error: 'Failed to delete address' });
  }
});

// ===========================
// SERVE HTML FILES
// ===========================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/:page', (req, res) => {
  const page = req.params.page;
  const filePath = path.join(__dirname, 'public', `${page}.html`);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  });
});

// ===========================
// ERROR HANDLING
// ===========================
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// ===========================
// START SERVER
// ===========================
const server = app.listen(PORT, () => {
  console.log(`🚀 PharmaSoft Server running on port ${PORT}`);
  console.log(`🌐 Access: http://localhost:${PORT}`);
  console.log(`🔧 Health check: http://localhost:${PORT}/api/health`);
  console.log('\n📋 Available API Endpoints:');
  console.log('   POST /api/auth/register');
  console.log('   POST /api/auth/login');
  console.log('   GET  /api/products');
  console.log('   GET  /api/cart');
  console.log('   POST /api/cart/add');
  console.log('   GET  /api/orders');
  console.log('   POST /api/orders');
  console.log('   GET  /api/addresses');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use!`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    mongoose.connection.close(false, () => {
      process.exit(0);
    });
  });
});

module.exports = app;