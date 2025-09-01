import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { UserSubscription } from '../models/UserSubscription';
import { createError, asyncHandler } from '../middleware/error';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../types';

export interface CreateUserDto {
  email: string;
  password: string;
  name?: string;
  role?: Role;
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
  role?: Role;
  isActive?: boolean;
}

// @desc    Create new user (Admin only)
// @route   POST /api/users
// @access  Private/Admin
export const createUser = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, password, name, role }: CreateUserDto = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(createError('Email already in use', 400));
  }

  // Create user
  const user = await User.create({
    email,
    password,
    name,
    role: role || Role.USER
  });

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: { user }
  });
});

// @desc    Get all users (Admin only)
// @route   GET /api/users
// @access  Private/Admin
export const getUsers = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const includeInactive = req.query.includeInactive === 'true';
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;

  const filter: any = includeInactive ? {} : { isActive: true };

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers: total,
        hasNextPage,
        hasPrevPage,
        limit
      }
    }
  });
});

// @desc    Search users (Admin only)
// @route   GET /api/users/search
// @access  Private/Admin
export const searchUsers = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const query = req.query.q as string;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  if (!query || query.trim().length < 2) {
    return next(createError('Search query must be at least 2 characters long', 400));
  }

  const searchFilter = {
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { email: { $regex: query, $options: 'i' } }
    ]
  };

  const [users, total] = await Promise.all([
    User.find(searchFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(searchFilter)
  ]);

  const totalPages = Math.ceil(total / limit);

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers: total,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit
      },
      searchQuery: query
    }
  });
});

// @desc    Get user statistics (Admin only)
// @route   GET /api/users/stats
// @access  Private/Admin
export const getUserStats = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const [
    totalUsers,
    activeUsers,
    adminUsers,
    usersThisMonth,
    usersWithSubscriptions
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ role: Role.ADMIN }),
    User.countDocuments({
      createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
    }),
    UserSubscription.distinct('userId', { isActive: true }).then(userIds => userIds.length)
  ]);

  res.json({
    success: true,
    data: {
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      adminUsers,
      regularUsers: totalUsers - adminUsers,
      usersThisMonth,
      usersWithSubscriptions
    }
  });
});

// @desc    Get users with subscriptions (Admin only)
// @route   GET /api/users/subscriptions
// @access  Private/Admin
export const getUsersWithSubscriptions = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const usersWithSubs = await UserSubscription.find({ isActive: true })
    .populate('userId', 'name email role createdAt')
    .populate('planId', 'name basePrice billingCycle dailyDownloadLimit')
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: { usersWithSubscriptions: usersWithSubs }
  });
});

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
export const getProfile = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.user._id;

  const user = await User.findById(userId).lean();
  if (!user) {
    return next(createError('User not found', 404));
  }

  // Get user's active subscription
  const activeSubscription = await UserSubscription.findOne({
    userId,
    isActive: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() }
  }).populate('planId').lean();

  res.json({
    success: true,
    data: {
      user,
      activeSubscription
    }
  });
});

// @desc    Get user by ID (Admin only)
// @route   GET /api/users/:id
// @access  Private/Admin
export const getUserById = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const user = await User.findById(req.params.id).lean();
  
  if (!user) {
    return next(createError('User not found', 404));
  }

  // Get user's subscriptions
  const subscriptions = await UserSubscription.find({ userId: req.params.id })
    .populate('planId')
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: {
      user,
      subscriptions
    }
  });
});

// @desc    Update user profile
// @route   PATCH /api/users/profile
// @access  Private
export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.user._id;
  const { name, email }: UpdateUserDto = req.body;

  // Check if email is already in use by another user
  if (email) {
    const existingUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingUser) {
      return next(createError('Email already in use', 400));
    }
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $set: { name, email } },
    { new: true, runValidators: true }
  ).lean();

  if (!updatedUser) {
    return next(createError('User not found', 404));
  }

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: { user: updatedUser }
  });
});

// @desc    Update user (Admin only)
// @route   PATCH /api/users/:id
// @access  Private/Admin
export const updateUser = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { name, email, role, isActive }: UpdateUserDto = req.body;
  const targetUserId = req.params.id;
  const currentUserId = req.user._id.toString();

  // Prevent admin from deactivating themselves
  if (targetUserId === currentUserId && isActive === false) {
    return next(createError('Cannot deactivate your own account', 400));
  }

  // Check if email is already in use by another user
  if (email) {
    const existingUser = await User.findOne({ email, _id: { $ne: targetUserId } });
    if (existingUser) {
      return next(createError('Email already in use', 400));
    }
  }

  const updatedUser = await User.findByIdAndUpdate(
    targetUserId,
    { $set: { name, email, role, isActive } },
    { new: true, runValidators: true }
  ).lean();

  if (!updatedUser) {
    return next(createError('User not found', 404));
  }

  res.json({
    success: true,
    message: 'User updated successfully',
    data: { user: updatedUser }
  });
});

// @desc    Deactivate user (Admin only)
// @route   PATCH /api/users/:id/deactivate
// @access  Private/Admin
export const deactivateUser = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const targetUserId = req.params.id;
  const currentUserId = req.user._id.toString();

  // Prevent admin from deactivating themselves
  if (targetUserId === currentUserId) {
    return next(createError('Cannot deactivate your own account', 400));
  }

  const user = await User.findByIdAndUpdate(
    targetUserId,
    { isActive: false },
    { new: true }
  ).lean();

  if (!user) {
    return next(createError('User not found', 404));
  }

  res.json({
    success: true,
    message: 'User deactivated successfully',
    data: { user }
  });
});

// @desc    Activate user (Admin only)
// @route   PATCH /api/users/:id/activate
// @access  Private/Admin
export const activateUser = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: true },
    { new: true }
  ).lean();

  if (!user) {
    return next(createError('User not found', 404));
  }

  res.json({
    success: true,
    message: 'User activated successfully',
    data: { user }
  });
});

// @desc    Change user role (Admin only)
// @route   PATCH /api/users/:id/role
// @access  Private/Admin
export const changeUserRole = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { role } = req.body;

  if (!Object.values(Role).includes(role)) {
    return next(createError('Invalid role', 400));
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { role },
    { new: true }
  ).lean();

  if (!user) {
    return next(createError('User not found', 404));
  }

  res.json({
    success: true,
    message: 'User role updated successfully',
    data: { user }
  });
});

// @desc    Delete user (Admin only)
// @route   DELETE /api/users/:id
// @access  Private/Admin
export const deleteUser = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const targetUserId = req.params.id;
  const currentUserId = req.user._id.toString();

  // Prevent admin from deleting themselves
  if (targetUserId === currentUserId) {
    return next(createError('Cannot delete your own account', 400));
  }

  const user = await User.findByIdAndDelete(targetUserId);

  if (!user) {
    return next(createError('User not found', 404));
  }

  // TODO: Clean up related data (subscriptions, downloads, etc.)
  
  res.json({
    success: true,
    message: 'User deleted successfully',
    data: {}
  });
});