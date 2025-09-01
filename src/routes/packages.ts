import { Router, Request, Response } from 'express';
import { protect, adminOnly } from '../middleware/auth';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { body, validationResult } from 'express-validator';
import { BillingCycle } from '../types';

const router = Router();

// Get all packages (subscription plans)
router.get('/', async (req: Request, res: Response) => {
  try {
    const packages = await SubscriptionPlan.find({}).sort({ basePrice: 1 });
    
    // Transform to match frontend expected format
    const transformedPackages = packages.map(pkg => ({
      id: pkg._id,
      name: pkg.name,
      description: pkg.description,
      basePrice: pkg.basePrice,
      billingCycle: pkg.billingCycle,
      yearlyDiscount: pkg.yearlyDiscount,
      dailyDownloadLimit: pkg.dailyDownloadLimit,
      features: pkg.features,
      isActive: pkg.isActive,
      price: pkg.basePrice, // For compatibility
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt
    }));

    res.json({
      success: true,
      data: transformedPackages
    });
  } catch (error: any) {
    console.error('Error fetching packages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch packages',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get active packages only
router.get('/active', async (req: Request, res: Response) => {
  try {
    const packages = await SubscriptionPlan.find({ isActive: true }).sort({ basePrice: 1 });
    
    // Transform to match frontend expected format
    const transformedPackages = packages.map(pkg => ({
      id: pkg._id,
      name: pkg.name,
      description: pkg.description,
      basePrice: pkg.basePrice,
      billingCycle: pkg.billingCycle,
      yearlyDiscount: pkg.yearlyDiscount,
      dailyDownloadLimit: pkg.dailyDownloadLimit,
      features: pkg.features,
      isActive: pkg.isActive,
      price: pkg.basePrice, // For compatibility
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt
    }));

    res.json({
      success: true,
      data: transformedPackages
    });
  } catch (error: any) {
    console.error('Error fetching active packages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active packages',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get single package by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pkg = await SubscriptionPlan.findById(id);
    
    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    // Transform to match frontend expected format
    const transformedPackage = {
      id: pkg._id,
      name: pkg.name,
      description: pkg.description,
      basePrice: pkg.basePrice,
      billingCycle: pkg.billingCycle,
      yearlyDiscount: pkg.yearlyDiscount,
      dailyDownloadLimit: pkg.dailyDownloadLimit,
      features: pkg.features,
      isActive: pkg.isActive,
      price: pkg.basePrice,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt
    };

    res.json({
      success: true,
      data: transformedPackage
    });
  } catch (error: any) {
    console.error('Error fetching package:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch package',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Admin routes for package management

// Create new package (Admin only)
router.post('/', 
  protect,
  adminOnly,
  [
    body('name').notEmpty().withMessage('Package name is required'),
    body('basePrice').isFloat({ min: 0 }).withMessage('Base price must be a positive number'),
    body('dailyDownloadLimit').isInt({ min: 0 }).withMessage('Daily download limit must be a non-negative integer'),
    body('features').isArray({ min: 1 }).withMessage('At least one feature is required')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const packageData = req.body;
      const newPackage = new SubscriptionPlan(packageData);
      await newPackage.save();

      // Transform response
      const transformedPackage = {
        id: newPackage._id,
        name: newPackage.name,
        description: newPackage.description,
        basePrice: newPackage.basePrice,
        billingCycle: newPackage.billingCycle,
        yearlyDiscount: newPackage.yearlyDiscount,
        dailyDownloadLimit: newPackage.dailyDownloadLimit,
        features: newPackage.features,
        isActive: newPackage.isActive,
        price: newPackage.basePrice,
        createdAt: newPackage.createdAt,
        updatedAt: newPackage.updatedAt
      };

      res.status(201).json({
        success: true,
        data: transformedPackage,
        message: 'Package created successfully'
      });
    } catch (error: any) {
      console.error('Error creating package:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create package',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Update package (Admin only)
router.patch('/:id',
  protect,
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const updatedPackage = await SubscriptionPlan.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!updatedPackage) {
        return res.status(404).json({
          success: false,
          message: 'Package not found'
        });
      }

      // Transform response
      const transformedPackage = {
        id: updatedPackage._id,
        name: updatedPackage.name,
        description: updatedPackage.description,
        basePrice: updatedPackage.basePrice,
        billingCycle: updatedPackage.billingCycle,
        yearlyDiscount: updatedPackage.yearlyDiscount,
        dailyDownloadLimit: updatedPackage.dailyDownloadLimit,
        features: updatedPackage.features,
        isActive: updatedPackage.isActive,
        price: updatedPackage.basePrice,
        createdAt: updatedPackage.createdAt,
        updatedAt: updatedPackage.updatedAt
      };

      res.json({
        success: true,
        data: transformedPackage,
        message: 'Package updated successfully'
      });
    } catch (error: any) {
      console.error('Error updating package:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update package',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Toggle package status (Admin only)
router.patch('/:id/toggle-status',
  protect,
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const pkg = await SubscriptionPlan.findById(id);
      if (!pkg) {
        return res.status(404).json({
          success: false,
          message: 'Package not found'
        });
      }

      pkg.isActive = !pkg.isActive;
      await pkg.save();

      // Transform response
      const transformedPackage = {
        id: pkg._id,
        name: pkg.name,
        description: pkg.description,
        basePrice: pkg.basePrice,
        billingCycle: pkg.billingCycle,
        yearlyDiscount: pkg.yearlyDiscount,
        dailyDownloadLimit: pkg.dailyDownloadLimit,
        features: pkg.features,
        isActive: pkg.isActive,
        price: pkg.basePrice,
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt
      };

      res.json({
        success: true,
        data: transformedPackage,
        message: `Package ${pkg.isActive ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error: any) {
      console.error('Error toggling package status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to toggle package status',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Delete package (Admin only)
router.delete('/:id',
  protect,
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const deletedPackage = await SubscriptionPlan.findByIdAndDelete(id);
      if (!deletedPackage) {
        return res.status(404).json({
          success: false,
          message: 'Package not found'
        });
      }

      res.json({
        success: true,
        message: 'Package deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting package:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete package',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

export default router;