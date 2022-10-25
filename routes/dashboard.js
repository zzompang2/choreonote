const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const { isLoggedIn, isNotLoggedIn } = require('./middlewares');

const router = express.Router();

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

router.get('/', isLoggedIn, async (req, res, next) => {
  try {
    res.render('dashboard');
  } catch (err) {
    console.error(err);
    next(err);
  }
});

const getRandomTitle = () => {
  const titleOptions = [
    "엄청난노트", "굉장한노트", "대단한노트", "짜릿한노트", "멋진노트"
  ];
  return titleOptions[ Math.floor(Math.random() * 5) ];
}

router.get('/create_note', isLoggedIn, async (req, res, next) => {
  try {
  	const [ rows ] = await connection.query(
      "INSERT INTO note (uid, title) VALUES (?, ?);",
      [req.user.id, getRandomTitle() ]
    );
    res.send({ noteId: rows.insertId });
  } catch (err) {
    console.error(err);
    next(err);
  }
});

module.exports = router;