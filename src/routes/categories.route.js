const express = require('express');
const mongoose = require('mongoose');
const { Category, Asset } = require('../models/index');

const router = express.Router();

// ==================== CATEGORY ROUTES ====================

// GET /active - Get all active categories
router.get('/active', async (req, res) => {
  try {
    const activeCategories = await Category.find({ isActive: true });
    res.json({
      success: true,
      data: {
        categories: activeCategories
      }
    });
  } catch (error) {
    console.error('Error fetching active categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active categories'
    });
  }
});

// GET / - Get all categories with asset count
router.get('/', async (req, res) => {
  try {
    // Add aggregation to include asset count for each category
    const categories = await Category.aggregate([
      {
        $lookup: {
          from: 'assets',
          localField: '_id',
          foreignField: 'categoryId',
          as: 'assets'
        }
      },
      {
        $addFields: {
          _count: {
            assets: { $size: '$assets' }
          }
        }
      },
      {
        $project: {
          assets: 0 // Remove the assets array from final output
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        categories: categories
      }
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
});

// GET /:id - Get category by ID
router.get('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    res.json(category);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category'
    });
  }
});

// GET /slug/:slug - Get category by slug
router.get('/slug/:slug', async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug });
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    res.json(category);
  } catch (error) {
    console.error('Error fetching category by slug:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category'
    });
  }
});

// POST / - Create category
router.post('/', async (req, res) => {
  try {
    const { name, description, slug } = req.body;

    // Auto-generate slug if not provided
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();

    // Check if slug already exists
    const existingCategory = await Category.findOne({ slug: finalSlug });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'A category with this slug already exists'
      });
    }

    const newCategory = new Category({
      name,
      description,
      slug: finalSlug
    });

    const savedCategory = await newCategory.save();
    res.status(201).json(savedCategory);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create category'
    });
  }
});

// PATCH /:id - Update category
router.patch('/:id', async (req, res) => {
  try {
    const { name, description, slug } = req.body;
    const updateData = { updatedAt: new Date() };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (slug !== undefined) {
      // Check if new slug conflicts with existing categories (excluding current one)
      const existingCategory = await Category.findOne({
        slug: slug,
        _id: { $ne: req.params.id }
      });
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'A category with this slug already exists'
        });
      }
      updateData.slug = slug;
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    res.json(updatedCategory);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update category'
    });
  }
});

// DELETE /:id - Delete category
router.delete('/:id', async (req, res) => {
  try {
    // Check if category has associated assets
    const assetCount = await Asset.countDocuments({ categoryId: req.params.id });
    if (assetCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. It has ${assetCount} associated assets.`
      });
    }

    const deletedCategory = await Category.findByIdAndDelete(req.params.id);
    if (!deletedCategory) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete category'
    });
  }
});

// PATCH /:id/toggle-status - Toggle category status
router.patch('/:id/toggle-status', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    category.isActive = !category.isActive;
    category.updatedAt = new Date();
    await category.save();

    res.json(category);
  } catch (error) {
    console.error('Error toggling category status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle category status'
    });
  }
});

module.exports = router;
