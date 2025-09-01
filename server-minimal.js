const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

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

// Start server
app.listen(PORT, function() {
  console.log('🚀 Server running on port ' + PORT);
  console.log('📊 Environment: ' + (process.env.NODE_ENV || 'development'));
  console.log('🔗 API Base URL: http://localhost:' + PORT + '/api');
});

module.exports = app;