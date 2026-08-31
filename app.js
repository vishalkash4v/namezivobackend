require('dotenv').config();

const createError = require('http-errors');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const apisRouter = require('./routes/apis');

const app = express();

const corsOrigin = process.env.CORS_ORIGIN || process.env.APP_URL || 'http://localhost:3000';
app.use(cors({
  origin: corsOrigin.split(',').map((o) => o.trim()),
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.get('/', (req, res) => {
  res.json({ service: 'namezivobackend', status: 'ok', docs: '/health' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'namezivobackend' });
});

app.use('/api', apisRouter);

app.use((req, res, next) => {
  next(createError(404, 'Not found'));
});

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

module.exports = app;
