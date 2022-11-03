const express = require('express');
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

router.get('/', isLoggedIn, async (req, res, next) => {
  try {    
    res.render('community', { nickname: req.user.nick });
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.get('/post', isLoggedIn, async (req, res, next) => {
  try {
    const [ posts ] = await connection.query(`
    	SELECT u.nick, c.body, COUNT(l.uid) AS likeNumber, DATE_FORMAT(c.createdAt, '%Y.%m.%d %H:%i') AS createdAt
      FROM (SELECT * FROM community WHERE hide = false) AS c
      INNER JOIN user AS u
      ON u.id = c.uid
      LEFT JOIN community_like AS l
      ON l.cid = c.id
      GROUP BY c.id
      ORDER BY createdAt DESC;`);
    res.send({ posts });    
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.post('/post', isLoggedIn, async (req, res, next) => {
  try {
    let { body } = req.body;

    body = body.trim();

    if (body.length != 0 && body.length <= 500) {
      const [{ insertId }] = await connection.query(
        "INSERT INTO community (uid, body) VALUES (?, ?);",
        [ req.user.id, body ]
      );
      const [[ post ]] = await connection.query(`
    	SELECT body, DATE_FORMAT(createdAt, '%Y.%m.%d %H:%i') AS createdAt
      FROM community
      WHERE id = ?;`, [ insertId ]);
      res.json({ post: { ...post, nick: req.user.nick, likeNumber: 0 } }); 
    }

  } catch (err) {
    console.error(err);
    next(err);
  }
});

module.exports = router;