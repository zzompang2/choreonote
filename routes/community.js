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
    	SELECT c.id, u.nick, c.body, l.likeNumber, ul.isLike, DATE_FORMAT(c.createdAt, '%Y.%m.%d %H:%i') AS createdAt
      FROM (SELECT * FROM community WHERE hide = false) AS c
      INNER JOIN user AS u
      ON u.id = c.uid
      LEFT JOIN (SELECT cid, COUNT(uid) AS likeNumber FROM community_like GROUP BY cid) AS l
      ON l.cid = c.id
      LEFT JOIN (SELECT cid, COUNT(uid) AS isLike FROM community_like WHERE uid = ? GROUP BY cid) AS ul
      ON ul.cid = c.id
      ORDER BY createdAt DESC;`, [ req.user.id ]);
        
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
    	SELECT id, body, DATE_FORMAT(createdAt, '%Y.%m.%d %H:%i') AS createdAt
      FROM community
      WHERE id = ?;`, [ insertId ]);
      res.json({ post: { ...post, nick: req.user.nick, likeNumber: 0 } }); 
    }

  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.post('/post_like', isLoggedIn, async (req, res, next) => {
  try {
    let { cid, isLike } = req.body;

    const [[ result ]] = await connection.query(
    	"SELECT * FROM community_like WHERE cid = ? AND uid =?;",
      [ cid, req.user.id ]);
    
    if (isLike) {
      if (!result) {  
        await connection.query(
          "INSERT INTO community_like (cid, uid) VALUES (?, ?);",
          [ cid, req.user.id ]
        );
      }
    }
    else {
      if (result) {
        await connection.query(
          "DELETE FROM community_like WHERE cid = ? AND uid = ?;",
          [ cid, req.user.id ]
        );
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.get('/comment', isLoggedIn, async (req, res, next) => {
  try {
    const { cid } = req.query;
    
    const [ comments ] = await connection.query(`
    	SELECT c.id, nick, body, DATE_FORMAT(c.createdAt, '%Y.%m.%d %H:%i') AS createdAt
      FROM (SELECT * FROM comment WHERE cid = ? AND hide = false) AS c
      INNER JOIN user AS u
      ON u.id = c.uid
      ORDER BY c.createdAt;
      `, [ cid ]);
        
    res.send({ comments });
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.post('/comment', isLoggedIn, async (req, res, next) => {
  try {
    const { cid, body } = req.body;
    
    const [{ insertId }] = await connection.query(
      "INSERT INTO comment (cid, uid, body) VALUES (?, ?, ?);",
      [ cid, req.user.id, body ]
    );
    
    const [[ comment ]] = await connection.query(`
      SELECT id, body, DATE_FORMAT(createdAt, '%Y.%m.%d %H:%i') AS createdAt
      FROM comment WHERE id = ? LIMIT 1;
      `, [ insertId ]
    );
        
    res.json({ comment: { ...comment, nick: req.user.nick } });
  } catch (err) {
    console.error(err);
    next(err);
  }
});

module.exports = router;