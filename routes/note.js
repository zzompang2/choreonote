const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const multer = require("multer");
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
    const { id } = req.query;
    
    const [[ note ]] = await connection.query(
      "SELECT uid FROM note WHERE id = ?;",
      [id]
    );
    
    console.log(note);
    
    if (note.uid == req.user.id)
    	res.render('note');
    else
      res.render('dashboard');
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.get('/info', async (req, res, next) => {
  try {
    const { id } = req.query;
    const [[ note ]] = await connection.query(
      "SELECT * FROM note WHERE noteId = ? AND hide = false;",
      [id]
    );
    
    console.log("노트아이디:", id, "인덱스:", note.id);
    const [ dancers ] = await connection.query(
      "SELECT id, name, color FROM dancer WHERE nid = ?;",
      [note.id]
    );
    const [ times ] = await connection.query(
      "SELECT id, start, duration FROM time WHERE nid = ? ORDER BY start;",
      [note.id]
    );
    const [ postions ] = await connection.query(
      "SELECT tid, did, x, y FROM pos WHERE nid = ?;",
      [note.id]
    );
    
    res.send({ note, dancers, times, postions });
    
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.post('/update', isLoggedIn, async (req, res, next) => {
  try {
    const { noteId, dancers, formations, noteInfo } = req.body;

    // 기존 노트 정보 가져오기
    const [[ originNote ]] = await connection.query(
      "SELECT * FROM note WHERE noteId = ? AND hide = ? LIMIT 1;",
      [ noteId, false ]
    );
    
    // console.log("originNote", originNote);
    
    const [{ insertId: newId }] = await connection.query(
      "INSERT INTO note (noteId, uid, title, musicfile, musicname, duration, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?);",
      [ noteId, req.user.id, noteInfo.title, noteInfo.musicfile, noteInfo.musicname, noteInfo.duration, originNote.createdAt ]
    );
    
    console.log("새로운 아이디:", newId);
    
    for(let i=1; i < dancers.length; i++) {
      const dancer = dancers[i];
      await connection.query(
        "INSERT INTO dancer (nid, id, name, color) VALUES (?, ?, ?, ?);",
        [ newId, dancer.id, dancer.name, dancer.color ]
      );
    }

    formations.forEach(async formation => {
      console.log("formation", formation);
      await connection.query(
        "INSERT INTO time (nid, id, start, duration) VALUES (?, ?, ?, ?);",
        [ newId, formation.id, formation.start, formation.duration ]
      );

      for(let i=1; i < formation.positionsAtSameTime.length; i++) {
      	const pos = formation.positionsAtSameTime[i];
        await connection.query(
          "INSERT INTO pos (nid, tid, did, x, y) VALUES (?, ?, ?, ?, ?);",
          [ newId, pos.tid, pos.did, pos.x, pos.y ]
        );
      }
    });
    
    await connection.query(
      "UPDATE note SET hide = true WHERE id = ?;",
      [ originNote.id ]
    );

    res.json({ success: true });
    
  } catch (err) {
    console.error(err);
    next(err);
  }
});

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, done) {
      console.log("여기:", file);
      done(null, "public/assets/music/");
    },
    filename(req, file, done) {
      const filename = `${req.user.id}_${Date.now()}${path.extname(file.originalname)}`;
      done(null, filename);
      req.body.data = { filename };
    },
  }),
  limits: { filesize: 20 * 1024 * 1024 },
});

/* 노래 파일 업로드만 하고 DB 업데이트는 안 함 */
router.post('/musicfile', upload.single('musicFile'), async (req, res, next) => {
  try {
    const { filename, originalname } = req.file;
    
    console.log("파일, 노래:", filename, originalname);
    res.json({ filename, originalname });
    res.redirect('/');
  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.post('/updatemusic', isLoggedIn, async (req, res, next) => {
  try {
    const { noteId, filename, originalname, duration } = req.body;
  	
    console.log(noteId, filename, originalname, duration);
  	console.log(path.basename(originalname, path.extname(originalname)));
    
    let musicname = path.basename(originalname, path.extname(originalname));
    musicname = musicname.slice(0, 40) + path.extname(originalname);
    
    const [rows, fields] = await connection.query(`
      UPDATE note
      SET musicfile = ?, musicname = ?, duration = ?
      WHERE noteId = ? AND uid = ? AND hide = false;`,
      [filename, musicname, duration, noteId, req.user.id]
    );
    
    const [[ noteInfo ]] = await connection.query(`
      SELECT * FROM note WHERE noteId = ? AND hide = false;`,
      [noteId]
    );
    
    res.json({ noteInfo });
    
    res.redirect('/');
  } catch (err) {
    console.error(err);
    next(err);
  }
});

module.exports = router;