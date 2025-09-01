import { Router } from 'express';
import {
  createUser,
  getUsers,
  searchUsers,
  getUserStats,
  getUsersWithSubscriptions,
  getProfile,
  getUserById,
  updateProfile,
  updateUser,
  deactivateUser,
  activateUser,
  changeUserRole,
  deleteUser
} from '../controllers/usersController';
import {
  validateId,
  validatePagination,
  handleValidationErrors
} from '../middleware/validation';
import { protect, adminOnly } from '../middleware/auth';
import { body } from 'express-validator';

const router = Router();

// All routes require authentication
router.use(protect);

// User profile routes (accessible by user themselves)
router.get('/profile', getProfile);
router.patch('/profile', [
  body('name').optional().trim().isLength({ min: 1, max: 100 }),
  body('email').optional().isEmail().normalizeEmail(),
  handleValidationErrors
], updateProfile);

// Admin only routes
router.post('/', adminOnly, [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').optional().trim().isLength({ min: 1, max: 100 }),
  body('role').optional().isIn(['USER', 'ADMIN']),
  handleValidationErrors
], createUser);

router.get('/', adminOnly, validatePagination, getUsers);
router.get('/search', adminOnly, validatePagination, searchUsers);
router.get('/stats', adminOnly, getUserStats);
router.get('/subscriptions', adminOnly, getUsersWithSubscriptions);

// User management routes (admin only)
router.get('/:id', adminOnly, validateId, getUserById);
router.patch('/:id', adminOnly, [
  ...validateId,
  body('name').optional().trim().isLength({ min: 1, max: 100 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('role').optional().isIn(['USER', 'ADMIN']),
  body('isActive').optional().isBoolean(),
  handleValidationErrors
], updateUser);

router.patch('/:id/deactivate', adminOnly, validateId, deactivateUser);
router.patch('/:id/activate', adminOnly, validateId, activateUser);
router.patch('/:id/role', adminOnly, [
  ...validateId,
  body('role').isIn(['USER', 'ADMIN']).withMessage('Role must be USER or ADMIN'),
  handleValidationErrors
], changeUserRole);

router.delete('/:id', adminOnly, validateId, deleteUser);

export default router;