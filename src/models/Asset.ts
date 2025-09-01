import { Schema, model } from 'mongoose';
import { IAsset } from '../types';

const assetSchema = new Schema<IAsset>({
  name: {
    type: String,
    required: [true, 'Asset name is required'],
    trim: true,
    maxlength: [200, 'Asset name cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Asset description is required'],
    trim: true,
    maxlength: [2000, 'Asset description cannot exceed 2000 characters']
  },
  fileUrl: {
    type: String,
    required: [true, 'File URL is required'],
    trim: true
  },
  thumbnail: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  downloadCount: {
    type: Number,
    default: 0,
    min: [0, 'Download count cannot be negative']
  },
  categoryId: {
    type: String,
    required: [true, 'Category ID is required'],
    ref: 'Category'
  },
  uploadedById: {
    type: String,
    required: [true, 'Uploader ID is required'],
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for performance
assetSchema.index({ name: 1 });
assetSchema.index({ categoryId: 1 });
assetSchema.index({ uploadedById: 1 });
assetSchema.index({ isActive: 1 });
assetSchema.index({ downloadCount: -1 });
assetSchema.index({ createdAt: -1 });
assetSchema.index({ tags: 1 });

// Text index for search functionality
assetSchema.index({ 
  name: 'text', 
  description: 'text', 
  tags: 'text' 
});

// Compound unique index for name + uploader
assetSchema.index({ name: 1, uploadedById: 1 }, { unique: true });

// Virtual for file size (if we want to add this later)
assetSchema.virtual('fileSize').get(function() {
  // This would be populated from file metadata
  return this.get('_fileSize') || 0;
});

// Method to increment download count
assetSchema.methods.incrementDownloadCount = function() {
  this.downloadCount += 1;
  return this.save();
};

export const Asset = model<IAsset>('Asset', assetSchema);