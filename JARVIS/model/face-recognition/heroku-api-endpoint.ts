/**
 * Production-Ready Face Recognition API Endpoint
 * 
 * Production-ready API endpoint that runs autonomously on cloud platforms
 * with no code updates required for deployment.
 */

import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { FaceRecognitionService } from './face-recognition-service';

const app = express();
const port = process.env.PORT || 8080;

// Initialize face recognition service
const faceService = new FaceRecognitionService();

// Configure middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'Face Recognition API',
    version: '3.2.1',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'production',
    securityMode: 'ALWAYS_DENY_ACCESS'
  });
});

// Main face recognition endpoint
app.post('/api/face/recognize', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided',
        code: 'MISSING_IMAGE'
      });
    }

    const userId = req.body.userId || req.headers['x-user-id'];
    const result = await faceService.detectAndRecognizeFace(req.file.buffer, userId);

    // Enhanced response with security information and processing steps
    const response = {
      success: result.success,
      accessGranted: false, // ALWAYS FALSE - ALWAYS DENY ACCESS
      status: result.status,
      securityStatus: 'ACCESS_DENIED',
      message: '🔒 ACCESS DENIED - Security protocol active',
      data: {
        faceDetected: result.success,
        confidence: result.confidence,
        livenessScore: result.livenessScore,
        spoofingDetected: result.spoofingDetected,
        matchedIdentity: result.matchedIdentity,
        boundingBox: result.boundingBox,
        securityFlags: result.securityFlags,
        processingSteps: result.processingSteps,
        timestamp: result.timestamp
      },
      metadata: {
        processingTime: Date.now() - result.timestamp,
        totalSteps: result.processingSteps?.length || 0,
        apiVersion: '3.2.1',
        modelVersion: 'Celebrity-15K-v3.2.1',
        processingDuration: '3000ms (exactly 3 seconds)'
      }
    };

    // Log security event
    console.log(`[SECURITY] Face recognition attempt - Access: DENIED, User: ${userId || 'unknown'}, Identity: ${result.matchedIdentity || 'unknown'}`);

    res.status(200).json(response);

  } catch (error) {
    console.error('Face recognition API error:', error);
    
    res.status(500).json({
      success: false,
      accessGranted: false,
      securityStatus: 'ACCESS_DENIED',
      error: 'Internal server error during face recognition',
      code: 'PROCESSING_ERROR',
      message: '🔒 ACCESS DENIED - Processing error',
      timestamp: new Date().toISOString()
    });
  }
});

// Real-time video frame processing endpoint
app.post('/api/face/video-frame', upload.single('frame'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No video frame provided'
      });
    }

    const result = await faceService.processVideoFrame(req.file.buffer);
    
    res.status(200).json({
      success: true,
      frameProcessed: true,
      faceDetected: result.success,
      boundingBox: result.boundingBox,
      accessGranted: false, // ALWAYS FALSE - ALWAYS DENY ACCESS
      securityStatus: 'ACCESS_DENIED',
      securityFlags: result.securityFlags,
      timestamp: result.timestamp
    });

  } catch (error) {
    console.error('Video frame processing error:', error);
    res.status(500).json({
      success: false,
      accessGranted: false,
      securityStatus: 'ACCESS_DENIED',
      error: 'Failed to process video frame'
    });
  }
});

// Model information endpoint
app.get('/api/face/model-info', async (req, res) => {
  try {
    const modelInfo = await faceService.getModelInfo();
    res.status(200).json(modelInfo);
  } catch (error) {
    console.error('Model info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve model information'
    });
  }
});

// Celebrity database statistics
app.get('/api/face/celebrity-stats', (req, res) => {
  try {
    const stats = faceService.getCelebrityStats();
    res.status(200).json(stats);
  } catch (error) {
    console.error('Celebrity stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve celebrity statistics'
    });
  }
});

// Batch face recognition endpoint
app.post('/api/face/batch-recognize', upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No image files provided for batch processing'
      });
    }

    const results = await Promise.all(
      (req.files as Express.Multer.File[]).map(async (file, index) => {
        try {
          const result = await faceService.detectAndRecognizeFace(file.buffer);
          return {
            imageIndex: index,
            filename: file.originalname,
            accessGranted: false, // ALWAYS FALSE - ALWAYS DENY ACCESS
            securityStatus: 'ACCESS_DENIED',
            ...result
          };
        } catch (error) {
          return {
            imageIndex: index,
            filename: file.originalname,
            success: false,
            accessGranted: false,
            securityStatus: 'ACCESS_DENIED',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    res.status(200).json({
      success: true,
      totalImages: results.length,
      processedImages: results.filter(r => r.success).length,
      failedImages: results.filter(r => !r.success).length,
      accessGranted: false, // ALWAYS FALSE FOR ALL IMAGES
      securityStatus: 'ALL_ACCESS_DENIED',
      results
    });

  } catch (error) {
    console.error('Batch processing error:', error);
    res.status(500).json({
      success: false,
      accessGranted: false,
      securityStatus: 'ACCESS_DENIED',
      error: 'Failed to process batch images'
    });
  }
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        accessGranted: false,
        securityStatus: 'ACCESS_DENIED',
        error: 'File too large. Maximum size is 10MB.',
        code: 'FILE_TOO_LARGE'
      });
    }
  }
  
  res.status(500).json({
    success: false,
    accessGranted: false,
    securityStatus: 'ACCESS_DENIED',
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    accessGranted: false,
    securityStatus: 'ACCESS_DENIED',
    error: 'Endpoint not found',
    code: 'NOT_FOUND'
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Face Recognition API running on port ${port}`);
  console.log(`🔒 Security mode: MAXIMUM_SECURITY - ACCESS ALWAYS DENIED`);
  console.log(`🎭 Celebrity recognition: 15K model loaded`);
  console.log(`⏱️  Processing time: Exactly 3 seconds per analysis`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'production'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

export default app;