import { Router } from 'express';
import { protect, adminOnly, optionalAuth } from '../middleware/auth';
import { uploadAssetFiles, getFileUrl } from '../middleware/upload';
import { Asset } from '../models/Asset';
import { Category } from '../models/Category';
import { createError } from '../middleware/error';

const router = Router();

// Public routes
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const category = req.query.category as string;
    const status = req.query.status as string;
    const sortBy = req.query.sortBy as string || 'createdAt';
    const sortOrder = req.query.sortOrder as string || 'desc';

    // Build filter query
    const filter: any = {};
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    if (category && category !== 'all') {
      filter.categoryId = category;
    }

    if (status && status !== 'all') {
      filter.isActive = status === 'active';
    }

    // Build sort query
    const sort: any = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate skip
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalAssets = await Asset.countDocuments(filter);
    const totalPages = Math.ceil(totalAssets / limit);

    // Get assets with pagination
    const assets = await Asset.find(filter)
      .populate('categoryId', 'name slug')
      .populate('uploadedById', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    res.json({
      assets,
      pagination: {
        page,
        currentPage: page,
        totalPages,
        totalAssets,
        total: totalAssets,
        limit,
        pages: totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stats', optionalAuth, async (req, res, next) => {
  try {
    const total = await Asset.countDocuments();
    const active = await Asset.countDocuments({ isActive: true });
    const inactive = await Asset.countDocuments({ isActive: false });
    
    // Calculate total downloads
    const downloadStats = await Asset.aggregate([
      { $group: { _id: null, totalDownloads: { $sum: '$downloadCount' } } }
    ]);
    
    res.json({
      total,
      active,
      inactive,
      totalDownloads: downloadStats[0]?.totalDownloads || 0
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const asset = await Asset.findById(req.params.id)
      .populate('categoryId', 'name slug')
      .populate('uploadedById', 'name email');
    
    if (!asset) {
      return next(createError('Asset not found', 404));
    }
    
    res.json(asset);
  } catch (error) {
    next(error);
  }
});

// Protected routes
router.post('/', protect, adminOnly, uploadAssetFiles, async (req, res, next) => {
  try {
    const { name, description, categoryId, tags } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    // Validation
    if (!name || !description || !categoryId) {
      return next(createError('Name, description, and category are required', 400));
    }

    // Check if files are uploaded
    if (!files?.thumbnail?.[0] || !files?.assetFile?.[0]) {
      return next(createError('Both thumbnail and asset file are required', 400));
    }

    // Verify category exists
    const category = await Category.findById(categoryId);
    if (!category) {
      return next(createError('Category not found', 404));
    }

    // Process tags
    let processedTags: string[] = [];
    if (tags) {
      if (Array.isArray(tags)) {
        processedTags = tags.filter(tag => tag && tag.trim()).map(tag => tag.trim());
      } else if (typeof tags === 'string') {
        processedTags = tags.split(',').filter(tag => tag.trim()).map(tag => tag.trim());
      }
    }

    // Get file URLs
    const thumbnailUrl = getFileUrl(files.thumbnail[0]);
    const assetFileUrl = getFileUrl(files.assetFile[0]);

    // Create asset
    const asset = new Asset({
      name: name.trim(),
      description: description.trim(),
      categoryId,
      tags: processedTags,
      thumbnail: thumbnailUrl,
      fileUrl: assetFileUrl,
      uploadedById: req.user!.id,
      isActive: true
    });

    await asset.save();

    res.status(201).json({
      success: true,
      data: {
        asset,
        message: 'Asset created successfully'
      }
    });
  } catch (error: any) {
    if (error.code === 11000 && error.keyPattern?.name) {
      return next(createError('Asset with this name already exists', 409));
    }
    next(error);
  }
});

router.patch('/:id', protect, adminOnly, (req, res) => {
  res.json({ success: true, data: { message: 'Update asset route - TODO: Implement' } });
});

router.delete('/:id', protect, adminOnly, (req, res) => {
  res.json({ success: true, data: { message: 'Delete asset route - TODO: Implement' } });
});

export default router;