import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth';

const router = Router();

// Admin only routes
router.get('/dashboard', protect, adminOnly, (req, res) => {
  res.json({ success: true, data: { analytics: {}, message: 'Dashboard analytics route - TODO: Implement' } });
});

router.get('/downloads', protect, adminOnly, (req, res) => {
  res.json({ success: true, data: { downloadStats: {}, message: 'Download analytics route - TODO: Implement' } });
});

router.get('/users', protect, adminOnly, (req, res) => {
  res.json({ success: true, data: { userStats: {}, message: 'User analytics route - TODO: Implement' } });
});

export default router;