require('dotenv').config();
const app = require('./config/app');
const { connectDB } = require('./config/database');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

// Initialize models (must be loaded before routes)
require('./models/index');

// Import route files
const authRoutes = require('./routes/auth.route');
const userRoutes = require('./routes/users.route');
const assetRoutes = require('./routes/assets.route');
const categoryRoutes = require('./routes/categories.route');
const subscriptionRoutes = require('./routes/subscriptions.route');
const paymentRoutes = require('./routes/payments.route');
const downloadRoutes = require('./routes/downloads.route');

const PORT = process.env.PORT || 3001;

// Connect to MongoDB
connectDB();

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    database: require('mongoose').connection.readyState === 1 ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/downloads', downloadRoutes);

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Server is running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📍 API URL: http://localhost:${PORT}/api`);
  console.log(`❤️  Health check: http://localhost:${PORT}/api/health\n`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION! Shutting down...');
  console.error(err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION! Shutting down...');
  console.error(err);
  process.exit(1);
});
