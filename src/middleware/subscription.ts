import { Request, Response, NextFunction } from 'express';
import { webhookService } from '../services/webhookService';
import { downloadService } from '../services/downloadService';
import { Role } from '../types';

interface AuthenticatedRequest extends Request {
  user: {
    _id: string;
    email: string;
    role: Role;
    [key: string]: any;
  };
}

/**
 * Middleware to check if user has an active subscription
 * Admins bypass this check
 */
export const requireActiveSubscription = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // Admin users bypass subscription checks
    if (user.role === Role.ADMIN) {
      return next();
    }

    // Check if user has active subscription
    const hasActiveSubscription = await webhookService.hasActiveSubscription(user._id);
    
    if (!hasActiveSubscription) {
      res.status(403).json({
        success: false,
        message: 'Active subscription required to access this resource'
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify subscription status'
    });
  }
};

/**
 * Middleware to check download limits
 * Used for download-related endpoints
 */
export const checkDownloadLimits = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // Check download permissions with admin bypass
    const downloadCheck = await downloadService.canUserDownloadWithAdminBypass(user._id);
    
    if (!downloadCheck.canDownload && !downloadCheck.isAdmin) {
      const statusCode = downloadCheck.reason?.includes('limit') ? 429 : 403;
      res.status(statusCode).json({
        success: false,
        message: downloadCheck.reason || 'Download not allowed',
        data: {
          isAdmin: downloadCheck.isAdmin,
          dailyDownloads: downloadCheck.dailyDownloads,
          dailyLimit: downloadCheck.dailyLimit,
          subscription: downloadCheck.subscription
        }
      });
      return;
    }

    // Add download info to request for use in route handler
    (req as any).downloadInfo = downloadCheck;
    next();
    
  } catch (error) {
    console.error('Download limit check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify download limits'
    });
  }
};

/**
 * Middleware to add subscription info to request
 * For informational purposes (doesn't block)
 */
export const addSubscriptionInfo = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;
    
    if (user) {
      // Get user's subscription info
      const subscription = await webhookService.getActiveUserSubscription(user._id);
      (req as any).subscriptionInfo = {
        hasActiveSubscription: !!subscription,
        subscription,
        isAdmin: user.role === Role.ADMIN
      };
    }

    next();
  } catch (error) {
    console.error('Subscription info middleware error:', error);
    // Don't block the request, just continue without subscription info
    next();
  }
};

/**
 * Middleware to check if user can perform premium actions
 * Used for premium features
 */
export const requirePremiumAccess = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // Admin users have premium access
    if (user.role === Role.ADMIN) {
      return next();
    }

    // Check if user has active subscription
    const subscription = await webhookService.getActiveUserSubscription(user._id);
    
    if (!subscription) {
      res.status(403).json({
        success: false,
        message: 'Premium subscription required for this feature'
      });
      return;
    }

    // Add subscription info to request
    (req as any).subscription = subscription;
    next();
    
  } catch (error) {
    console.error('Premium access check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify premium access'
    });
  }
};

/**
 * Middleware to check specific subscription plan requirements
 */
export const requirePlanLevel = (requiredPlan: 'basic' | 'pro' | 'enterprise') => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = req.user;
      
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      // Admin users bypass plan level checks
      if (user.role === Role.ADMIN) {
        return next();
      }

      // Get user's subscription
      const subscription = await webhookService.getActiveUserSubscription(user._id);
      
      if (!subscription) {
        res.status(403).json({
          success: false,
          message: 'Active subscription required'
        });
        return;
      }

      // Check plan level (simplified - you might want to implement proper plan hierarchy)
      const planHierarchy = { basic: 1, pro: 2, enterprise: 3 };
      const userPlanName = (subscription as any).planId?.name?.toLowerCase() || 'basic';
      const userPlanLevel = planHierarchy[userPlanName as keyof typeof planHierarchy] || 1;
      const requiredPlanLevel = planHierarchy[requiredPlan];

      if (userPlanLevel < requiredPlanLevel) {
        res.status(403).json({
          success: false,
          message: `${requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)} plan or higher required for this feature`
        });
        return;
      }

      next();
      
    } catch (error) {
      console.error('Plan level check error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify plan level'
      });
    }
  };
};