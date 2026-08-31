require('dotenv').config();

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var apisRouter = require('./routes/apis');

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

const corsOrigin = process.env.CORS_ORIGIN || process.env.APP_URL || 'http://localhost:3000';
app.use(cors({
  origin: corsOrigin.split(',').map((o) => o.trim()),
  credentials: true,
}));

app.use(logger('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/api', apisRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'namezivobackend' });
});

app.use(function (req, res, next) {
  next(createError(404));
});

app.use(function (err, req, res, next) {
  if (req.path.startsWith('/api')) {
    return res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }

  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
