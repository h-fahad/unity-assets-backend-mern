const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

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

app.use(cors(corsOptions));

// Basic middleware
app.use(express.json());

// Single health check route
app.get('/', function(req, res) {
  res.json({ 
    status: 'OK', 
    message: 'Unity Assets MERN Backend is running!',
    timestamp: new Date().toISOString(),
    service: 'Unity Assets MERN Backend',
    version: '1.0.0'
  });
});

// API health check
app.get('/api/health', function(req, res) {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Unity Assets MERN Backend'
  });
});

// CORS test endpoint
app.get('/api/cors-test', function(req, res) {
  res.json({
    message: 'CORS is working!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

// Preflight OPTIONS handler for all routes
app.options('*', function(req, res) {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Logging middleware for debugging
app.use(function(req, res, next) {
  console.log('Request:', req.method, req.url, 'Origin:', req.headers.origin);
  next();
});

// Start server
app.listen(PORT, function() {
  console.log('🚀 Server running on port ' + PORT);
  console.log('📊 Environment: ' + (process.env.NODE_ENV || 'development'));
  console.log('🔗 API Base URL: http://localhost:' + PORT + '/api');
  console.log('🔐 CORS Origins: https://unity-assets-frontend.vercel.app, localhost:3000');
});

module.exports = app;