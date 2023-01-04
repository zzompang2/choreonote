const express = require('express');
const path = require('path');
const passport = require('passport');
const dotenv = require('dotenv');  // .env 파일 읽어서 process.env 로 만듦
const session = require('express-session');
const nunjucks = require('nunjucks');  // 템플릿 엔진

dotenv.config();
const homeRouter = require('./routes/home');
const authRouter = require('./routes/auth');
const dashboardRouter = require('./routes/dashboard');
const noteRouter = require('./routes/note');
const profileRouter = require('./routes/profile');
const communityRouter = require('./routes/community');
const passportConfig = require('./passport');

const app = express();
passportConfig();		// 패스포트 설정

/* app.set(key, value) 으로 데이터 저장 & app.get(key) 으로 사용 */
app.set('port', process.env.PORT || 3002);
app.set('view engine', 'html');  // for nunjucks

// 'views' : 템플릿 파일들 위치한 폴더 지정.
// - res.render 메서드가 이 폴더 기준으로 템플릿 엔진을 찾아 렌더링
// watch-true : HTML 파일 변경될 때 템플릿 엔진 다시 렌더링
nunjucks.configure('views', {
  express: app,
  watch: true,
});

app.use(
	express.static(path.join(__dirname, 'public')),  // 정적파일 제공
  express.json({ limit: "50MB" }),                 // 요청의 본문 데이터 해석해서 req.body 객체로 생성(body-parser)
  express.urlencoded({ extended: false }),
  session({
    resave: false,
    saveUninitialized: false,
    secret: process.env.COOKIE_SECRET,
    cookie: {
      httpOnly: true,
      secure: false,
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.use('/', homeRouter);
app.use('/auth', authRouter);
app.use('/dashboard', dashboardRouter);
app.use('/note', noteRouter);
app.use('/profile', profileRouter);
app.use('/community', communityRouter);

// 에러처리 미들웨어
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(err.message);
});

app.listen(app.get('port'), () => {
  console.log(app.get('port') + '번 포트에서 대기 중...');
});