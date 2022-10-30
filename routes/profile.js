const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
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
    res.render('profile');
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.post('/change_password', isLoggedIn, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;

    const [[ exUser ]] = await connection.query(
      `SELECT * FROM user WHERE service = "cn" AND id = ? LIMIT 1;`,
      [req.user.id]);

    if (!exUser)
      res.json({ message: "유저 존재하지 않음" });
        
    const result = await bcrypt.compare(oldPassword, exUser.password);
    
    if (!result)
      res.json({ message: "현재 비밀번호가 틀립니다." });
    
    const hash = await bcrypt.hash(newPassword, 12);
    
    await connection.query(
      `UPDATE user SET password = ? WHERE service = "cn" AND id = ?;`,
      [hash, req.user.id]);
    
    res.json({ success: true });
    
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.post('/change_nickname', isLoggedIn, async (req, res, next) => {
  try {
    const { newNickname } = req.body;

    const [[ exUser ]] = await connection.query(
      `SELECT * FROM user WHERE id = ? LIMIT 1;`,
      [req.user.id]);

    if (!exUser)
      res.json({ message: "유저 존재하지 않음" });
                
    await connection.query(
      `UPDATE user SET nick = ? WHERE id = ?;`,
      [newNickname, req.user.id]);
    
    res.json({ success: true });
    
  } catch (err) {
    console.error(err);
    next(err);
  }
});

module.exports = router;