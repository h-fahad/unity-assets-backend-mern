import { Router } from 'express';
import {
  register,
  login,
  verifyEmail,
  resendVerificationEmail,
  requestPasswordReset,
  resetPasswordWithOTP,
  refreshToken,
  logout,
  logoutAll,
  getMe,
  changePassword,
  authLimiter,
  passwordResetLimiter
} from '../controllers/enhancedAuthController';
import { protect } from '../middleware/auth';
import { validateRegister, validateLogin, validatePasswordReset } from '../middleware/validation';

const router = Router();

// Public routes with rate limiting
router.post('/register', authLimiter, validateRegister, register);
router.post('/login', authLimiter, validateLogin, login);
router.get('/verify-email', verifyEmail);
router.post('/resend-verification', authLimiter, resendVerificationEmail);
router.post('/request-password-reset', passwordResetLimiter, requestPasswordReset);
router.post('/reset-password-otp', passwordResetLimiter, validatePasswordReset, resetPasswordWithOTP);
router.post('/refresh-token', refreshToken);

// Protected routes
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
router.post('/logout-all', protect, logoutAll);
router.post('/change-password', protect, changePassword);

export default router;
