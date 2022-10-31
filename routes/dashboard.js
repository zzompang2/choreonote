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
    res.render('dashboard', { nickname: req.user.nick });
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
  	const [{ insertId: noteId }] = await connection.query(
      "INSERT INTO note (uid, title) VALUES (?, ?);",
      [req.user.id, getRandomTitle() ]
    );
    await connection.query(
      "UPDATE note SET noteId = ? WHERE id = ?;",
      [ noteId, noteId ]
    );

    await connection.query(
      "INSERT INTO dancer (nid, id, name, color) VALUES (?, ?, ?, ?);",
      [ noteId, 1, "Ham", "#ff631b" ]
    );
    await connection.query(
      "INSERT INTO dancer (nid, id, name, color) VALUES (?, ?, ?, ?);",
      [ noteId, 2, "Lulu", "#8249d3" ]
    );
    await connection.query(
      "INSERT INTO time (nid, id, start, duration) VALUES (?, ?, ?, ?);",
      [ noteId, 1, 0, 2000 ]
    );
    await connection.query(
      "INSERT INTO time (nid, id, start, duration) VALUES (?, ?, ?, ?);",
      [ noteId, 2, 5000, 3000 ]
    );
    await connection.query(
      "INSERT INTO pos (nid, tid, did, x, y) VALUES (?, ?, ?, ?, ?);",
      [ noteId, 1, 1, -100, 0 ]
    );
    await connection.query(
      "INSERT INTO pos (nid, tid, did, x, y) VALUES (?, ?, ?, ?, ?);",
      [ noteId, 1, 2, 100, 0 ]
    );
    await connection.query(
      "INSERT INTO pos (nid, tid, did, x, y) VALUES (?, ?, ?, ?, ?);",
      [ noteId, 2, 1, -100, 50 ]
    );
    await connection.query(
      "INSERT INTO pos (nid, tid, did, x, y) VALUES (?, ?, ?, ?, ?);",
      [ noteId, 2, 2, 100, 50 ]
    );
    res.send({ noteId });
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.post('/delete_note', isLoggedIn, async (req, res, next) => {
  try {
    const { id } = req.body;
    console.log("노트삭제", id);
    await connection.query(
      "UPDATE note SET hide = true WHERE id = ?;",
      [ id ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.get('/get_notes', isLoggedIn, async (req, res, next) => {
  try {
  	const [ notes ] = await connection.query(`
    	SELECT *, DATE_FORMAT(createdAt, '%Y.%m.%d %H:%i') AS createdAt
      FROM note WHERE uid = ? AND hide = ?;`,
      [req.user.id, false]);
    res.send({ notes });
  } catch (err) {
    console.error(err);
    next(err);
  }
});

module.exports = router;