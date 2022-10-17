const express = require('express');
const path = require('path');
const { isLoggedIn, isNotLoggedIn } = require('./middlewares');

const router = express.Router();

router.get('/', isNotLoggedIn, async (req, res, next) => {
  try {
    res.sendFile('home.html', { root: path.join(__dirname, '../views') });
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.get('/join', isNotLoggedIn, async (req, res, next) => {
  try {
    res.sendFile('join.html', { root: path.join(__dirname, '../views') });
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.get('/dashboard', isLoggedIn, async (req, res, next) => {
  try {
    res.sendFile('dashboard.html', { root: path.join(__dirname, '../views') });
  } catch (err) {
    console.error(err);
    next(err);
  }
});

module.exports = router;