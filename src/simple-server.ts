import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic routes
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true,
    message: 'Unity Assets MERN Backend is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Auth routes placeholder
app.post('/api/auth/login', (req, res) => {
  res.json({
    success: true,
    message: 'Login endpoint - TODO: Implement with MongoDB',
    data: {
      access_token: 'placeholder-token',
      user: { id: 1, email: 'test@example.com', role: 'USER' }
    }
  });
});

app.post('/api/auth/register', (req, res) => {
  res.json({
    success: true,
    message: 'Registration endpoint - TODO: Implement with MongoDB',
    data: {
      access_token: 'placeholder-token',
      user: { id: 1, email: req.body.email, role: 'USER' }
    }
  });
});

// Assets routes placeholder
app.get('/api/assets', (req, res) => {
  res.json({
    success: true,
    message: 'Assets endpoint - TODO: Implement with MongoDB',
    data: {
      assets: [],
      pagination: { currentPage: 1, totalPages: 0, totalAssets: 0 }
    }
  });
});

// Users routes placeholder
app.get('/api/users/profile', (req, res) => {
  res.json({
    success: true,
    message: 'Profile endpoint - TODO: Implement with MongoDB',
    data: {
      user: { id: 1, email: 'test@example.com', role: 'USER' }
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

app.listen(PORT, () => {
  console.log(`🚀 MERN Backend Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
  console.log(`✅ Basic endpoints are ready - MongoDB integration pending`);
});

export default app;