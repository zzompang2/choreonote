const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

let connection;

const db = async () => {
  try {
    connection = await mysql.createConnection({
      host     : process.env.MYSQL_HOST,
      user     : process.env.MYSQL_USER,
      password : process.env.MYSQL_PW,
      database : 'choreonote'
    });
    executeQuerys();
  } catch (err) {
    console.error(err);
  }
}
db();

function executeQuerys() {
  const dropQuerys = [
    // `DROP TABLE IF EXISTS user;`,
    `DROP TABLE IF EXISTS note;`,
    `DROP TABLE IF EXISTS dancer;`,
    `DROP TABLE IF EXISTS time;`,
    `DROP TABLE IF EXISTS pos;`,
    `DROP TABLE IF EXISTS community;`,
    `DROP TABLE IF EXISTS community_like;`,
  ];

  const createQuerys = [
    `
    CREATE TABLE IF NOT EXISTS user (
    id        INT NOT NULL AUTO_INCREMENT,
    service   CHAR(2) NOT NULL,
    snsId     CHAR(30),
    email     CHAR(40) NOT NULL UNIQUE,
    nick      CHAR(20) NOT NULL DEFAULT "",
    password  CHAR(100),
    createdAt DATETIME NOT NULL DEFAULT now(),
    PRIMARY KEY(id)
    );`,
    `
    CREATE TABLE IF NOT EXISTS note (
    id        INT NOT NULL AUTO_INCREMENT,
    noteId    INT,
    uid       INT NOT NULL,
    title     VARCHAR(30) NOT NULL,
    musicfile VARCHAR(30),
    musicname VARCHAR(50),
    duration  INT NOT NULL DEFAULT 30000,
    editedAt  DATETIME NOT NULL DEFAULT now(),
    createdAt DATETIME NOT NULL DEFAULT now(),
    hide      BOOLEAN DEFAULT false,
    PRIMARY KEY(id),
    FOREIGN KEY(uid) REFERENCES user(id)
    );`,
    `
    CREATE TABLE IF NOT EXISTS dancer (
    nid       INT NOT NULL,
    id        INT NOT NULL,
    name      VARCHAR(20),
    color   	CHAR(7) NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT now(),
    PRIMARY KEY(nid, id),
    FOREIGN KEY(nid) REFERENCES note(id)
    );`,
    `
    CREATE TABLE IF NOT EXISTS time (
    nid       INT NOT NULL,
    id        INT NOT NULL,
    start     INT NOT NULL,
    duration  INT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT now(),
    PRIMARY KEY(nid, id),
    FOREIGN KEY(nid) REFERENCES note(id)
    );`,
    `
    CREATE TABLE IF NOT EXISTS pos (
    nid       INT NOT NULL,
    tid       INT NOT NULL,
    did       INT NOT NULL,
    x         INT NOT NULL,
    y         INT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT now(),
    PRIMARY KEY(nid, tid, did),
    FOREIGN KEY(nid, tid) REFERENCES time(nid, id),
    FOREIGN KEY(nid, did) REFERENCES dancer(nid, id)
    );`,
    `
    CREATE TABLE IF NOT EXISTS community (
    id        INT NOT NULL AUTO_INCREMENT,
    uid       INT NOT NULL,
    body      VARCHAR(510) NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT now(),
    hide      BOOLEAN DEFAULT false,
    PRIMARY KEY(id),
    FOREIGN KEY(uid) REFERENCES user(id)
    );`,
    `
    CREATE TABLE IF NOT EXISTS community_like (
    cid       INT NOT NULL,
    uid       INT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT now(),
    PRIMARY KEY(cid, uid),
    FOREIGN KEY(cid) REFERENCES community(id),
    FOREIGN KEY(uid) REFERENCES user(id)
    );`,
  ];

  dropQuerys.reverse().forEach(async query => await connection.query(query));
  createQuerys.forEach(async query => await connection.query(query));
  
  console.log("end query");
}
