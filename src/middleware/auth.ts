import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { createError, asyncHandler } from './error';
import { Role } from '../types';

export interface AuthRequest extends Request {
  user?: any;
}

// Generate JWT Access Token
export const generateToken = (userId: string, tokenVersion: number = 0): string => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return jwt.sign({ userId, tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: '15m' // Short-lived access token
  });
};

// Generate JWT Refresh Token
export const generateRefreshToken = (userId: string, tokenVersion: number = 0): string => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return jwt.sign({ userId, tokenVersion, type: 'refresh' }, process.env.JWT_SECRET, {
    expiresIn: '30d' // Long-lived refresh token
  });
};

// Verify JWT Token
export const verifyToken = (token: string): any => {
  return jwt.verify(token, process.env.JWT_SECRET!);
};

// Protect routes - require authentication
export const protect = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  let token: string | undefined;

  // Check for token in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(createError('Not authorized to access this route', 401));
  }

  try {
    // Verify token
    const decoded = verifyToken(token) as { userId: string; tokenVersion?: number };

    // Find user by ID
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return next(createError('No user found with this ID', 404));
    }

    if (!user.isActive) {
      return next(createError('User account is deactivated', 401));
    }

    // Verify token version - invalidate old tokens after password change
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      return next(createError('Token has been invalidated. Please login again.', 401));
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    return next(createError('Not authorized to access this route', 401));
  }
});

// Authorize roles
export const authorize = (...roles: Role[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(createError('User not found', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(createError(`Role '${req.user.role}' is not authorized to access this route`, 403));
    }

    next();
  };
};

// Optional auth - attach user if token is present but don't require it
export const optionalAuth = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  let token: string | undefined;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = verifyToken(token) as { userId: string };
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
      }
    } catch (error) {
      // Ignore token errors for optional auth
    }
  }

  next();
});

// Admin only middleware
export const adminOnly = authorize(Role.ADMIN);

// Check subscription status
export const checkSubscription = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(createError('Authentication required', 401));
  }

  // Admin users bypass subscription checks
  if (req.user.role === Role.ADMIN) {
    return next();
  }

  // Import UserSubscription here to avoid circular dependency
  const { UserSubscription } = await import('../models/UserSubscription');
  
  const activeSubscription = await UserSubscription.findOne({
    userId: req.user._id,
    isActive: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() }
  }).populate('planId');

  if (!activeSubscription) {
    return next(createError('Active subscription required', 403));
  }

  req.user.activeSubscription = activeSubscription;
  next();
});

// Check daily download limit
export const checkDownloadLimit = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(createError('Authentication required', 401));
  }

  // Admin users bypass download limits
  if (req.user.role === Role.ADMIN) {
    return next();
  }

  if (!req.user.activeSubscription) {
    return next(createError('Active subscription required', 403));
  }

  // Import Download here to avoid circular dependency
  const { Download } = await import('../models/Download');
  
  const today = new Date();
  const dailyDownloads = await Download.getDailyDownloadCount(req.user._id, today);
  const limit = req.user.activeSubscription.planId.dailyDownloadLimit;

  if (dailyDownloads >= limit) {
    return next(createError(`Daily download limit of ${limit} reached. Please try again tomorrow.`, 429));
  }

  req.user.todayDownloads = dailyDownloads;
  next();
});