const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// MongoDB connection
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/unity_assets_db';
    console.log(`🔄 Attempting to connect to MongoDB...`);
    
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB connected successfully');
    console.log(`📍 Database: ${mongoose.connection.name}`);
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.log('💡 To use MongoDB Atlas:');
    console.log('   1. Create account at https://mongodb.com/atlas');
    console.log('   2. Create cluster and get connection string');
    console.log('   3. Update MONGODB_URI in .env file');
    console.log('   4. For now, continuing without database...');
  }
};

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Basic User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['USER', 'ADMIN'], default: 'USER' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true,
    message: 'Unity Assets MERN Backend is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    mongoStatus: {
      connected: mongoose.connection.readyState === 1,
      host: mongoose.connection.host || 'Not connected',
      name: mongoose.connection.name || 'Not connected'
    }
  });
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not connected. Please set up MongoDB connection.',
        instructions: 'Update MONGODB_URI in .env file with your MongoDB Atlas connection string'
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already in use'
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password, // In production: hash with bcrypt
      role: 'USER'
    });

    const userObj = user.toObject();
    delete userObj.password;

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: userObj,
        access_token: 'jwt-token-placeholder'
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not connected. Please set up MongoDB connection.'
      });
    }

    const user = await User.findOne({ email });
    if (!user || user.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const userObj = user.toObject();
    delete userObj.password;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userObj,
        access_token: 'jwt-token-placeholder'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get user profile (must come before /api/users/:id)
app.get('/api/users/profile', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not connected'
      });
    }

    // For now, return first user as placeholder (in real app, get from auth token)
    const user = await User.findOne().select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Users routes
app.get('/api/users', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not connected'
      });
    }

    const users = await User.find().select('-password');
    res.json({
      success: true,
      data: { users }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});


// Get user by ID
app.get('/api/users/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not connected'
      });
    }

    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'Test route working!' });
});

// Assets routes
app.get('/api/assets', (req, res) => {
  res.json({
    success: true,
    message: 'Assets endpoint ready - full implementation pending',
    data: {
      assets: [],
      pagination: { currentPage: 1, totalPages: 0, totalAssets: 0 }
    }
  });
});

// Featured assets endpoint
app.get('/api/assets/featured', (req, res) => {
  res.json({
    success: true,
    data: {
      assets: [
        {
          _id: '507f1f77bcf86cd799439011',
          name: 'Sample Unity Package 1',
          description: 'A sample Unity asset for demonstration',
          thumbnail: '/placeholder-asset.svg',
          fileUrl: '/sample-asset-1.unitypackage',
          downloadCount: 150,
          tags: ['characters', 'models'],
          categoryId: '507f1f77bcf86cd799439021',
          category: { name: 'Characters' },
          uploadedBy: { name: 'Demo Admin' },
          createdAt: new Date().toISOString(),
          isActive: true
        },
        {
          _id: '507f1f77bcf86cd799439012',
          name: 'Sample Unity Package 2', 
          description: 'Another sample Unity asset for demonstration',
          thumbnail: '/placeholder-asset.svg',
          fileUrl: '/sample-asset-2.unitypackage',
          downloadCount: 89,
          tags: ['environment', 'textures'],
          categoryId: '507f1f77bcf86cd799439022',
          category: { name: 'Environment' },
          uploadedBy: { name: 'Demo Admin' },
          createdAt: new Date().toISOString(),
          isActive: true
        },
        {
          _id: '507f1f77bcf86cd799439013',
          name: 'Sample Unity Package 3',
          description: 'Third sample Unity asset for demonstration', 
          thumbnail: '/placeholder-asset.svg',
          fileUrl: '/sample-asset-3.unitypackage',
          downloadCount: 203,
          tags: ['effects', 'particles'],
          categoryId: '507f1f77bcf86cd799439023',
          category: { name: 'Effects' },
          uploadedBy: { name: 'Demo Admin' },
          createdAt: new Date().toISOString(),
          isActive: true
        }
      ]
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: `Route ${req.originalUrl} not found` 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Unity Assets MERN Backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET  /api/health         - Health check`);
  console.log(`   POST /api/auth/register  - User registration`);
  console.log(`   POST /api/auth/login     - User login`);
  console.log(`   GET  /api/users          - Get all users`);
  console.log(`   GET  /api/assets         - Get assets (placeholder)`);
  console.log('');
  console.log('🔗 Test with: curl http://localhost:3001/api/health');
  console.log('');
  if (mongoose.connection.readyState !== 1) {
    console.log('⚠️  MongoDB not connected - some features will be limited');
    console.log('💡 To enable full MERN functionality, set up MongoDB Atlas:');
    console.log('   https://mongodb.com/atlas');
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed');
  process.exit(0);
});