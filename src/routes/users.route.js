const express = require('express');
const mongoose = require('mongoose');
const { extractUserIdFromToken } = require('../middleware/auth');
const { User, Download, Asset, UserSubscription } = require('../models/index');

const router = express.Router();

// ==================== USER ROUTES ====================

// GET /api/users/profile
router.get('/profile', async (req, res) => {
  try {
    const userId = req.headers['user-id'] || extractUserIdFromToken(req.headers['authorization']);

    if (!userId || userId === 'public' || userId === 'anonymous') {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not available'
      });
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/users - List users with pagination and filters
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      role = '',
      status = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    if (mongoose.connection.readyState === 1) {
      // Build query
      let query = {};

      // Search by name or email
      if (search && search.trim()) {
        query.$or = [
          { name: { $regex: search.trim(), $options: 'i' } },
          { email: { $regex: search.trim(), $options: 'i' } }
        ];
      }

      // Filter by role
      if (role && role !== 'all') {
        query.role = role.toUpperCase();
      }

      // Filter by status
      if (status && status !== 'all') {
        query.isActive = status === 'active';
      }

      // Sort options
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

      const [users, totalUsers] = await Promise.all([
        User.find(query)
          .select('-password')
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        User.countDocuments(query)
      ]);

      // Add download and asset counts, plus subscription info
      const usersWithCounts = await Promise.all(
        users.map(async (user) => {
          const [downloadCount, assetCount, activeSubscription] = await Promise.all([
            Download.countDocuments({ userId: user._id }),
            Asset.countDocuments({ createdBy: user._id }),
            UserSubscription.findOne({
              userId: user._id,
              isActive: true,
              endDate: { $gte: new Date() } // Check if subscription is still valid
            }).populate('planId', 'name basePrice billingCycle dailyDownloadLimit')
          ]);

          let subscriptionData = null;
          if (activeSubscription && activeSubscription.planId) {
            subscriptionData = {
              _id: activeSubscription._id,
              planName: activeSubscription.planId.name,
              planPrice: activeSubscription.planId.basePrice,
              billingCycle: activeSubscription.planId.billingCycle,
              dailyDownloadLimit: activeSubscription.planId.dailyDownloadLimit,
              startDate: activeSubscription.startDate,
              endDate: activeSubscription.endDate,
              isActive: activeSubscription.isActive
            };
          }

          return {
            ...user,
            _count: {
              downloads: downloadCount,
              assets: assetCount
            },
            subscription: subscriptionData
          };
        })
      );

      const totalPages = Math.ceil(totalUsers / limitNum);

      res.json({
        success: true,
        data: {
          users: usersWithCounts,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalUsers,
            hasNextPage: pageNum < totalPages,
            hasPrevPage: pageNum > 1,
            limit: limitNum
          }
        }
      });
    } else {
      // Demo mode - apply search and pagination to sample data
      let demoUsers = [
        {
          _id: 'demo1',
          name: 'John Doe',
          email: 'john@example.com',
          role: 'USER',
          isActive: true,
          createdAt: '2024-01-15T10:30:00Z',
          updatedAt: '2024-01-15T10:30:00Z',
          _count: { downloads: 25, assets: 5 }
        },
        {
          _id: 'demo2',
          name: 'Jane Smith',
          email: 'jane@example.com',
          role: 'ADMIN',
          isActive: true,
          createdAt: '2024-02-20T14:45:00Z',
          updatedAt: '2024-02-20T14:45:00Z',
          _count: { downloads: 50, assets: 12 }
        },
        {
          _id: 'demo3',
          name: 'Mike Johnson',
          email: 'mike@example.com',
          role: 'USER',
          isActive: false,
          createdAt: '2024-03-10T09:15:00Z',
          updatedAt: '2024-03-10T09:15:00Z',
          _count: { downloads: 10, assets: 2 }
        }
      ];

      // Apply search filter
      if (search && search.trim()) {
        const searchTerm = search.trim().toLowerCase();
        demoUsers = demoUsers.filter(user =>
          user.name.toLowerCase().includes(searchTerm) ||
          user.email.toLowerCase().includes(searchTerm)
        );
      }

      // Apply role filter
      if (role && role !== 'all') {
        demoUsers = demoUsers.filter(user => user.role === role.toUpperCase());
      }

      // Apply status filter
      if (status && status !== 'all') {
        const isActive = status === 'active';
        demoUsers = demoUsers.filter(user => user.isActive === isActive);
      }

      const totalUsers = demoUsers.length;
      const totalPages = Math.ceil(totalUsers / limitNum);
      const paginatedUsers = demoUsers.slice(skip, skip + limitNum);

      res.json({
        success: true,
        data: {
          users: paginatedUsers,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalUsers,
            hasNextPage: pageNum < totalPages,
            hasPrevPage: pageNum > 1,
            limit: limitNum
          }
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/users/stats - User statistics
router.get('/stats', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const totalUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({ isActive: true });
      const inactiveUsers = await User.countDocuments({ isActive: false });
      const adminUsers = await User.countDocuments({ role: 'ADMIN' });

      // Count users with active subscriptions, excluding admins
      const usersWithActiveSubscriptions = await UserSubscription.distinct('userId', {
        isActive: true,
        endDate: { $gte: new Date() } // Make sure subscription hasn't expired
      });

      // Filter out admin users from the subscription count
      const nonAdminUsersWithSubscriptions = await User.countDocuments({
        _id: { $in: usersWithActiveSubscriptions },
        role: { $ne: 'ADMIN' } // Exclude admins
      });

      res.json({
        success: true,
        data: {
          total: totalUsers,
          active: activeUsers,
          inactive: inactiveUsers,
          admins: adminUsers,
          withActiveSubscriptions: nonAdminUsersWithSubscriptions
        }
      });
    } else {
      // Demo mode
      res.json({
        success: true,
        data: {
          total: 1,
          active: 1,
          inactive: 0,
          admins: 0,
          withActiveSubscriptions: 0
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user stats',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/users - Create user
router.post('/', async (req, res) => {
  try {
    const { name, email, password, role = 'USER' } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (mongoose.connection.readyState === 1) {
      // Check if user exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }

      // Create user
      const user = await User.create({
        name,
        email,
        password, // In production: hash with bcrypt
        role,
        isActive: true
      });

      const userObj = user.toObject();
      delete userObj.password;

      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: { user: userObj }
      });
    } else {
      // Demo mode
      res.status(201).json({
        success: true,
        message: 'User created successfully (demo mode)',
        data: {
          user: {
            _id: Date.now().toString(),
            name,
            email,
            role,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      });
    }
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, role } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    if (mongoose.connection.readyState === 1) {
      // Check if email is already in use by another user
      const existingUser = await User.findOne({
        email,
        _id: { $ne: userId }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use by another user'
        });
      }

      // Update user
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          name,
          email,
          role,
          updatedAt: new Date()
        },
        { new: true, runValidators: true }
      ).select('-password');

      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        message: 'User updated successfully',
        data: { user: updatedUser }
      });
    } else {
      // Demo mode
      res.json({
        success: true,
        message: 'User updated successfully (demo mode)',
        data: {
          user: {
            _id: userId,
            name,
            email,
            role,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      });
    }
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// DELETE /api/users/:id - Delete user
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    if (mongoose.connection.readyState === 1) {
      const deletedUser = await User.findByIdAndDelete(userId);

      if (!deletedUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } else {
      // Demo mode
      res.json({
        success: true,
        message: 'User deleted successfully (demo mode)'
      });
    }
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// PATCH /api/users/:id/role - Change user role
router.patch('/:id/role', async (req, res) => {
  try {
    const userId = req.params.id;
    const { role } = req.body;

    if (!role || !['USER', 'ADMIN'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Valid role (USER or ADMIN) is required'
      });
    }

    if (mongoose.connection.readyState === 1) {
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { role, updatedAt: new Date() },
        { new: true, runValidators: true }
      ).select('-password');

      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        message: `User role changed to ${role} successfully`,
        data: { user: updatedUser }
      });
    } else {
      // Demo mode
      res.json({
        success: true,
        message: `User role changed to ${role} successfully (demo mode)`,
        data: {
          user: {
            _id: userId,
            role,
            updatedAt: new Date().toISOString()
          }
        }
      });
    }
  } catch (error) {
    console.error('Change role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change user role',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// PATCH /api/users/:id/status - Toggle user status
router.patch('/:id/status', async (req, res) => {
  try {
    const userId = req.params.id;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive boolean value is required'
      });
    }

    if (mongoose.connection.readyState === 1) {
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { isActive, updatedAt: new Date() },
        { new: true, runValidators: true }
      ).select('-password');

      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: { user: updatedUser }
      });
    } else {
      // Demo mode
      res.json({
        success: true,
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully (demo mode)`,
        data: {
          user: {
            _id: userId,
            isActive,
            updatedAt: new Date().toISOString()
          }
        }
      });
    }
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;
