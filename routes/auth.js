const express = require('express');
const passport = require('passport');
const bcrypt = require('bcrypt');
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

router.post('/join', isNotLoggedIn, async (req, res, next) => {
	const { email, nick, password } = req.body;
  try {
    const [[ exUser ]] = await connection.query(
      `SELECT * FROM user WHERE service = "cn" AND email = ? LIMIT 1;`,
      [email]);
    
    if (exUser) {
      return res.redirect('/join?error=exist');
    }
    const hash = await bcrypt.hash(password, 12);
    await connection.query(
      `INSERT INTO user (service, email, nick, password) VALUES ("cn", ?, ?, ?);`,
      [ email, nick, hash ]);
    return res.redirect('/');
  } catch (err) {
    console.error(err);
    return next(err);
  }
});

router.post('/login', isNotLoggedIn, (req, res, next) => {
  passport.authenticate('local', (authError, user, info) => {
    if (authError) {
      console.error(authError);
      return next(authError);
    }
    if (!user) {
      return res.redirect(`/?loginError=${info.message}`);
    }
    return req.login(user, (loginError) => {
      if (loginError) {
        console.error(loginError);
        return next(loginError);
      }
      return res.redirect('/dashboard');
    });
  })(req, res, next); // 미들웨어 내의 미들웨어는 (..) 붙여준다
});

router.get('/kakao', passport.authenticate('kakao'));

router.get('/kakao/callback', passport.authenticate('kakao', {
  failureRedirect: '/',
}), (req, res) => {
  res.redirect('/dashboard');
});

router.get('/logout', isLoggedIn, async (req, res) => {
  try {
    //req.logout();
    req.session.destroy();
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.json(error);
  }
});

router.get('/google', passport.authenticate('google', { scope: ["email", "profile"] }));

router.get('/google/callback', passport.authenticate('google', {
  failureRedirect: '/'
}), (req, res) => {
  res.redirect('/dashboard');
});

router.get('/user', async (req, res, next) => {

  res.send({
    nick: req.user.nick,
    email: req.user.email,
    service: req.user.service,
  });
});

module.exports = router;