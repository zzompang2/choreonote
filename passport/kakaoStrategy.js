const passport = require('passport');
const KakaoStrategy = require('passport-kakao').Strategy;
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

module.exports = () => {
  passport.use(new KakaoStrategy({
    clientID: process.env.KAKAO_ID,				// 카카오에서 발급해주는 아이디
    callbackURL: '/auth/kakao/callback',	// 카카오로부터 인증 결과를 받을 라우터 주소
  }, async (accessToken, refreshToken, profile, done) => {
    // profile: 사용자 정보가 담겨있음
    try {
      // 이미 회원가입한 사용자인지 확인
      const [[exUser]] = await connection.query(
        `SELECT * FROM user WHERE service = "kk" AND snsId = ? LIMIT 1;`,
        [profile.id]);
      
      if (exUser) {
        done(null, exUser);
      }
      // 회원가입하지 않은 사용자인 경우
      else {
        await connection.query(
          `INSERT INTO user (service, email, snsId, nick) VALUES ("kk", ?, ?, "닉네임");`,
          [
            profile._json && profile._json.kakao_account.email,
            profile.id,
          ]);
        
        const [[newUser]] = await connection.query(
          `SELECT * FROM user WHERE service = "kk" AND snsId = ?;`,
          [profile.id]);
        
        done(null, newUser);
      }
    } catch (error) {
      console.error(error);
      done(error);
    }
  }));
};