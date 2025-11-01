const express = require('express');
const mongoose = require('mongoose');
const { upload, getFileUrl } = require('../middleware/upload');
const { Asset, Category, Download } = require('../models/index');

const router = express.Router();

// Sample data for demonstration - downloads will be calculated from real database records
const sampleAssets = [
  {
    _id: '507f1f77bcf86cd799439011',
    name: 'Fantasy Character Pack',
    description: 'A complete pack of fantasy characters with animations and textures. Perfect for RPG games.',
    thumbnail: '/placeholder-asset.svg',
    fileUrl: '/fantasy-character-pack.unitypackage',
    downloadCount: 0, // Will be calculated from real download records
    tags: ['characters', 'fantasy', 'rpg', 'animations'],
    categoryId: '507f1f77bcf86cd799439021',
    category: { name: 'Characters', slug: 'characters' },
    uploadedBy: { name: 'Unity Studio', _id: '507f1f77bcf86cd799439051' },
    createdAt: new Date('2024-01-15').toISOString(),
    updatedAt: new Date('2024-01-15').toISOString(),
    isActive: true
  },
  {
    _id: '507f1f77bcf86cd799439012',
    name: 'Sci-Fi Environment Kit',
    description: 'Modular sci-fi environment pieces for creating futuristic scenes and levels.',
    thumbnail: '/placeholder-asset.svg',
    fileUrl: '/scifi-environment-kit.unitypackage',
    downloadCount: 0, // Will be calculated from real download records
    tags: ['environment', 'sci-fi', 'modular', 'textures'],
    categoryId: '507f1f77bcf86cd799439022',
    category: { name: 'Environment', slug: 'environment' },
    uploadedBy: { name: 'Future Games', _id: '507f1f77bcf86cd799439052' },
    createdAt: new Date('2024-02-20').toISOString(),
    updatedAt: new Date('2024-02-20').toISOString(),
    isActive: true
  },
  {
    _id: '507f1f77bcf86cd799439013',
    name: 'Particle Effects Bundle',
    description: 'Collection of stunning particle effects including fire, magic, explosions, and more.',
    thumbnail: '/placeholder-asset.svg',
    fileUrl: '/particle-effects-bundle.unitypackage',
    downloadCount: 0, // Will be calculated from real download records
    tags: ['effects', 'particles', 'vfx', 'magic'],
    categoryId: '507f1f77bcf86cd799439023',
    category: { name: 'Effects', slug: 'effects' },
    uploadedBy: { name: 'VFX Master', _id: '507f1f77bcf86cd799439053' },
    createdAt: new Date('2024-03-10').toISOString(),
    updatedAt: new Date('2024-03-10').toISOString(),
    isActive: true
  },
  {
    _id: '507f1f77bcf86cd799439014',
    name: 'Medieval Props Collection',
    description: 'Authentic medieval props and items for historical and fantasy games.',
    thumbnail: '/placeholder-asset.svg',
    fileUrl: '/medieval-props.unitypackage',
    downloadCount: 0, // Will be calculated from real download records
    tags: ['props', 'medieval', 'historical', 'items'],
    categoryId: '507f1f77bcf86cd799439024',
    category: { name: 'Props', slug: 'props' },
    uploadedBy: { name: 'History Craft', _id: '507f1f77bcf86cd799439054' },
    createdAt: new Date('2024-04-05').toISOString(),
    updatedAt: new Date('2024-04-05').toISOString(),
    isActive: true
  },
  {
    _id: '507f1f77bcf86cd799439015',
    name: 'Epic Orchestral Soundtrack',
    description: 'High-quality orchestral music tracks for epic game moments and cinematic scenes.',
    thumbnail: '/placeholder-asset.svg',
    fileUrl: '/epic-orchestral-soundtrack.unitypackage',
    downloadCount: 0, // Will be calculated from real download records
    tags: ['audio', 'music', 'orchestral', 'epic'],
    categoryId: '507f1f77bcf86cd799439025',
    category: { name: 'Audio', slug: 'audio' },
    uploadedBy: { name: 'Epic Sounds', _id: '507f1f77bcf86cd799439055' },
    createdAt: new Date('2024-05-12').toISOString(),
    updatedAt: new Date('2024-05-12').toISOString(),
    isActive: true
  }
];

const sampleCategories = [
  { _id: '507f1f77bcf86cd799439021', name: 'Characters', slug: 'characters', description: 'Character models and animations', isActive: true },
  { _id: '507f1f77bcf86cd799439022', name: 'Environment', slug: 'environment', description: 'Environmental assets and scenes', isActive: true },
  { _id: '507f1f77bcf86cd799439023', name: 'Effects', slug: 'effects', description: 'Visual and particle effects', isActive: true },
  { _id: '507f1f77bcf86cd799439024', name: 'Props', slug: 'props', description: 'Game props and items', isActive: true },
  { _id: '507f1f77bcf86cd799439025', name: 'Audio', slug: 'audio', description: 'Music and sound effects', isActive: true }
];

// ==================== ASSET ROUTES ====================

// GET /api/assets - List assets with filtering, search, pagination
router.get('/', async (req, res) => {
  console.log('🚀 GET /api/assets route HIT!');
  try {
    const {
      page = 1,
      limit = 12,
      search = '',
      category = '',
      status = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    console.log('🔍 Assets API request - MongoDB readyState:', mongoose.connection.readyState);

    if (mongoose.connection.readyState === 1) {
      console.log('✅ Using database mode');
      // Build query for database
      let query = {};

      // Search by name, description, or tags
      if (search && search.trim()) {
        query.$or = [
          { name: { $regex: search.trim(), $options: 'i' } },
          { description: { $regex: search.trim(), $options: 'i' } },
          { tags: { $in: [new RegExp(search.trim(), 'i')] } }
        ];
      }

      // Filter by category
      if (category && category !== 'all') {
        query.categoryId = category;
      }

      // Filter by status
      if (status && status !== 'all') {
        query.isActive = status === 'active';
      }

      // Sort options
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

      const [assets, totalAssets] = await Promise.all([
        Asset.find(query)
          .populate('categoryId', 'name slug')
          .populate('uploadedBy', 'name email')
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Asset.countDocuments(query)
      ]);

      // Add download counts and transform response
      const assetsWithCounts = await Promise.all(
        assets.map(async (asset) => {
          const downloadCount = await Download.countDocuments({ assetId: asset._id });

          // Handle category population - if populate failed, do manual lookup
          let category = null;
          console.log('Processing asset:', asset._id, 'categoryId:', asset.categoryId, 'type:', typeof asset.categoryId);
          if (asset.categoryId) {
            if (typeof asset.categoryId === 'object' && asset.categoryId._id) {
              // Population worked
              console.log('Population worked for asset:', asset._id);
              category = {
                _id: asset.categoryId._id,
                name: asset.categoryId.name,
                slug: asset.categoryId.slug
              };
            } else {
              // Population failed, do manual lookup
              console.log('Doing manual category lookup for asset:', asset._id, 'categoryId:', asset.categoryId);
              try {
                const categoryDoc = await Category.findById(asset.categoryId);
                console.log('Category lookup result:', categoryDoc);
                if (categoryDoc) {
                  category = {
                    _id: categoryDoc._id,
                    name: categoryDoc.name,
                    slug: categoryDoc.slug
                  };
                }
              } catch (error) {
                console.log('Category lookup failed for asset:', asset._id, 'categoryId:', asset.categoryId, 'error:', error.message);
              }
            }
          }

          return {
            ...asset,
            downloadCount,
            category: category || { _id: 'unknown', name: 'Unknown Category', slug: 'unknown' },
            _count: { downloads: downloadCount }
          };
        })
      );

      const totalPages = Math.ceil(totalAssets / limitNum);

      res.json({
        success: true,
        data: {
          assets: assetsWithCounts,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalAssets,
            hasNextPage: pageNum < totalPages,
            hasPrevPage: pageNum > 1,
            limit: limitNum
          }
        }
      });
    } else {
      // Demo mode with enhanced filtering - but still calculate real download counts
      let filteredAssets = [...sampleAssets];

      // Calculate real download counts from database even in demo mode
      try {
        if (mongoose.connection.readyState === 1) {
          // If database is available, get real download counts
          filteredAssets = await Promise.all(
            filteredAssets.map(async (asset) => {
              const downloadCount = await Download.countDocuments({ assetId: asset._id });
              return {
                ...asset,
                downloadCount,
                _count: { downloads: downloadCount }
              };
            })
          );
        } else {
          // If no database, set download counts to 0
          filteredAssets = filteredAssets.map(asset => ({
            ...asset,
            downloadCount: 0,
            _count: { downloads: 0 }
          }));
        }
      } catch (error) {
        console.error('Error calculating download counts:', error);
        // Fallback to 0 counts
        filteredAssets = filteredAssets.map(asset => ({
          ...asset,
          downloadCount: 0,
          _count: { downloads: 0 }
        }));
      }

      // Apply search filter
      if (search && search.trim()) {
        const searchLower = search.trim().toLowerCase();
        filteredAssets = filteredAssets.filter(asset =>
          asset.name.toLowerCase().includes(searchLower) ||
          asset.description.toLowerCase().includes(searchLower) ||
          asset.tags.some(tag => tag.toLowerCase().includes(searchLower))
        );
      }

      // Apply category filter
      if (category && category !== 'all') {
        filteredAssets = filteredAssets.filter(asset =>
          asset.category.slug === category || asset.categoryId === category
        );
      }

      // Apply status filter
      if (status && status !== 'all') {
        const isActive = status === 'active';
        filteredAssets = filteredAssets.filter(asset => asset.isActive === isActive);
      }

      // Apply sorting
      filteredAssets.sort((a, b) => {
        let aValue, bValue;

        switch (sortBy) {
          case 'name':
            aValue = a.name.toLowerCase();
            bValue = b.name.toLowerCase();
            break;
          case 'downloadCount':
            aValue = a.downloadCount || 0;
            bValue = b.downloadCount || 0;
            break;
          case 'updatedAt':
            aValue = new Date(a.updatedAt);
            bValue = new Date(b.updatedAt);
            break;
          default:
            aValue = new Date(a.createdAt);
            bValue = new Date(b.createdAt);
        }

        if (sortOrder === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });

      const totalAssets = filteredAssets.length;
      const totalPages = Math.ceil(totalAssets / limitNum);
      const paginatedAssets = filteredAssets.slice(skip, skip + limitNum);

      res.json({
        success: true,
        data: {
          assets: paginatedAssets,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalAssets,
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
      message: 'Failed to fetch assets',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/assets/featured - Get featured assets
router.get('/featured', async (req, res) => {
  try {
    let featuredAssets;

    if (mongoose.connection.readyState === 1) {
      // Database mode - get real featured assets based on actual downloads
      const assets = await Asset.find({ isActive: true })
        .populate('category', 'name slug')
        .populate('uploadedBy', 'name email')
        .lean();

      // Add real download counts and sort
      const assetsWithCounts = await Promise.all(
        assets.map(async (asset) => {
          const downloadCount = await Download.countDocuments({ assetId: asset._id });
          return {
            ...asset,
            downloadCount,
            _count: { downloads: downloadCount }
          };
        })
      );

      // Get top 3 most downloaded
      featuredAssets = assetsWithCounts
        .sort((a, b) => b.downloadCount - a.downloadCount)
        .slice(0, 3);
    } else {
      // Demo mode - calculate real downloads for sample assets if database available
      let assetsWithCounts = [...sampleAssets];

      if (mongoose.connection.readyState === 1) {
        // Calculate real download counts even for sample data
        assetsWithCounts = await Promise.all(
          sampleAssets.map(async (asset) => {
            const downloadCount = await Download.countDocuments({ assetId: asset._id });
            return {
              ...asset,
              downloadCount,
              _count: { downloads: downloadCount }
            };
          })
        );
      } else {
        // No database - set counts to 0
        assetsWithCounts = sampleAssets.map(asset => ({
          ...asset,
          downloadCount: 0,
          _count: { downloads: 0 }
        }));
      }

      // Get top 3 most downloaded
      featuredAssets = assetsWithCounts
        .sort((a, b) => b.downloadCount - a.downloadCount)
        .slice(0, 3);
    }

    res.json({
      success: true,
      data: {
        assets: featuredAssets
      }
    });
  } catch (error) {
    console.error('Featured assets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get featured assets'
    });
  }
});

// GET /api/assets/stats - Asset stats endpoint (must come before :id route)
router.get('/stats', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const totalAssets = await Asset.countDocuments();
      const activeAssets = await Asset.countDocuments({ isActive: true });
      const inactiveAssets = await Asset.countDocuments({ isActive: false });
      const totalDownloads = await Download.countDocuments();

      res.json({
        success: true,
        data: {
          total: totalAssets,
          active: activeAssets,
          inactive: inactiveAssets,
          totalDownloads
        }
      });
    } else {
      // Demo mode - but still calculate real download counts if database is available
      const activeAssets = sampleAssets.filter(asset => asset.isActive).length;
      const inactiveAssets = sampleAssets.filter(asset => !asset.isActive).length;

      let totalDownloads = 0;
      if (mongoose.connection.readyState === 1) {
        // Get real total downloads from database
        totalDownloads = await Download.countDocuments();
      }

      res.json({
        success: true,
        data: {
          total: sampleAssets.length,
          active: activeAssets,
          inactive: inactiveAssets,
          totalDownloads
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get asset stats',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/assets - Create asset with file upload (must come before parameterized routes)
router.post('/', upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'assetFile', maxCount: 1 }
]), async (req, res) => {
  console.log('🔥 POST /api/assets route HIT!');
  try {
    const { name, description, categoryId, tags } = req.body;
    const files = req.files;

    console.log('Asset upload request received:', { name, description, categoryId, tags });
    console.log('Files received:', files);

    // Basic validation
    if (!name || !description || !categoryId) {
      return res.status(400).json({
        success: false,
        message: 'Name, description, and category are required'
      });
    }

    // Check if files are uploaded
    if (!files?.thumbnail?.[0] || !files?.assetFile?.[0]) {
      return res.status(400).json({
        success: false,
        message: 'Both thumbnail and asset file are required'
      });
    }

    // Find category
    let category = null;
    if (mongoose.connection.readyState === 1) {
      category = await Category.findById(categoryId);
    } else {
      category = sampleCategories.find(c => c._id === categoryId);
    }

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Process tags
    let processedTags = [];
    if (tags) {
      if (Array.isArray(tags)) {
        processedTags = tags.filter(tag => tag && tag.trim()).map(tag => tag.trim());
      } else if (typeof tags === 'string') {
        processedTags = tags.split(',').filter(tag => tag.trim()).map(tag => tag.trim());
      }
    }

    // Get uploaded file paths
    const thumbnailFile = files.thumbnail[0];
    const assetFileUpload = files.assetFile[0];

    const thumbnailUrl = getFileUrl(thumbnailFile);
    const assetFileUrl = getFileUrl(assetFileUpload);

    console.log('File paths:', { thumbnailUrl, assetFileUrl });

    // Create new asset object
    const newAsset = {
      _id: new Date().getTime().toString(), // Simple ID generation
      name: name.trim(),
      description: description.trim(),
      thumbnail: thumbnailUrl,
      fileUrl: assetFileUrl,
      downloadCount: 0,
      tags: processedTags,
      categoryId: categoryId,
      category: { name: category.name, slug: category.slug },
      uploadedBy: { name: 'Admin User', _id: 'admin-user-id' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true
    };

    if (mongoose.connection.readyState === 1) {
      // Save to database
      const asset = new Asset({
        name: newAsset.name,
        description: newAsset.description,
        categoryId: categoryId,
        tags: processedTags,
        thumbnail: thumbnailUrl,
        fileUrl: assetFileUrl,
        uploadedBy: { name: 'Admin User', _id: 'admin-user-id' },
        isActive: true
      });

      await asset.save();

      res.status(201).json({
        success: true,
        message: 'Asset uploaded successfully',
        data: { asset: asset.toObject() }
      });
    } else {
      // Demo mode - add to sample assets array
      sampleAssets.push(newAsset);

      res.status(201).json({
        success: true,
        message: 'Asset uploaded successfully (demo mode)',
        data: { asset: newAsset }
      });
    }
  } catch (error) {
    console.error('Asset upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Asset upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/assets/:id - Get single asset
router.get('/:id', async (req, res) => {
  try {
    const assetId = req.params.id;

    // Check if it's a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(assetId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid asset ID format'
      });
    }

    // Get asset from MongoDB database
    const asset = await Asset.findById(assetId);

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    res.json({
      success: true,
      data: { asset }
    });
  } catch (error) {
    console.error('Get asset by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get asset'
    });
  }
});

// PATCH /api/assets/:id - Update asset endpoint
router.patch('/:id', async (req, res) => {
  try {
    const assetId = req.params.id;
    const updateData = req.body;

    // Update asset in MongoDB database
    const asset = await Asset.findById(assetId);
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    // Update only the fields provided
    if (updateData.name !== undefined) asset.name = updateData.name;
    if (updateData.description !== undefined) asset.description = updateData.description;
    if (updateData.categoryId !== undefined) asset.categoryId = updateData.categoryId;
    if (updateData.isActive !== undefined) asset.isActive = updateData.isActive;
    if (updateData.tags !== undefined) asset.tags = updateData.tags;

    asset.updatedAt = new Date();

    await asset.save();

    res.json({
      success: true,
      message: 'Asset updated successfully',
      data: { asset }
    });
  } catch (error) {
    console.error('Update asset error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update asset'
    });
  }
});

// PATCH /api/assets/:id/status - Toggle asset status endpoint
router.patch('/:id/status', async (req, res) => {
  try {
    const assetId = req.params.id;

    if (mongoose.connection.readyState === 1) {
      const asset = await Asset.findById(assetId);
      if (!asset) {
        return res.status(404).json({
          success: false,
          message: 'Asset not found'
        });
      }

      asset.isActive = !asset.isActive;
      asset.updatedAt = new Date();
      await asset.save();

      res.json({
        success: true,
        message: `Asset ${asset.isActive ? 'activated' : 'deactivated'} successfully`,
        data: { asset }
      });
    } else {
      // Demo mode
      const assetIndex = sampleAssets.findIndex(a => a._id === assetId);
      if (assetIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Asset not found'
        });
      }

      sampleAssets[assetIndex].isActive = !sampleAssets[assetIndex].isActive;
      sampleAssets[assetIndex].updatedAt = new Date().toISOString();

      res.json({
        success: true,
        message: `Asset ${sampleAssets[assetIndex].isActive ? 'activated' : 'deactivated'} successfully`,
        data: { asset: sampleAssets[assetIndex] }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update asset status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// DELETE /api/assets/:id - Delete asset endpoint
router.delete('/:id', async (req, res) => {
  try {
    const assetId = req.params.id;

    if (mongoose.connection.readyState === 1) {
      const asset = await Asset.findByIdAndDelete(assetId);
      if (!asset) {
        return res.status(404).json({
          success: false,
          message: 'Asset not found'
        });
      }

      // Also delete related downloads
      await Download.deleteMany({ assetId: assetId });

      res.json({
        success: true,
        message: 'Asset deleted successfully'
      });
    } else {
      // Demo mode
      const assetIndex = sampleAssets.findIndex(a => a._id === assetId);
      if (assetIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Asset not found'
        });
      }

      sampleAssets.splice(assetIndex, 1);

      res.json({
        success: true,
        message: 'Asset deleted successfully'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete asset',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;
