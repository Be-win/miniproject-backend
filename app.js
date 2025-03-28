const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const fileUpload = require('express-fileupload');

const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const sustainabilityRouter = require("./routes/sustainability");
const gardenRoutes = require("./routes/garden");
const notificationRoutes = require("./routes/notifications");
const resourceRoutes = require('./routes/resources');
const reviewsRouter = require('./routes/reviews.js');
const adminRouter = require('./routes/admin');

const app = express();

const corsOptions = {
  origin: [
      'https://www.willowandthrive.shop',
      'https://miniproject-frontend-pied.vercel.app',
      'http://localhost:5173'
  ],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.options('/garden/upload-image', cors(corsOptions));
app.use(cors(corsOptions));

app.options('*', cors()); // Enable preflight for all routes

app.use(fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  abortOnLimit: true
}));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/sustainability', sustainabilityRouter);
app.use("/garden", gardenRoutes);
app.use("/notifications", notificationRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/reviews", reviewsRouter);
app.use('/admin', adminRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

if (process.env.VERCEL) {
  console.log('Running in Vercel environment');
}

module.exports = app;
