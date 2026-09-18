import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import aiRoutes from './src/gemini-module/routes/ai.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const allowedOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

// Core Middlewares
// app.use(cors({
//   origin(origin, callback) {
//     if (
//       !origin ||
//       origin.startsWith('chrome-extension://') ||
//       origin.startsWith('http://') ||
//       allowedOrigins.has(origin)
//     ) {
//       return callback(null, true);
//     }

//     return callback(new Error('Origin is not allowed by CORS'));
//   },
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// }));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '2mb' }));

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server running smoothly' });
});

// API Routes
app.use('/api/v1/ai', aiRoutes);

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Request body must be valid JSON.' });
  }
  if (err.message === 'Origin is not allowed by CORS') {
    return res.status(403).json({ success: false, message: 'Origin is not allowed.' });
  }
  res.status(500).json({
    success: false,
    message: 'Internal Server Error'
  });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Server listening on http://127.0.0.1:${PORT}`);
});
