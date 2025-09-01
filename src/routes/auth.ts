import { Router } from 'express';
import {
  register,
  login,
  requestPasswordReset,
  resetPassword,
  validateResetToken,
  getMe
} from '../controllers/authController';
import {
  validateUserRegistration,
  validateUserLogin,
  validatePasswordReset,
  validatePasswordResetConfirm,
  handleValidationErrors
} from '../middleware/validation';
import { protect } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/register', validateUserRegistration, register);
router.post('/login', validateUserLogin, login);
router.post('/request-reset', validatePasswordReset, requestPasswordReset);
router.post('/reset-password', validatePasswordResetConfirm, resetPassword);
router.get('/validate-reset-token', validateResetToken);

// Protected routes
router.get('/me', protect, getMe);

export default router;