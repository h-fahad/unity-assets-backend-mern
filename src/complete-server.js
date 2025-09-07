const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

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
    console.log('💡 Continuing without database for demo purposes...');
  }
};

// Connect to MongoDB
connectDB();

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests from Vercel frontend and localhost for development
    const allowedOrigins = [
      'https://unity-assets-frontend.vercel.app',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000'
    ];
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

// Middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Preflight OPTIONS handler for all routes
app.options(/.*/, function(req, res) {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Debug middleware to see all requests
app.use((req, res, next) => {
  console.log(`🌐 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

// Check if S3 is configured
const isS3Configured = !!(
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.AWS_S3_BUCKET_NAME
);

console.log('🔍 Server - S3 Configuration Check:');
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '✅ Set' : '❌ Missing');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '✅ Set' : '❌ Missing');
console.log('AWS_S3_BUCKET_NAME:', process.env.AWS_S3_BUCKET_NAME || '❌ Missing');
console.log('isS3Configured:', isS3Configured ? '✅ TRUE - Using S3' : '❌ FALSE - Using Local Storage');

// Local storage configuration
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(__dirname, '../uploads');
    
    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${extension}`);
  }
});

// S3 storage configuration
const s3Storage = multerS3({
  s3: s3Client,
  bucket: process.env.AWS_S3_BUCKET_NAME || '',
  acl: 'public-read',
  metadata: (req, file, cb) => {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const folder = file.fieldname === 'thumbnail' ? 'thumbnails' : 'assets';
    cb(null, `${folder}/${file.fieldname}-${uniqueSuffix}${extension}`);
  }
});

// Choose storage based on configuration
const storage = isS3Configured ? s3Storage : localStorage;

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    console.log(`📁 Uploading file: ${file.originalname} (${file.mimetype}) to ${isS3Configured ? 'S3' : 'Local Storage'}`);
    cb(null, true);
  }
});

// Helper function to get file URL
const getFileUrl = (file) => {
  if (isS3Configured && file.location) {
    // S3 file
    console.log(`📎 S3 file URL: ${file.location}`);
    return file.location;
  } else {
    // Local file
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
    const url = `${baseUrl}/uploads/${file.filename}`;
    console.log(`📎 Local file URL: ${url}`);
    return url;
  }
};

// Static files middleware
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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

// Asset Schema (No price - subscription-based system)
const assetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  thumbnail: String,
  fileUrl: String,
  downloadCount: { type: Number, default: 0 },
  tags: [String],
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  category: {
    name: String,
    slug: String
  },
  uploadedBy: {
    name: String,
    _id: String
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Asset = mongoose.model('Asset', assetSchema);

// Download Schema
const downloadSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  assetId: { type: String, required: true },
  downloadedAt: { type: Date, default: Date.now }
});

const Download = mongoose.model('Download', downloadSchema);

// Category Schema
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Category = mongoose.model('Category', categorySchema);

// SubscriptionPackage Schema
const subscriptionPackageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  basePrice: { type: Number, required: true },
  billingCycle: { 
    type: String, 
    enum: ['WEEKLY', 'MONTHLY', 'YEARLY'], 
    required: true 
  },
  yearlyDiscount: { type: Number, default: 0 },
  dailyDownloadLimit: { type: Number, required: true },
  features: [{ type: String }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const SubscriptionPackage = mongoose.model('SubscriptionPackage', subscriptionPackageSchema);

// Sample data for demonstration - downloads will be calculated from real database records
const sampleAssets = [
  {
    _id: '507f1f77bcf86cd799439011',
    name: 'Fantasy Character Pack',
    description: 'A complete pack of fantasy characters with animations and textures. Perfect for RPG games.',
    thumbnail: '/placeholder-asset.svg',
    fileUrl: '/fantasy-character-pack.unitypackage',
    downloadCount: 0, // Will be calculated from real download records
    tags: ['characters', 'fantasy', 'rpg', 'animations'],
    categoryId: '507f1f77bcf86cd799439021',
    category: { name: 'Characters', slug: 'characters' },
    uploadedBy: { name: 'Unity Studio', _id: '507f1f77bcf86cd799439051' },
    createdAt: new Date('2024-01-15').toISOString(),
    updatedAt: new Date('2024-01-15').toISOString(),
    isActive: true
  },
  {
    _id: '507f1f77bcf86cd799439012',
    name: 'Sci-Fi Environment Kit',
    description: 'Modular sci-fi environment pieces for creating futuristic scenes and levels.',
    thumbnail: '/placeholder-asset.svg',
    fileUrl: '/scifi-environment-kit.unitypackage',
    downloadCount: 0, // Will be calculated from real download records
    tags: ['environment', 'sci-fi', 'modular', 'textures'],
    categoryId: '507f1f77bcf86cd799439022',
    category: { name: 'Environment', slug: 'environment' },
    uploadedBy: { name: 'Future Games', _id: '507f1f77bcf86cd799439052' },
    createdAt: new Date('2024-02-20').toISOString(),
    updatedAt: new Date('2024-02-20').toISOString(),
    isActive: true
  },
  {
    _id: '507f1f77bcf86cd799439013',
    name: 'Particle Effects Bundle',
    description: 'Collection of stunning particle effects including fire, magic, explosions, and more.',
    thumbnail: '/placeholder-asset.svg',
    fileUrl: '/particle-effects-bundle.unitypackage',
    downloadCount: 0, // Will be calculated from real download records
    tags: ['effects', 'particles', 'vfx', 'magic'],
    categoryId: '507f1f77bcf86cd799439023',
    category: { name: 'Effects', slug: 'effects' },
    uploadedBy: { name: 'VFX Master', _id: '507f1f77bcf86cd799439053' },
    createdAt: new Date('2024-03-10').toISOString(),
    updatedAt: new Date('2024-03-10').toISOString(),
    isActive: true
  },
  {
    _id: '507f1f77bcf86cd799439014',
    name: 'Medieval Props Collection',
    description: 'Authentic medieval props and items for historical and fantasy games.',
    thumbnail: '/placeholder-asset.svg',
    fileUrl: '/medieval-props.unitypackage',
    downloadCount: 0, // Will be calculated from real download records
    tags: ['props', 'medieval', 'historical', 'items'],
    categoryId: '507f1f77bcf86cd799439024',
    category: { name: 'Props', slug: 'props' },
    uploadedBy: { name: 'History Craft', _id: '507f1f77bcf86cd799439054' },
    createdAt: new Date('2024-04-05').toISOString(),
    updatedAt: new Date('2024-04-05').toISOString(),
    isActive: true
  },
  {
    _id: '507f1f77bcf86cd799439015',
    name: 'Epic Orchestral Soundtrack',
    description: 'High-quality orchestral music tracks for epic game moments and cinematic scenes.',
    thumbnail: '/placeholder-asset.svg',
    fileUrl: '/epic-orchestral-soundtrack.unitypackage',
    downloadCount: 0, // Will be calculated from real download records
    tags: ['audio', 'music', 'orchestral', 'epic'],
    categoryId: '507f1f77bcf86cd799439025',
    category: { name: 'Audio', slug: 'audio' },
    uploadedBy: { name: 'Epic Sounds', _id: '507f1f77bcf86cd799439055' },
    createdAt: new Date('2024-05-12').toISOString(),
    updatedAt: new Date('2024-05-12').toISOString(),
    isActive: true
  }
];

const sampleCategories = [
  { _id: '507f1f77bcf86cd799439021', name: 'Characters', slug: 'characters', description: 'Character models and animations', isActive: true },
  { _id: '507f1f77bcf86cd799439022', name: 'Environment', slug: 'environment', description: 'Environmental assets and scenes', isActive: true },
  { _id: '507f1f77bcf86cd799439023', name: 'Effects', slug: 'effects', description: 'Visual and particle effects', isActive: true },
  { _id: '507f1f77bcf86cd799439024', name: 'Props', slug: 'props', description: 'Game props and items', isActive: true },
  { _id: '507f1f77bcf86cd799439025', name: 'Audio', slug: 'audio', description: 'Music and sound effects', isActive: true }
];

const samplePlans = [
  {
    _id: '507f1f77bcf86cd799439031',
    name: 'Basic',
    description: 'Perfect for indie developers',
    basePrice: 9.99,
    billingCycle: 'MONTHLY',
    yearlyDiscount: 20,
    dailyDownloadLimit: 5,
    features: ['5 downloads per day', 'Basic support', 'Community access'],
    isActive: true
  },
  {
    _id: '507f1f77bcf86cd799439032',
    name: 'Pro',
    description: 'For professional game studios',
    basePrice: 29.99,
    billingCycle: 'MONTHLY',
    yearlyDiscount: 25,
    dailyDownloadLimit: 25,
    features: ['25 downloads per day', 'Priority support', 'Early access', 'Commercial license'],
    isActive: true
  },
  {
    _id: '507f1f77bcf86cd799439033',
    name: 'Enterprise',
    description: 'Unlimited access for large teams',
    basePrice: 99.99,
    billingCycle: 'MONTHLY',
    yearlyDiscount: 30,
    dailyDownloadLimit: 100,
    features: ['100 downloads per day', 'Premium support', 'Custom assets', 'Team management'],
    isActive: true
  }
];

// ==================== ROUTES ====================

// Health check
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
    },
    version: '2.0.0',
    endpoints: [
      'GET /api/health',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/users',
      'POST /api/users',
      'PUT /api/users/:id',
      'DELETE /api/users/:id',
      'PATCH /api/users/:id/role',
      'PATCH /api/users/:id/status',
      'GET /api/users/profile',
      'GET /api/users/stats',
      'GET /api/assets',
      'GET /api/assets/featured',
      'GET /api/categories',
      'GET /api/categories/active',
      'GET /api/subscriptions/plans',
      'GET /api/subscriptions/admin/stats',
      'POST /api/payments/create-checkout-session',
      'POST /api/payments/create-subscription-manual',
      'POST /api/payments/webhook',
      'GET /api/payments/subscription-status'
    ]
  });
});

// ==================== AUTH ROUTES ====================


app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (mongoose.connection.readyState === 1) {
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
    } else {
      // Demo mode without database
      res.status(201).json({
        success: true,
        message: 'User registered successfully (demo mode)',
        data: {
          user: {
            _id: Date.now().toString(),
            name,
            email,
            role: 'USER',
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          access_token: 'jwt-token-placeholder'
        }
      });
    }
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

    if (mongoose.connection.readyState === 1) {
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
    } else {
      // Demo mode
      res.json({
        success: true,
        message: 'Login successful (demo mode)',
        data: {
          user: {
            _id: '507f1f77bcf86cd799439061',
            name: 'Demo User',
            email,
            role: 'USER',
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          access_token: 'jwt-token-placeholder'
        }
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ==================== USER ROUTES ====================

app.get('/api/users/profile', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
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
    } else {
      // Demo mode
      res.json({
        success: true,
        data: {
          user: {
            _id: '507f1f77bcf86cd799439061',
            name: 'Demo User',
            email: 'demo@example.com',
            role: 'USER',
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      role = '', 
      status = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    if (mongoose.connection.readyState === 1) {
      // Build query
      let query = {};
      
      // Search by name or email
      if (search && search.trim()) {
        query.$or = [
          { name: { $regex: search.trim(), $options: 'i' } },
          { email: { $regex: search.trim(), $options: 'i' } }
        ];
      }

      // Filter by role
      if (role && role !== 'all') {
        query.role = role.toUpperCase();
      }

      // Filter by status
      if (status && status !== 'all') {
        query.isActive = status === 'active';
      }

      // Sort options
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

      const [users, totalUsers] = await Promise.all([
        User.find(query)
          .select('-password')
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        User.countDocuments(query)
      ]);

      // Add download and asset counts
      const usersWithCounts = await Promise.all(
        users.map(async (user) => {
          const [downloadCount, assetCount] = await Promise.all([
            Download.countDocuments({ userId: user._id }),
            Asset.countDocuments({ createdBy: user._id })
          ]);
          
          return {
            ...user,
            _count: {
              downloads: downloadCount,
              assets: assetCount
            }
          };
        })
      );

      const totalPages = Math.ceil(totalUsers / limitNum);

      res.json({
        success: true,
        data: {
          users: usersWithCounts,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalUsers,
            hasNextPage: pageNum < totalPages,
            hasPrevPage: pageNum > 1,
            limit: limitNum
          }
        }
      });
    } else {
      // Demo mode - apply search and pagination to sample data
      let demoUsers = [
        {
          _id: 'demo1',
          name: 'John Doe',
          email: 'john@example.com',
          role: 'USER',
          isActive: true,
          createdAt: '2024-01-15T10:30:00Z',
          updatedAt: '2024-01-15T10:30:00Z',
          _count: { downloads: 25, assets: 5 }
        },
        {
          _id: 'demo2',
          name: 'Jane Smith',
          email: 'jane@example.com',
          role: 'ADMIN',
          isActive: true,
          createdAt: '2024-02-20T14:45:00Z',
          updatedAt: '2024-02-20T14:45:00Z',
          _count: { downloads: 50, assets: 12 }
        },
        {
          _id: 'demo3',
          name: 'Mike Johnson',
          email: 'mike@example.com',
          role: 'USER',
          isActive: false,
          createdAt: '2024-03-10T09:15:00Z',
          updatedAt: '2024-03-10T09:15:00Z',
          _count: { downloads: 10, assets: 2 }
        }
      ];

      // Apply search filter
      if (search && search.trim()) {
        const searchTerm = search.trim().toLowerCase();
        demoUsers = demoUsers.filter(user => 
          user.name.toLowerCase().includes(searchTerm) || 
          user.email.toLowerCase().includes(searchTerm)
        );
      }

      // Apply role filter
      if (role && role !== 'all') {
        demoUsers = demoUsers.filter(user => user.role === role.toUpperCase());
      }

      // Apply status filter
      if (status && status !== 'all') {
        const isActive = status === 'active';
        demoUsers = demoUsers.filter(user => user.isActive === isActive);
      }

      const totalUsers = demoUsers.length;
      const totalPages = Math.ceil(totalUsers / limitNum);
      const paginatedUsers = demoUsers.slice(skip, skip + limitNum);

      res.json({
        success: true,
        data: {
          users: paginatedUsers,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalUsers,
            hasNextPage: pageNum < totalPages,
            hasPrevPage: pageNum > 1,
            limit: limitNum
          }
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// User stats endpoint
app.get('/api/users/stats', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const totalUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({ isActive: true });
      const inactiveUsers = await User.countDocuments({ isActive: false });
      const adminUsers = await User.countDocuments({ role: 'ADMIN' });
      
      res.json({
        success: true,
        data: {
          total: totalUsers,
          active: activeUsers,
          inactive: inactiveUsers,
          admins: adminUsers,
          withActiveSubscriptions: 0 // Mock for now
        }
      });
    } else {
      // Demo mode
      res.json({
        success: true,
        data: {
          total: 1,
          active: 1,
          inactive: 0,
          admins: 0,
          withActiveSubscriptions: 0
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user stats',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Create user endpoint
app.post('/api/users', async (req, res) => {
  try {
    const { name, email, password, role = 'USER' } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (mongoose.connection.readyState === 1) {
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
        role,
        isActive: true
      });

      const userObj = user.toObject();
      delete userObj.password;

      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: { user: userObj }
      });
    } else {
      // Demo mode
      res.status(201).json({
        success: true,
        message: 'User created successfully (demo mode)',
        data: {
          user: {
            _id: Date.now().toString(),
            name,
            email,
            role,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      });
    }
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update user endpoint
app.put('/api/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, role } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    if (mongoose.connection.readyState === 1) {
      // Check if email is already in use by another user
      const existingUser = await User.findOne({ 
        email, 
        _id: { $ne: userId } 
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use by another user'
        });
      }

      // Update user
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { 
          name, 
          email, 
          role,
          updatedAt: new Date()
        },
        { new: true, runValidators: true }
      ).select('-password');

      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        message: 'User updated successfully',
        data: { user: updatedUser }
      });
    } else {
      // Demo mode
      res.json({
        success: true,
        message: 'User updated successfully (demo mode)',
        data: {
          user: {
            _id: userId,
            name,
            email,
            role,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      });
    }
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete user endpoint
app.delete('/api/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    if (mongoose.connection.readyState === 1) {
      const deletedUser = await User.findByIdAndDelete(userId);

      if (!deletedUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } else {
      // Demo mode
      res.json({
        success: true,
        message: 'User deleted successfully (demo mode)'
      });
    }
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Change user role endpoint
app.patch('/api/users/:id/role', async (req, res) => {
  try {
    const userId = req.params.id;
    const { role } = req.body;

    if (!role || !['USER', 'ADMIN'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Valid role (USER or ADMIN) is required'
      });
    }

    if (mongoose.connection.readyState === 1) {
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { role, updatedAt: new Date() },
        { new: true, runValidators: true }
      ).select('-password');

      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        message: `User role changed to ${role} successfully`,
        data: { user: updatedUser }
      });
    } else {
      // Demo mode
      res.json({
        success: true,
        message: `User role changed to ${role} successfully (demo mode)`,
        data: {
          user: {
            _id: userId,
            role,
            updatedAt: new Date().toISOString()
          }
        }
      });
    }
  } catch (error) {
    console.error('Change role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change user role',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Toggle user status endpoint
app.patch('/api/users/:id/status', async (req, res) => {
  try {
    const userId = req.params.id;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive boolean value is required'
      });
    }

    if (mongoose.connection.readyState === 1) {
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { isActive, updatedAt: new Date() },
        { new: true, runValidators: true }
      ).select('-password');

      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: { user: updatedUser }
      });
    } else {
      // Demo mode
      res.json({
        success: true,
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully (demo mode)`,
        data: {
          user: {
            _id: userId,
            isActive,
            updatedAt: new Date().toISOString()
          }
        }
      });
    }
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ==================== ASSET ROUTES ====================

app.get('/api/assets', async (req, res) => {
  console.log('🚀 GET /api/assets route HIT!');
  try {
    const { 
      page = 1, 
      limit = 12, 
      search = '', 
      category = '', 
      status = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    console.log('🔍 Assets API request - MongoDB readyState:', mongoose.connection.readyState);
    
    if (mongoose.connection.readyState === 1) {
      console.log('✅ Using database mode');
      // Build query for database
      let query = {};
      
      // Search by name, description, or tags
      if (search && search.trim()) {
        query.$or = [
          { name: { $regex: search.trim(), $options: 'i' } },
          { description: { $regex: search.trim(), $options: 'i' } },
          { tags: { $in: [new RegExp(search.trim(), 'i')] } }
        ];
      }

      // Filter by category
      if (category && category !== 'all') {
        query.categoryId = category;
      }

      // Filter by status
      if (status && status !== 'all') {
        query.isActive = status === 'active';
      }

      // Sort options
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

      const [assets, totalAssets] = await Promise.all([
        Asset.find(query)
          .populate('categoryId', 'name slug')
          .populate('uploadedBy', 'name email')
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Asset.countDocuments(query)
      ]);

      // Add download counts and transform response
      const assetsWithCounts = await Promise.all(
        assets.map(async (asset) => {
          const downloadCount = await Download.countDocuments({ assetId: asset._id });
          
          // Handle category population - if populate failed, do manual lookup
          let category = null;
          console.log('Processing asset:', asset._id, 'categoryId:', asset.categoryId, 'type:', typeof asset.categoryId);
          if (asset.categoryId) {
            if (typeof asset.categoryId === 'object' && asset.categoryId._id) {
              // Population worked
              console.log('Population worked for asset:', asset._id);
              category = {
                _id: asset.categoryId._id,
                name: asset.categoryId.name,
                slug: asset.categoryId.slug
              };
            } else {
              // Population failed, do manual lookup
              console.log('Doing manual category lookup for asset:', asset._id, 'categoryId:', asset.categoryId);
              try {
                const categoryDoc = await Category.findById(asset.categoryId);
                console.log('Category lookup result:', categoryDoc);
                if (categoryDoc) {
                  category = {
                    _id: categoryDoc._id,
                    name: categoryDoc.name,
                    slug: categoryDoc.slug
                  };
                }
              } catch (error) {
                console.log('Category lookup failed for asset:', asset._id, 'categoryId:', asset.categoryId, 'error:', error.message);
              }
            }
          }
          
          return {
            ...asset,
            downloadCount,
            category: category || { _id: 'unknown', name: 'Unknown Category', slug: 'unknown' },
            _count: { downloads: downloadCount }
          };
        })
      );

      const totalPages = Math.ceil(totalAssets / limitNum);

      res.json({
        success: true,
        data: {
          assets: assetsWithCounts,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalAssets,
            hasNextPage: pageNum < totalPages,
            hasPrevPage: pageNum > 1,
            limit: limitNum
          }
        }
      });
    } else {
      // Demo mode with enhanced filtering - but still calculate real download counts
      let filteredAssets = [...sampleAssets];

      // Calculate real download counts from database even in demo mode
      try {
        if (mongoose.connection.readyState === 1) {
          // If database is available, get real download counts
          filteredAssets = await Promise.all(
            filteredAssets.map(async (asset) => {
              const downloadCount = await Download.countDocuments({ assetId: asset._id });
              return {
                ...asset,
                downloadCount,
                _count: { downloads: downloadCount }
              };
            })
          );
        } else {
          // If no database, set download counts to 0
          filteredAssets = filteredAssets.map(asset => ({
            ...asset,
            downloadCount: 0,
            _count: { downloads: 0 }
          }));
        }
      } catch (error) {
        console.error('Error calculating download counts:', error);
        // Fallback to 0 counts
        filteredAssets = filteredAssets.map(asset => ({
          ...asset,
          downloadCount: 0,
          _count: { downloads: 0 }
        }));
      }

      // Apply search filter
      if (search && search.trim()) {
        const searchLower = search.trim().toLowerCase();
        filteredAssets = filteredAssets.filter(asset =>
          asset.name.toLowerCase().includes(searchLower) ||
          asset.description.toLowerCase().includes(searchLower) ||
          asset.tags.some(tag => tag.toLowerCase().includes(searchLower))
        );
      }

      // Apply category filter
      if (category && category !== 'all') {
        filteredAssets = filteredAssets.filter(asset => 
          asset.category.slug === category || asset.categoryId === category
        );
      }

      // Apply status filter
      if (status && status !== 'all') {
        const isActive = status === 'active';
        filteredAssets = filteredAssets.filter(asset => asset.isActive === isActive);
      }

      // Apply sorting
      filteredAssets.sort((a, b) => {
        let aValue, bValue;
        
        switch (sortBy) {
          case 'name':
            aValue = a.name.toLowerCase();
            bValue = b.name.toLowerCase();
            break;
          case 'downloadCount':
            aValue = a.downloadCount || 0;
            bValue = b.downloadCount || 0;
            break;
          case 'updatedAt':
            aValue = new Date(a.updatedAt);
            bValue = new Date(b.updatedAt);
            break;
          default:
            aValue = new Date(a.createdAt);
            bValue = new Date(b.createdAt);
        }

        if (sortOrder === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });

      const totalAssets = filteredAssets.length;
      const totalPages = Math.ceil(totalAssets / limitNum);
      const paginatedAssets = filteredAssets.slice(skip, skip + limitNum);

      res.json({
        success: true,
        data: {
          assets: paginatedAssets,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalAssets,
            hasNextPage: pageNum < totalPages,
            hasPrevPage: pageNum > 1,
            limit: limitNum
          }
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assets',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

app.get('/api/assets/featured', async (req, res) => {
  try {
    let featuredAssets;

    if (mongoose.connection.readyState === 1) {
      // Database mode - get real featured assets based on actual downloads
      const assets = await Asset.find({ isActive: true })
        .populate('category', 'name slug')
        .populate('uploadedBy', 'name email')
        .lean();

      // Add real download counts and sort
      const assetsWithCounts = await Promise.all(
        assets.map(async (asset) => {
          const downloadCount = await Download.countDocuments({ assetId: asset._id });
          return {
            ...asset,
            downloadCount,
            _count: { downloads: downloadCount }
          };
        })
      );

      // Get top 3 most downloaded
      featuredAssets = assetsWithCounts
        .sort((a, b) => b.downloadCount - a.downloadCount)
        .slice(0, 3);
    } else {
      // Demo mode - calculate real downloads for sample assets if database available
      let assetsWithCounts = [...sampleAssets];

      if (mongoose.connection.readyState === 1) {
        // Calculate real download counts even for sample data
        assetsWithCounts = await Promise.all(
          sampleAssets.map(async (asset) => {
            const downloadCount = await Download.countDocuments({ assetId: asset._id });
            return {
              ...asset,
              downloadCount,
              _count: { downloads: downloadCount }
            };
          })
        );
      } else {
        // No database - set counts to 0
        assetsWithCounts = sampleAssets.map(asset => ({
          ...asset,
          downloadCount: 0,
          _count: { downloads: 0 }
        }));
      }

      // Get top 3 most downloaded
      featuredAssets = assetsWithCounts
        .sort((a, b) => b.downloadCount - a.downloadCount)
        .slice(0, 3);
    }

    res.json({
      success: true,
      data: {
        assets: featuredAssets
      }
    });
  } catch (error) {
    console.error('Featured assets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get featured assets'
    });
  }
});

// Asset stats endpoint (must come before :id route)
app.get('/api/assets/stats', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const totalAssets = await Asset.countDocuments();
      const activeAssets = await Asset.countDocuments({ isActive: true });
      const inactiveAssets = await Asset.countDocuments({ isActive: false });
      const totalDownloads = await Download.countDocuments();
      
      res.json({
        success: true,
        data: {
          total: totalAssets,
          active: activeAssets,
          inactive: inactiveAssets,
          totalDownloads
        }
      });
    } else {
      // Demo mode - but still calculate real download counts if database is available
      const activeAssets = sampleAssets.filter(asset => asset.isActive).length;
      const inactiveAssets = sampleAssets.filter(asset => !asset.isActive).length;
      
      let totalDownloads = 0;
      if (mongoose.connection.readyState === 1) {
        // Get real total downloads from database
        totalDownloads = await Download.countDocuments();
      }
      
      res.json({
        success: true,
        data: {
          total: sampleAssets.length,
          active: activeAssets,
          inactive: inactiveAssets,
          totalDownloads
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get asset stats',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST route for uploading assets (must come before parameterized routes)
app.post('/api/assets', upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'assetFile', maxCount: 1 }
]), async (req, res) => {
  console.log('🔥 POST /api/assets route HIT!');
  try {
    const { name, description, categoryId, tags } = req.body;
    const files = req.files;
    
    console.log('Asset upload request received:', { name, description, categoryId, tags });
    console.log('Files received:', files);
    
    // Basic validation
    if (!name || !description || !categoryId) {
      return res.status(400).json({
        success: false,
        message: 'Name, description, and category are required'
      });
    }

    // Check if files are uploaded
    if (!files?.thumbnail?.[0] || !files?.assetFile?.[0]) {
      return res.status(400).json({
        success: false,
        message: 'Both thumbnail and asset file are required'
      });
    }

    // Find category
    let category = null;
    if (mongoose.connection.readyState === 1) {
      category = await Category.findById(categoryId);
    } else {
      category = sampleCategories.find(c => c._id === categoryId);
    }
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Process tags
    let processedTags = [];
    if (tags) {
      if (Array.isArray(tags)) {
        processedTags = tags.filter(tag => tag && tag.trim()).map(tag => tag.trim());
      } else if (typeof tags === 'string') {
        processedTags = tags.split(',').filter(tag => tag.trim()).map(tag => tag.trim());
      }
    }

    // Get uploaded file paths
    const thumbnailFile = files.thumbnail[0];
    const assetFileUpload = files.assetFile[0];
    
    const thumbnailUrl = getFileUrl(thumbnailFile);
    const assetFileUrl = getFileUrl(assetFileUpload);
    
    console.log('File paths:', { thumbnailUrl, assetFileUrl });

    // Create new asset object
    const newAsset = {
      _id: new Date().getTime().toString(), // Simple ID generation
      name: name.trim(),
      description: description.trim(),
      thumbnail: thumbnailUrl,
      fileUrl: assetFileUrl,
      downloadCount: 0,
      tags: processedTags,
      categoryId: categoryId,
      category: { name: category.name, slug: category.slug },
      uploadedBy: { name: 'Admin User', _id: 'admin-user-id' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true
    };

    if (mongoose.connection.readyState === 1) {
      // Save to database
      const asset = new Asset({
        name: newAsset.name,
        description: newAsset.description,
        categoryId: categoryId,
        tags: processedTags,
        thumbnail: thumbnailUrl,
        fileUrl: assetFileUrl,
        uploadedBy: { name: 'Admin User', _id: 'admin-user-id' },
        isActive: true
      });

      await asset.save();
      
      res.status(201).json({
        success: true,
        message: 'Asset uploaded successfully',
        data: { asset: asset.toObject() }
      });
    } else {
      // Demo mode - add to sample assets array
      sampleAssets.push(newAsset);
      
      res.status(201).json({
        success: true,
        message: 'Asset uploaded successfully (demo mode)',
        data: { asset: newAsset }
      });
    }
  } catch (error) {
    console.error('Asset upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Asset upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

app.get('/api/assets/:id', async (req, res) => {
  try {
    const assetId = req.params.id;
    
    // Check if it's a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(assetId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid asset ID format'
      });
    }
    
    // Get asset from MongoDB database
    const asset = await Asset.findById(assetId);
    
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }
    
    res.json({
      success: true,
      data: { asset }
    });
  } catch (error) {
    console.error('Get asset by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get asset'
    });
  }
});

// Update asset endpoint
app.patch('/api/assets/:id', async (req, res) => {
  try {
    const assetId = req.params.id;
    const updateData = req.body;
    
    // Update asset in MongoDB database
    const asset = await Asset.findById(assetId);
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }
    
    // Update only the fields provided
    if (updateData.name !== undefined) asset.name = updateData.name;
    if (updateData.description !== undefined) asset.description = updateData.description;
    if (updateData.categoryId !== undefined) asset.categoryId = updateData.categoryId;
    if (updateData.isActive !== undefined) asset.isActive = updateData.isActive;
    if (updateData.tags !== undefined) asset.tags = updateData.tags;
    
    asset.updatedAt = new Date();
    
    await asset.save();
    
    res.json({
      success: true,
      message: 'Asset updated successfully',
      data: { asset }
    });
  } catch (error) {
    console.error('Update asset error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update asset'
    });
  }
});

// Toggle asset status endpoint
app.patch('/api/assets/:id/status', async (req, res) => {
  try {
    const assetId = req.params.id;
    
    if (mongoose.connection.readyState === 1) {
      const asset = await Asset.findById(assetId);
      if (!asset) {
        return res.status(404).json({
          success: false,
          message: 'Asset not found'
        });
      }
      
      asset.isActive = !asset.isActive;
      asset.updatedAt = new Date();
      await asset.save();
      
      res.json({
        success: true,
        message: `Asset ${asset.isActive ? 'activated' : 'deactivated'} successfully`,
        data: { asset }
      });
    } else {
      // Demo mode
      const assetIndex = sampleAssets.findIndex(a => a._id === assetId);
      if (assetIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Asset not found'
        });
      }
      
      sampleAssets[assetIndex].isActive = !sampleAssets[assetIndex].isActive;
      sampleAssets[assetIndex].updatedAt = new Date().toISOString();
      
      res.json({
        success: true,
        message: `Asset ${sampleAssets[assetIndex].isActive ? 'activated' : 'deactivated'} successfully`,
        data: { asset: sampleAssets[assetIndex] }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update asset status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete asset endpoint
app.delete('/api/assets/:id', async (req, res) => {
  try {
    const assetId = req.params.id;
    
    if (mongoose.connection.readyState === 1) {
      const asset = await Asset.findByIdAndDelete(assetId);
      if (!asset) {
        return res.status(404).json({
          success: false,
          message: 'Asset not found'
        });
      }
      
      // Also delete related downloads
      await Download.deleteMany({ assetId: assetId });
      
      res.json({
        success: true,
        message: 'Asset deleted successfully'
      });
    } else {
      // Demo mode
      const assetIndex = sampleAssets.findIndex(a => a._id === assetId);
      if (assetIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Asset not found'
        });
      }
      
      sampleAssets.splice(assetIndex, 1);
      
      res.json({
        success: true,
        message: 'Asset deleted successfully'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete asset',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ==================== CATEGORY ROUTES ====================

app.get('/api/categories/active', async (req, res) => {
  try {
    const activeCategories = await Category.find({ isActive: true });
    res.json({
      success: true,
      data: {
        categories: activeCategories
      }
    });
  } catch (error) {
    console.error('Error fetching active categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active categories'
    });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    // Add aggregation to include asset count for each category
    const categories = await Category.aggregate([
      {
        $lookup: {
          from: 'assets',
          localField: '_id',
          foreignField: 'categoryId',
          as: 'assets'
        }
      },
      {
        $addFields: {
          _count: {
            assets: { $size: '$assets' }
          }
        }
      },
      {
        $project: {
          assets: 0 // Remove the assets array from final output
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        categories: categories
      }
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
});

// Get category by ID
app.get('/api/categories/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    res.json(category);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category'
    });
  }
});

// Get category by slug
app.get('/api/categories/slug/:slug', async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug });
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    res.json(category);
  } catch (error) {
    console.error('Error fetching category by slug:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category'
    });
  }
});

// Create category
app.post('/api/categories', async (req, res) => {
  try {
    const { name, description, slug } = req.body;
    
    // Auto-generate slug if not provided
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
    
    // Check if slug already exists
    const existingCategory = await Category.findOne({ slug: finalSlug });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'A category with this slug already exists'
      });
    }
    
    const newCategory = new Category({
      name,
      description,
      slug: finalSlug
    });
    
    const savedCategory = await newCategory.save();
    res.status(201).json(savedCategory);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create category'
    });
  }
});

// Update category
app.patch('/api/categories/:id', async (req, res) => {
  try {
    const { name, description, slug } = req.body;
    const updateData = { updatedAt: new Date() };
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (slug !== undefined) {
      // Check if new slug conflicts with existing categories (excluding current one)
      const existingCategory = await Category.findOne({ 
        slug: slug, 
        _id: { $ne: req.params.id } 
      });
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'A category with this slug already exists'
        });
      }
      updateData.slug = slug;
    }
    
    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!updatedCategory) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    
    res.json(updatedCategory);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update category'
    });
  }
});

// Delete category
app.delete('/api/categories/:id', async (req, res) => {
  try {
    // Check if category has associated assets
    const assetCount = await Asset.countDocuments({ categoryId: req.params.id });
    if (assetCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. It has ${assetCount} associated assets.`
      });
    }
    
    const deletedCategory = await Category.findByIdAndDelete(req.params.id);
    if (!deletedCategory) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete category'
    });
  }
});

// Toggle category status
app.patch('/api/categories/:id/toggle-status', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    
    category.isActive = !category.isActive;
    category.updatedAt = new Date();
    await category.save();
    
    res.json(category);
  } catch (error) {
    console.error('Error toggling category status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle category status'
    });
  }
});

// ==================== SUBSCRIPTION ROUTES ====================

app.get('/api/subscriptions/plans', (req, res) => {
  res.json({
    success: true,
    data: {
      plans: samplePlans
    }
  });
});

// Admin stats endpoint
app.get('/api/subscriptions/admin/stats', async (req, res) => {
  try {
    let totalDownloads = 0;
    let activeSubscriptions = 0;
    let recentActivity = [];

    if (mongoose.connection.readyState === 1) {
      // Get real data from database
      const totalDownloadCount = await Download.countDocuments();
      const recentDownloads = await Download.find()
        .sort({ downloadedAt: -1 })
        .limit(3)
        .populate('assetId', 'name')
        .populate('userId', 'name');

      totalDownloads = totalDownloadCount;
      activeSubscriptions = 0; // Will be real when subscription model is implemented
      
      // Build recent activity from real data
      recentActivity = [];
      
      // Add recent downloads
      for (const download of recentDownloads) {
        recentActivity.push({
          type: 'download',
          message: `${download.userId?.name || 'User'} downloaded ${download.assetId?.name || 'an asset'}`,
          timestamp: download.downloadedAt.toISOString()
        });
      }
      
      // Add recent user registrations
      const recentUsers = await User.find()
        .sort({ createdAt: -1 })
        .limit(2);
      
      for (const user of recentUsers) {
        recentActivity.push({
          type: 'user',
          message: `New user ${user.name || user.email} registered`,
          timestamp: user.createdAt.toISOString()
        });
      }
      
      // Sort by timestamp (newest first)
      recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      recentActivity = recentActivity.slice(0, 5); // Keep only 5 most recent
      
    } else {
      // Demo mode - but still get real download counts if database is available
      if (mongoose.connection.readyState === 1) {
        totalDownloads = await Download.countDocuments();
      } else {
        totalDownloads = 0; // No fake downloads
      }
      activeSubscriptions = 2;
      
      recentActivity = [
        {
          type: 'download',
          message: 'User downloaded Fantasy Character Pack',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        },
        {
          type: 'subscription',
          message: 'New Pro subscription activated',
          timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
        },
        {
          type: 'user',
          message: 'New user registered',
          timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
        }
      ];
    }
    
    res.json({
      success: true,
      data: {
        totalDownloads,
        active: activeSubscriptions,
        recentActivity
      }
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin stats',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ==================== PAYMENT ROUTES ====================

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Map plan IDs to Stripe Price IDs
const getStripePriceId = (planId, billingCycle) => {
  const priceMap = {
    '507f1f77bcf86cd799439031': { // Basic
      MONTHLY: process.env.STRIPE_PRICE_BASIC_MONTHLY,
      YEARLY: process.env.STRIPE_PRICE_BASIC_YEARLY
    },
    '507f1f77bcf86cd799439032': { // Pro
      MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY,
      YEARLY: process.env.STRIPE_PRICE_PRO_YEARLY
    },
    '507f1f77bcf86cd799439033': { // Enterprise
      MONTHLY: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
      YEARLY: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY
    }
  };
  
  return priceMap[planId]?.[billingCycle];
};

// Create Stripe checkout session for subscription
app.post('/api/payments/create-checkout-session', async (req, res) => {
  console.log('=== PAYMENT ROUTE CALLED ===');
  console.log('Request body:', req.body);
  
  try {
    const { planId, billingCycle } = req.body;

    if (!planId || !billingCycle) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID and billing cycle are required'
      });
    }

    // Get Stripe Price ID
    const stripePriceId = getStripePriceId(planId, billingCycle);
    console.log(`Plan ID: ${planId}, Billing Cycle: ${billingCycle}, Stripe Price ID: ${stripePriceId}`);
    
    if (!stripePriceId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan or billing cycle'
      });
    }

    const frontendUrl = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3000';

    // Create Stripe checkout session
    console.log('Creating Stripe checkout session...');
    console.log('Stripe Secret Key:', process.env.STRIPE_SECRET_KEY ? 'Set' : 'Not set');
    
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{
          price: stripePriceId,
          quantity: 1,
        }],
        success_url: `${frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/packages`,
        metadata: {
          planId: planId,
          billingCycle: billingCycle
        }
      });

      console.log('Stripe session created successfully:', session.id);
      
      res.json({
        success: true,
        data: {
          sessionId: session.id,
          url: session.url
        }
      });
    } catch (stripeError) {
      console.error('Stripe error:', stripeError);
      
      // If Stripe fails, return error instead of fake session
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment session',
        error: stripeError.message
      });
    }
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Create manual subscription for testing
app.post('/api/payments/create-subscription-manual', async (req, res) => {
  try {
    const { planId, billingCycle = 'MONTHLY' } = req.body;

    if (!planId) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID is required'
      });
    }

    // For demo purposes, simulate creating a subscription
    const mockSubscription = {
      id: `sub_${Date.now()}`,
      planId,
      billingCycle,
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + (billingCycle === 'YEARLY' ? 365 : 30) * 24 * 60 * 60 * 1000)
    };

    res.json({
      success: true,
      message: 'Manual subscription created successfully (demo)',
      data: {
        subscription: mockSubscription
      }
    });
  } catch (error) {
    console.error('Error creating manual subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create manual subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Stripe webhook handler (must be before body parsing middleware)
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Received Stripe webhook: ${event.type}`);

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('Payment successful:', session.id);
      
      // Here you would typically:
      // 1. Get user info from session metadata or customer
      // 2. Update user's subscription status in database
      // 3. Send confirmation email
      
      console.log('Session metadata:', session.metadata);
      break;
      
    case 'invoice.payment_succeeded':
      const invoice = event.data.object;
      console.log('Subscription payment succeeded:', invoice.id);
      break;
      
    case 'customer.subscription.deleted':
      const subscription = event.data.object;
      console.log('Subscription cancelled:', subscription.id);
      break;
      
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Get subscription status
app.get('/api/payments/subscription-status', (req, res) => {
  res.json({
    success: true,
    data: {
      hasActiveSubscription: false,
      subscription: null
    }
  });
});

// ==================== DOWNLOAD ROUTES ====================

app.post('/api/downloads/:assetId', async (req, res) => {
  try {
    const assetId = req.params.assetId;
    
    // For demo purposes, we'll accept any user ID from headers or use 'anonymous'
    const userId = req.headers['user-id'] || 'anonymous';
    
    // Check if asset exists (in sample data for now)
    const asset = sampleAssets.find(a => a._id === assetId);

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    if (mongoose.connection.readyState === 1) {
      // Record the download in the database
      await Download.create({
        userId: userId,
        assetId: assetId,
        downloadedAt: new Date()
      });
      
      console.log(`📥 Download recorded: ${asset.name} by user ${userId}`);
    }

    // In real app, check user subscription and daily limits
    res.json({
      success: true,
      message: 'Download started',
      data: {
        downloadUrl: asset.fileUrl,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
      }
    });
  } catch (error) {
    console.error('Error recording download:', error);
    res.status(500).json({
      success: false,
      message: 'Download failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

app.get('/api/downloads/my-downloads', (req, res) => {
  res.json({
    success: true,
    data: {
      downloads: [],
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalDownloads: 0
      }
    }
  });
});

// ==================== ERROR HANDLERS ====================

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
  console.log(`   GET  /api/health              - Health check`);
  console.log(`   POST /api/auth/register       - User registration`);
  console.log(`   POST /api/auth/login          - User login`);
  console.log(`   GET  /api/users               - Get all users`);
  console.log(`   POST /api/users               - Create new user`);
  console.log(`   PUT  /api/users/:id           - Update user`);
  console.log(`   DELETE /api/users/:id         - Delete user`);
  console.log(`   PATCH /api/users/:id/role     - Change user role`);
  console.log(`   PATCH /api/users/:id/status   - Toggle user status`);
  console.log(`   GET  /api/users/profile       - Get user profile`);
  console.log(`   GET  /api/users/stats         - Get user statistics`);
  console.log(`   GET  /api/assets              - Get assets (with pagination)`);
  console.log(`   GET  /api/assets/featured     - Get featured assets`);
  console.log(`   GET  /api/assets/:id          - Get asset by ID`);
  console.log(`   PATCH /api/assets/:id         - Update asset`);
  console.log(`   GET  /api/categories          - Get categories`);
  console.log(`   GET  /api/categories/active   - Get active categories`);
  console.log(`   GET  /api/subscriptions/plans - Get subscription plans`);
  console.log(`   GET  /api/subscriptions/admin/stats - Get admin stats`);
  console.log(`   POST /api/payments/create-checkout-session - Create payment session`);
  console.log(`   POST /api/payments/create-subscription-manual - Create manual subscription`);
  console.log(`   POST /api/payments/webhook - Stripe webhook handler`);
  console.log(`   GET  /api/payments/subscription-status - Get subscription status`);
  console.log(`   POST /api/downloads/:assetId  - Download asset`);
  console.log('');
  console.log('🔗 Test with: curl http://localhost:3001/api/health');
  console.log('🔗 Featured assets: curl http://localhost:3001/api/assets/featured');
  console.log('');
  if (mongoose.connection.readyState !== 1) {
    console.log('⚠️  Running in demo mode (MongoDB not connected)');
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed');
  process.exit(0);
});