const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth2').Strategy;

const mysql = require('mysql2/promise');
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

const googleCredentials = {
  "web":{
    "client_id": process.env.GOOGLE_ID,
    "client_secret": process.env.GOOGLE_SECRET,
    "redirect_uris":["https://choreonote.run.goorm.io/auth/google/callback"]
  }
}

module.exports = () => {
  passport.use(new GoogleStrategy({
    clientID: googleCredentials.web.client_id,
    clientSecret: googleCredentials.web.client_secret,
    callbackURL: googleCredentials.web.redirect_uris[0]
  }, async (accessToken, refreshToken, profile, done) => {
    // profile: 사용자 정보가 담겨있음
    // console.log(profile);
    try {
      // 이미 회원가입한 사용자인지 확인
      const [[exUser]] = await connection.query(`SELECT * FROM user WHERE service = "gg" AND snsId = ? LIMIT 1;`, [profile.id]);
      
      if (exUser) {
        done(null, exUser);
      }
      // 회원가입하지 않은 사용자인 경우
      else {
        await connection.query(
          `INSERT INTO user (service, email, snsId, nick) VALUES ("gg", ?, ?, "닉네임");`,
          [
            profile.emails[0].value,
            profile.id,
          ]);
        
        const [[newUser]] = await connection.query(
          `SELECT * FROM user WHERE service = "gg" AND snsId = ?;`, [profile.id]);
        
        done(null, newUser);
      }
    } catch (error) {
      console.error(error);
      done(error);
    }
  }));
};