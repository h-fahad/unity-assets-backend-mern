import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth';
import { Category } from '../models/Category';
import { createError } from '../middleware/error';

const router = Router();

// Public routes
router.get('/', async (req, res, next) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    res.json(categories);
  } catch (error) {
    next(error);
  }
});

router.get('/active', async (req, res, next) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ createdAt: -1 });
    res.json(categories);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return next(createError('Category not found', 404));
    }
    res.json(category);
  } catch (error) {
    next(error);
  }
});

// Protected admin routes
router.post('/', protect, adminOnly, (req, res) => {
  res.json({ success: true, data: { message: 'Create category route - TODO: Implement' } });
});

router.patch('/:id', protect, adminOnly, (req, res) => {
  res.json({ success: true, data: { message: 'Update category route - TODO: Implement' } });
});

router.delete('/:id', protect, adminOnly, (req, res) => {
  res.json({ success: true, data: { message: 'Delete category route - TODO: Implement' } });
});

export default router;