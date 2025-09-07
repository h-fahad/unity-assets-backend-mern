import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { User } from '../models/User';
import { Activity } from '../models/Activity';
import { generateToken, generateRefreshToken } from '../middleware/auth';
import { createError, asyncHandler } from '../middleware/error';
import { ActivityType } from '../types';

export interface RegisterDto {
  email: string;
  password: string;
  name?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface RequestResetDto {
  email: string;
}

export interface ResetPasswordDto {
  email: string;
  resetToken: string;
  newPassword: string;
}

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, password, name }: RegisterDto = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(createError('Email already in use', 400));
  }

  // Create user (password will be hashed by pre-save middleware)
  const user = await User.create({
    email,
    password,
    name,
    role: 'USER' // Always create as USER, admins are created via seeding
  });

  // Log user registration activity
  await Activity.create({
    type: ActivityType.USER_REGISTERED,
    message: `New user registered: ${email}`,
    userId: user._id.toString()
  });

  // Generate token
  const token = generateToken(user._id.toString());

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      access_token: token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    }
  });
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, password }: LoginDto = req.body;

  // Find user and include password for comparison
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    return next(createError('Invalid credentials', 401));
  }

  // Check password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    return next(createError('Invalid credentials', 401));
  }

  // Check if user is active
  if (!user.isActive) {
    return next(createError('Account is deactivated', 401));
  }

  // Generate token
  const token = generateToken(user._id.toString());

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      access_token: token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    }
  });
});

// @desc    Request password reset
// @route   POST /api/auth/request-reset
// @access  Public
export const requestPasswordReset = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email }: RequestResetDto = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    // Don't reveal if user exists or not for security
    return res.json({
      success: true,
      message: 'If the email exists, a reset link has been sent.',
      data: { resetToken: '' }
    });
  }

  // Generate reset token
  const resetToken = user.generatePasswordResetToken();
  await user.save();

  // In a real application, you would send this token via email
  // For now, we'll return it directly (only for development)
  res.json({
    success: true,
    message: 'Password reset token generated successfully.',
    data: { resetToken }
  });
});

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
export const resetPassword = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, resetToken, newPassword }: ResetPasswordDto = req.body;

  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  
  const user = await User.findOne({
    email,
    resetPasswordToken: hashedToken,
    resetPasswordExpiry: { $gt: new Date() }
  });

  if (!user) {
    return next(createError('Invalid or expired reset token', 401));
  }

  // Update password (will be hashed by pre-save middleware)
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpiry = undefined;
  await user.save();

  res.json({
    success: true,
    message: 'Password reset successfully',
    data: {}
  });
});

// @desc    Validate reset token
// @route   GET /api/auth/validate-reset-token
// @access  Public
export const validateResetToken = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, token } = req.query as { email: string; token: string };

  if (!email || !token) {
    return next(createError('Email and token are required', 400));
  }

  const user = await User.findOne({
    email,
    resetToken: token,
    resetTokenExpiry: { $gt: new Date() }
  });

  res.json({
    success: true,
    data: { isValid: !!user }
  });
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
export const getMe = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
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
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    }
  });
});