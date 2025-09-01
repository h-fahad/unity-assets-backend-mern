import { Router } from 'express';
import { protect } from '../middleware/auth';

const router = Router();

// Protected routes
router.post('/create-checkout-session', protect, (req, res) => {
  res.json({ success: true, data: { message: 'Create checkout session route - TODO: Implement' } });
});

router.post('/webhook', (req, res) => {
  res.json({ success: true, data: { message: 'Stripe webhook route - TODO: Implement' } });
});

export default router;