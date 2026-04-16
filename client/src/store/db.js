import Dexie from 'dexie';

export const db = new Dexie('ChoreoNote');

db.version(1).stores({
  notes: '++id, title, editedAt, createdAt',
  dancers: '++id, noteId',
  formations: '++id, noteId, order',
  positions: '++id, formationId, [formationId+dancerId]',
  musicFiles: '++id, noteId',
});

// v2: 클라우드 동기화 필드 추가
db.version(2).stores({
  notes: '++id, title, editedAt, createdAt, cloudId',
  dancers: '++id, noteId',
  formations: '++id, noteId, order',
  positions: '++id, formationId, [formationId+dancerId]',
  musicFiles: '++id, noteId',
});
