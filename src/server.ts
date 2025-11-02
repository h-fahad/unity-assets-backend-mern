import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import dotenv from 'dotenv';
import path from 'path';

import { connectDB } from './config/database';
import { errorHandler } from './middleware/error';

// Import routes
import authRoutes from './routes/enhancedAuth';
import userRoutes from './routes/users';
import assetRoutes from './routes/assets';
import categoryRoutes from './routes/categories';
import subscriptionRoutes from './routes/subscriptions';
import downloadRoutes from './routes/downloads';
import paymentRoutes from './routes/payments';
import analyticsRoutes from './routes/analytics';
import packageRoutes from './routes/packages';

// Load environment variables
dotenv.config();

// Validate JWT secret strength on startup
if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined in environment variables');
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.error('FATAL ERROR: JWT_SECRET must be at least 32 characters long for security');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Connect to MongoDB
connectDB();

// Security middleware
app.use(helmet());
app.use(compression());
app.use(mongoSanitize()); // Prevent NoSQL injection attacks

// Rate limiting - Strengthened to prevent brute force attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Reduced from 100 to 50 requests per windowMs for better security
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Logging
app.use(morgan('combined'));

// Stripe webhook route MUST be before JSON body parsing
// This route needs raw body for signature verification
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    
    if (!signature) {
      console.error('No stripe-signature header found');
      return res.status(400).send('Missing stripe-signature header');
    }

    const { stripeService } = await import('./services/stripeService');
    const { webhookService } = await import('./services/webhookService');

    // Verify webhook signature and construct event
    const event = stripeService.verifyWebhookSignature(req.body, signature);
    
    console.log(`📨 Received webhook: ${event.type}`);
    
    // Process the webhook event
    await webhookService.handleWebhookEvent(event);
    
    res.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error.message);
    res.status(400).send(`Webhook error: ${error.message}`);
  }
});

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/downloads', downloadRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Unity Assets MERN Backend'
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use(/.*/, (req, res) => {
  res.status(404).json({ 
    success: false, 
    message: `Route ${req.originalUrl} not found` 
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
});

export default app;