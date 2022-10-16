// isAuthenticated: Passport 가 req 객체에 추가햐준 메서드.
// 로그인 중인지를 bool 상태로 반환.

exports.isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) {
    next();
  } else {
    // res.status(403).send('로그인 필요');
    res.redirect('/');
  }
};

exports.isNotLoggedIn = (req, res, next) => {
  if (!req.isAuthenticated()) {
    next();
  } else {
    const message = encodeURIComponent('로그인한 상태입니다.');
    // res.redirect(`/?error=${message}`);
    res.redirect('/stage');
  }
};
