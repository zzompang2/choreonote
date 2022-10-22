const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const { isLoggedIn, isNotLoggedIn } = require('./middlewares');

let connection;
const db = async () => {
  try {
    connection = await mysql.createConnection({
      host     : process.env.MYSQL_HOST,
      user     : process.env.MYSQL_USER,
      password : process.env.MYSQL_PW,
      database : 'choreonote'
    });
  } catch (err) {
    console.error(err);
  }
}
db();

const router = express.Router();

// router.get('/', isLoggedIn, async (req, res, next) => {
//   try {
//     const { id } = req.query;
    
//     const [[ note ]] = await connection.query(
//       "SELECT uid FROM note WHERE id = ?;",
//       [id]
//     );
    
//     console.log(note);
    
//     if (note.uid == req.user.id)
//     	res.render('note');
//     else
//       res.render('dashboard');
//   } catch (err) {
//     console.error(err);
//     next(err);
//   }
// });

router.get('/', async (req, res, next) => {
  try {
    res.render('note');
  } catch (err) {
    console.error(err);
    next(err);
  }
});

module.exports = router;