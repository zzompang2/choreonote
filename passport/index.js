const passport = require('passport');
const local = require('./localStrategy');
const kakao = require('./kakaoStrategy');
const google = require('./googleStrategy');
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
  /* 로그인 시 실행됨.
   * req.session 객체에 어떤 데이터를 저장할지 정하는 메서드.
   * 사용자 정보 객체를 세션에 id 로 저장하는 과정인 것. */
  passport.serializeUser((user, done) => {
    // console.log("passport.serializeUser:", user);
    done(null, user.id);
  });

  /* 매 요청 시 실행됨. passport.session 미들웨어가 이 메서드를 호출.
   * serializeUser의 done의 두 번째 인수로 넣은 데이터가
   * deserializeUser의 매개변수가 됨. 조회한 정보 user 를 req.user 에 저장.
   * 즉, 세션에 저장한 id 를 통해 사용자 정보 객체를 불러오는 것.
   * 세션에 불필요한 데이터를 담아두지 않기 위한 과정임. */
  passport.deserializeUser(async (id, done) => {
    try {
      const [[ user ]] = await connection.query(`
      SELECT * FROM user WHERE id = ? LIMIT 1;
      `, [id]);
        done(null, user);
    } catch(err) {
      done(err);
    }
  });
  
  local();
  google();
  kakao();
};