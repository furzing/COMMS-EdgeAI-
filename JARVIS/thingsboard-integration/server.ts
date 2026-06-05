/**
 * Main Server Entry Point for Render Deployment
 * Smart Home Face Recognition API
 */

import app from './face-recognition/heroku-api-endpoint';

const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Smart Home Face Recognition API deployed on Render`);
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`🔒 Security mode: Production (Access Always Denied)`);
  console.log(`🎭 Celebrity recognition: 15K model loaded`);
  console.log(`📅 Deployment: ${new Date().toISOString()}`);
});

export default app;