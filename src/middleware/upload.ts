import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';
import path from 'path';
import fs from 'fs';
import { createError } from './error';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

// Check if S3 is configured
const isS3Configured = !!(
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.AWS_S3_BUCKET_NAME
);


// Local storage configuration
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads');
    
    // Ensure uploads directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const basename = path.basename(file.originalname, extension);
    cb(null, `${file.fieldname}-${uniqueSuffix}${extension}`);
  }
});

// S3 storage configuration
const s3Storage = multerS3({
  s3: s3Client,
  bucket: process.env.AWS_S3_BUCKET_NAME || '',
  acl: 'public-read',
  metadata: (req, file, cb) => {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const folder = file.fieldname === 'thumbnail' ? 'thumbnails' : 'assets';
    cb(null, `${folder}/${file.fieldname}-${uniqueSuffix}${extension}`);
  }
});

// File filter for different file types
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allowed file types
  const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
  const allowedAssetTypes = /unitypackage|zip|rar|7z/;
  const allowedVideoTypes = /mp4|avi|mov|wmv|flv|webm/;

  const extension = path.extname(file.originalname).toLowerCase().slice(1);
  const mimetype = file.mimetype.toLowerCase();

  if (file.fieldname === 'thumbnail') {
    // Thumbnails can be images or videos
    const isImage = allowedImageTypes.test(extension) && mimetype.startsWith('image/');
    const isVideo = allowedVideoTypes.test(extension) && mimetype.startsWith('video/');
    
    if (isImage || isVideo) {
      cb(null, true);
    } else {
      cb(createError('Thumbnail must be an image (JPEG, PNG, GIF, WebP) or video (MP4, AVI, MOV, WMV, FLV, WebM)', 400));
    }
  } else if (file.fieldname === 'assetFile') {
    // Asset files
    const isValidAsset = allowedAssetTypes.test(extension);
    
    if (isValidAsset) {
      cb(null, true);
    } else {
      cb(createError('Asset file must be a Unity package (.unitypackage) or archive (.zip, .rar, .7z)', 400));
    }
  } else {
    cb(createError('Unexpected field name', 400));
  }
};

// File size limits (in bytes)
const limits = {
  fileSize: 100 * 1024 * 1024, // 100MB max file size
  files: 2 // Maximum 2 files (thumbnail + asset)
};

// Create multer instance
const storage = isS3Configured ? s3Storage : localStorage;

export const upload = multer({
  storage,
  fileFilter,
  limits
});

// Middleware for asset upload (thumbnail + asset file)
export const uploadAssetFiles = upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'assetFile', maxCount: 1 }
]);

// Middleware for thumbnail only
export const uploadThumbnail = upload.single('thumbnail');

// Middleware for asset file only
export const uploadAssetFile = upload.single('assetFile');

// Helper function to get file URL
export const getFileUrl = (file: Express.Multer.File): string => {
  if (isS3Configured && 'location' in file) {
    // S3 file
    return (file as any).location;
  } else {
    // Local file
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
    return `${baseUrl}/uploads/${file.filename}`;
  }
};

// Helper function to delete file
export const deleteFile = async (fileUrl: string): Promise<void> => {
  try {
    if (isS3Configured && fileUrl.includes('amazonaws.com')) {
      // Delete from S3
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const key = fileUrl.split('/').slice(-2).join('/'); // Get folder/filename from URL
      
      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: key
      }));
    } else {
      // Delete local file
      const filename = path.basename(fileUrl);
      const filePath = path.join(__dirname, '../../uploads', filename);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (error) {
    console.error('Error deleting file:', error);
    // Don't throw error, just log it
  }
};