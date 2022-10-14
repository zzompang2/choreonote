const express = require('express');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    res.sendFile('/index.html');	// views/home.html
  } catch (err) {
    console.error(err);
    next(err);
  }
});

module.exports = router;