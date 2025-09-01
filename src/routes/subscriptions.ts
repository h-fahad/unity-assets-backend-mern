import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/plans', (req, res) => {
  res.json({ success: true, data: { plans: [], message: 'Subscription plans route - TODO: Implement' } });
});

// Protected routes
router.get('/my-subscription', protect, (req, res) => {
  res.json({ success: true, data: { subscription: null, message: 'User subscription route - TODO: Implement' } });
});

// Admin routes
router.post('/plans', protect, adminOnly, (req, res) => {
  res.json({ success: true, data: { message: 'Create subscription plan route - TODO: Implement' } });
});

router.patch('/plans/:id', protect, adminOnly, (req, res) => {
  res.json({ success: true, data: { message: 'Update subscription plan route - TODO: Implement' } });
});

router.post('/assign', protect, adminOnly, (req, res) => {
  res.json({ success: true, data: { message: 'Assign subscription route - TODO: Implement' } });
});

export default router;