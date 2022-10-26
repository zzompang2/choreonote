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

/* for debugging */
router.get('/', async (req, res, next) => {
  try {
    res.render('note');
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.get('/info', async (req, res, next) => {
  try {
    const { id } = req.query;
    const [[ note ]] = await connection.query(
      "SELECT * FROM note WHERE id = ?;",
      [id]
    );
    const [ dancers ] = await connection.query(
      "SELECT id, name, color FROM dancer WHERE nid = ?;",
      [id]
    );
    const [ times ] = await connection.query(
      "SELECT id, start, duration FROM time WHERE nid = ? ORDER BY start;",
      [id]
    );
    const [ postions ] = await connection.query(
      "SELECT tid, did, x, y FROM pos WHERE nid = ?;",
      [id]
    );
    
    res.send({ note, dancers, times, postions });
    
  } catch (err) {
    console.error(err);
    next(err);
  }
});

module.exports = router;