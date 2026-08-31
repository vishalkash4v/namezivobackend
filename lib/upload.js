const multer = require('multer');

const ALLOWED_MIMES = new Set([
  'text/plain',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
]);

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const name = (file.originalname || '').toLowerCase();
    const okMime = ALLOWED_MIMES.has(file.mimetype);
    const okExt = name.endsWith('.txt') || name.endsWith('.csv');
    if (okMime || okExt) return cb(null, true);
    cb(new Error('Only CSV and TXT files are allowed'));
  },
});

function uploadOptional(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed' });
    }
    next();
  });
}

module.exports = { uploadOptional };
