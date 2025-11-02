import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { User } from '../models/User';
import { Activity } from '../models/Activity';
import { generateToken, generateRefreshToken, AuthRequest } from '../middleware/auth';
import { createError, asyncHandler } from '../middleware/error';
import { ActivityType } from '../types';
import { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } from '../services/emailService';

// Rate limiting for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password reset attempts per hour
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again later.'
  }
});

// Enhanced registration with email verification
export const register = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, password, name } = req.body;

  // Validate input
  if (!email || !password) {
    return next(createError('Email and password are required', 400));
  }

  // Validate password strength
  if (password.length < 8) {
    return next(createError('Password must be at least 8 characters long', 400));
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(password)) {
    return next(createError('Password must contain at least 8 characters with uppercase, lowercase, number and special character', 400));
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(createError('Email already in use', 400));
  }

  try {
    // Create user (password will be hashed and validated by pre-save middleware)
    const user = await User.create({
      email,
      password,
      name,
      role: 'USER',
      isEmailVerified: false
    });

    // Generate email verification token
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Continue with registration even if email fails
    }

    // Log user registration activity
    await Activity.create({
      type: ActivityType.USER_REGISTERED,
      message: `New user registered: ${email}`,
      userId: user._id.toString()
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email to verify your account.',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          isActive: user.isActive,
          isEmailVerified: user.isEmailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      }
    });
  } catch (error: any) {
    if (error.message.includes('Password must contain')) {
      return next(createError(error.message, 400));
    }
    throw error;
  }
});

// Enhanced login with account locking
export const login = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body;
  const deviceInfo = req.get('User-Agent') || 'Unknown Device';

  if (!email || !password) {
    return next(createError('Email and password are required', 400));
  }

  // Find user and include password for comparison
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    return next(createError('Invalid credentials', 401));
  }

  // Check if account is locked
  if (user.isLocked) {
    return next(createError('Account is temporarily locked due to too many failed login attempts', 423));
  }

  // Check if user is active
  if (!user.isActive) {
    return next(createError('Account is deactivated', 401));
  }

  // Check if email is verified
  if (!user.isEmailVerified) {
    return next(createError('Please verify your email before logging in. Check your inbox for the verification link.', 403));
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    await user.incrementLoginAttempts();
    return next(createError('Invalid credentials', 401));
  }

  // Reset login attempts on successful login
  await user.resetLoginAttempts();

  // Generate tokens with current token version
  const accessToken = generateToken(user._id.toString(), user.tokenVersion);
  const refreshToken = generateRefreshToken(user._id.toString(), user.tokenVersion);

  // Store refresh token
  user.addRefreshToken(refreshToken, deviceInfo);
  await user.save();

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    }
  });
});

// Email verification
export const verifyEmail = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { token, email } = req.query as { token: string; email: string };

  if (!token || !email) {
    return next(createError('Token and email are required', 400));
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    email,
    emailVerificationToken: hashedToken,
    emailVerificationExpiry: { $gt: new Date() }
  });

  if (!user) {
    return next(createError('Invalid or expired verification token', 400));
  }

  // Verify email
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpiry = undefined;
  await user.save();

  // Send welcome email
  try {
    await sendWelcomeEmail(user.email, user.name);
  } catch (emailError) {
    console.error('Failed to send welcome email:', emailError);
  }

  res.json({
    success: true,
    message: 'Email verified successfully',
    data: {}
  });
});

// Resend verification email
export const resendVerificationEmail = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email } = req.body;

  if (!email) {
    return next(createError('Email is required', 400));
  }

  const user = await User.findOne({ email });
  if (!user) {
    return next(createError('User not found', 404));
  }

  if (user.isEmailVerified) {
    return next(createError('Email is already verified', 400));
  }

  // Generate new verification token
  const verificationToken = user.generateEmailVerificationToken();
  await user.save();

  // Send verification email
  await sendVerificationEmail(email, verificationToken);

  res.json({
    success: true,
    message: 'Verification email sent successfully',
    data: {}
  });
});

// Request password reset with OTP
export const requestPasswordReset = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email } = req.body;

  if (!email) {
    return next(createError('Email is required', 400));
  }

  const user = await User.findOne({ email });

  if (!user) {
    // Don't reveal if user exists or not for security
    return res.json({
      success: true,
      message: 'If the email exists, a reset code has been sent.',
      data: {}
    });
  }

  // Generate OTP
  const otp = user.generatePasswordResetOTP();
  await user.save();

  // Send OTP via email
  try {
    await sendPasswordResetEmail(email, otp);
  } catch (emailError) {
    console.error('Failed to send password reset email:', emailError);
    return next(createError('Failed to send reset email', 500));
  }

  res.json({
    success: true,
    message: 'Password reset code sent to your email',
    data: {}
  });
});

// Verify OTP and reset password
export const resetPasswordWithOTP = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return next(createError('Email, OTP, and new password are required', 400));
  }

  // Validate password strength
  if (newPassword.length < 8) {
    return next(createError('Password must be at least 8 characters long', 400));
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    return next(createError('Password must contain at least 8 characters with uppercase, lowercase, number and special character', 400));
  }

  const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');

  const user = await User.findOne({
    email,
    resetPasswordOTP: hashedOTP,
    resetPasswordOTPExpiry: { $gt: new Date() }
  });

  if (!user) {
    return next(createError('Invalid or expired OTP', 400));
  }

  // Update password (will be hashed by pre-save middleware)
  user.password = newPassword;
  user.resetPasswordOTP = undefined;
  user.resetPasswordOTPExpiry = undefined;

  // Increment token version to invalidate all existing tokens
  user.tokenVersion += 1;

  // Clear all refresh tokens for security
  user.clearAllRefreshTokens();

  await user.save();

  res.json({
    success: true,
    message: 'Password reset successfully',
    data: {}
  });
});

// Refresh token endpoint
export const refreshToken = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return next(createError('Refresh token is required', 400));
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refresh_token, process.env.JWT_SECRET!) as any;
    
    if (decoded.type !== 'refresh') {
      return next(createError('Invalid token type', 401));
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return next(createError('User not found or inactive', 401));
    }

    // Verify token version - invalidate old tokens after password change
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      return next(createError('Token has been invalidated. Please login again.', 401));
    }

    // Check if refresh token exists in user's tokens
    const hashedToken = crypto.createHash('sha256').update(refresh_token).digest('hex');
    const tokenExists = user.refreshTokens.some(rt => rt.token === hashedToken && rt.expiresAt > new Date());

    if (!tokenExists) {
      return next(createError('Invalid or expired refresh token', 401));
    }

    // Generate new access token with current token version
    const newAccessToken = generateToken(user._id.toString(), user.tokenVersion);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        access_token: newAccessToken
      }
    });
  } catch (error) {
    return next(createError('Invalid refresh token', 401));
  }
});

// Logout (invalidate refresh token)
export const logout = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { refresh_token } = req.body;
  const user = req.user;

  if (refresh_token && user) {
    user.removeRefreshToken(refresh_token);
    await user.save();
  }

  res.json({
    success: true,
    message: 'Logged out successfully',
    data: {}
  });
});

// Logout from all devices
export const logoutAll = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const user = req.user;

  if (user) {
    user.clearAllRefreshTokens();
    await user.save();
  }

  res.json({
    success: true,
    message: 'Logged out from all devices successfully',
    data: {}
  });
});

// Get current user profile
export const getMe = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const user = req.user;

  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    }
  });
});

// Change password (authenticated users)
export const changePassword = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { currentPassword, newPassword } = req.body;
  const user = req.user;

  if (!currentPassword || !newPassword) {
    return next(createError('Current password and new password are required', 400));
  }

  // Validate password strength
  if (newPassword.length < 8) {
    return next(createError('Password must be at least 8 characters long', 400));
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    return next(createError('Password must contain at least 8 characters with uppercase, lowercase, number and special character', 400));
  }

  // Get user with password
  const userWithPassword = await User.findById(user._id).select('+password');
  if (!userWithPassword) {
    return next(createError('User not found', 404));
  }

  // Verify current password
  const isCurrentPasswordValid = await userWithPassword.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    return next(createError('Current password is incorrect', 400));
  }

  // Update password
  userWithPassword.password = newPassword;

  // Increment token version to invalidate all existing tokens
  userWithPassword.tokenVersion += 1;

  // Clear all refresh tokens for security
  userWithPassword.clearAllRefreshTokens();

  await userWithPassword.save();

  res.json({
    success: true,
    message: 'Password changed successfully. Please login again.',
    data: {}
  });
});
