import { db } from './db.js';

const DEFAULT_DANCERS = [
  { name: 'Ham', color: '#EF4444', order: 0 },
  { name: 'Chance', color: '#3B82F6', order: 1 },
  { name: 'Luna', color: '#22C55E', order: 2 },
];

// Formation 1: horizontal line  ○ ○ ○
const DEFAULT_POSITIONS = [
  [
    { dancerIndex: 0, x: -60, y: 0 },
    { dancerIndex: 1, x: 0, y: 0 },
    { dancerIndex: 2, x: 60, y: 0 },
  ],
];

const DEFAULT_FORMATIONS = [
  { startTime: 0, duration: 1000, order: 0 },
];

export const NoteStore = {
  async createNote(title = '새 안무 노트') {
    // Auto-number if title already exists
    const allNotes = await db.notes.toArray();
    const existingTitles = new Set(allNotes.map(n => n.title));
    if (existingTitles.has(title)) {
      let n = 2;
      while (existingTitles.has(`${title} ${n}`)) n++;
      title = `${title} ${n}`;
    }

    return db.transaction('rw', db.notes, db.dancers, db.formations, db.positions, async () => {
      const now = new Date();
      const noteId = await db.notes.add({
        title,
        musicName: null,
        musicBlobId: null,
        duration: 30000,
        location: 'local',
        createdAt: now,
        editedAt: now,
      });

      const dancerIds = [];
      for (const d of DEFAULT_DANCERS) {
        const did = await db.dancers.add({ noteId, ...d });
        dancerIds.push(did);
      }

      for (let fi = 0; fi < DEFAULT_FORMATIONS.length; fi++) {
        const fid = await db.formations.add({ noteId, ...DEFAULT_FORMATIONS[fi] });
        const posData = DEFAULT_POSITIONS[fi] || [];
        for (let di = 0; di < dancerIds.length; di++) {
          const pos = posData.find(p => p.dancerIndex === di);
          await db.positions.add({
            formationId: fid,
            dancerId: dancerIds[di],
            x: pos ? pos.x : 0,
            y: pos ? pos.y : 0,
          });
        }
      }

      return noteId;
    });
  },

  async loadNote(noteId) {
    const note = await db.notes.get(noteId);
    if (!note) return null;

    const dancers = await db.dancers.where('noteId').equals(noteId).sortBy('order');
    const formations = await db.formations.where('noteId').equals(noteId).sortBy('order');

    const formationsWithPositions = await Promise.all(
      formations.map(async (f) => {
        const positions = await db.positions.where('formationId').equals(f.id).toArray();
        return { ...f, positions };
      })
    );

    let musicBlob = null;
    const musicFile = await db.musicFiles.where('noteId').equals(noteId).first();
    if (musicFile) {
      musicBlob = musicFile.blob;
    }

    return {
      note,
      dancers,
      formations: formationsWithPositions,
      musicBlob,
    };
  },

  async saveNote(noteId, { dancers, formations, stageWidth, stageHeight, dancerScale, audienceDirection, dancerShape, gridGap, showWings, markers, duration }) {
    return db.transaction(
      'rw',
      db.notes, db.dancers, db.formations, db.positions,
      async () => {
        const noteUpdate = { editedAt: new Date() };
        if (stageWidth != null) noteUpdate.stageWidth = stageWidth;
        if (stageHeight != null) noteUpdate.stageHeight = stageHeight;
        if (dancerScale != null) noteUpdate.dancerScale = dancerScale;
        if (audienceDirection != null) noteUpdate.audienceDirection = audienceDirection;
        if (dancerShape != null) noteUpdate.dancerShape = dancerShape;
        if (gridGap != null) noteUpdate.gridGap = gridGap;
        if (showWings != null) noteUpdate.showWings = showWings;
        if (markers != null) noteUpdate.markers = markers;
        if (duration != null) noteUpdate.duration = duration;
        await db.notes.update(noteId, noteUpdate);

        // Clear and rewrite dancers
        await db.dancers.where('noteId').equals(noteId).delete();
        const dancerIdMap = new Map(); // old index -> new db id

        for (let i = 0; i < dancers.length; i++) {
          const d = dancers[i];
          const newId = await db.dancers.add({
            noteId,
            name: d.name,
            color: d.color,
            order: i,
          });
          dancerIdMap.set(i, newId);
        }

        // Clear and rewrite formations + positions
        const oldFormations = await db.formations.where('noteId').equals(noteId).toArray();
        for (const f of oldFormations) {
          await db.positions.where('formationId').equals(f.id).delete();
        }
        await db.formations.where('noteId').equals(noteId).delete();

        for (let i = 0; i < formations.length; i++) {
          const f = formations[i];
          const fid = await db.formations.add({
            noteId,
            startTime: f.startTime,
            duration: f.duration,
            order: i,
          });
          for (const pos of f.positions) {
            const newDancerId = dancerIdMap.get(pos.dancerIndex);
            if (newDancerId !== undefined) {
              await db.positions.add({
                formationId: fid,
                dancerId: newDancerId,
                x: pos.x,
                y: pos.y,
                angle: pos.angle || 0,
                waypoints: pos.waypoints || undefined,
              });
            }
          }
        }
      }
    );
  },

  async deleteNote(noteId) {
    // Soft delete: mark with deletedAt timestamp
    await db.notes.update(noteId, { deletedAt: new Date() });
  },

  async permanentlyDeleteNote(noteId) {
    return db.transaction(
      'rw',
      db.notes, db.dancers, db.formations, db.positions, db.musicFiles,
      async () => {
        const formations = await db.formations.where('noteId').equals(noteId).toArray();
        for (const f of formations) {
          await db.positions.where('formationId').equals(f.id).delete();
        }
        await db.formations.where('noteId').equals(noteId).delete();
        await db.dancers.where('noteId').equals(noteId).delete();
        await db.musicFiles.where('noteId').equals(noteId).delete();
        await db.notes.delete(noteId);
      }
    );
  },

  async restoreNote(noteId) {
    await db.notes.update(noteId, { deletedAt: undefined });
  },

  async getDeletedNotes() {
    const notes = await db.notes.toArray();
    return notes.filter(n => n.deletedAt).sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  },

  async purgeExpiredNotes(days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const notes = await db.notes.toArray();
    for (const note of notes) {
      if (note.deletedAt && new Date(note.deletedAt) < cutoff) {
        await this.permanentlyDeleteNote(note.id);
      }
    }
  },

  async updateNoteTitle(noteId, title) {
    await db.notes.update(noteId, { title, editedAt: new Date() });
  },

  async saveMusicFile(noteId, blob, name, duration) {
    await db.transaction('rw', db.musicFiles, db.notes, async () => {
      await db.musicFiles.where('noteId').equals(noteId).delete();
      await db.musicFiles.add({ noteId, blob, name, size: blob.size });
      await db.notes.update(noteId, { musicName: name, duration, editedAt: new Date() });
    });
  },

  async getAllNotes(orderBy = 'editedAt') {
    const notes = await db.notes.toArray();
    const active = notes.filter(n => !n.deletedAt);
    active.sort((a, b) => {
      if (orderBy === 'title') return a.title.localeCompare(b.title);
      return new Date(b[orderBy]) - new Date(a[orderBy]);
    });
    return active;
  },

  async exportJSON(noteId) {
    const data = await this.loadNote(noteId);
    if (!data) return null;

    const exportData = {
      version: 2,
      note: {
        title: data.note.title, duration: data.note.duration, musicName: data.note.musicName,
        stageWidth: data.note.stageWidth, stageHeight: data.note.stageHeight,
        dancerScale: data.note.dancerScale, audienceDirection: data.note.audienceDirection,
        dancerShape: data.note.dancerShape, gridGap: data.note.gridGap,
        showWings: data.note.showWings,
        markers: data.note.markers || [],
      },
      dancers: data.dancers.map((d) => ({ name: d.name, color: d.color })),
      formations: data.formations.map((f) => ({
        startTime: f.startTime,
        duration: f.duration,
        positions: f.positions.map((p) => ({ dancerIndex: data.dancers.findIndex((d) => d.id === p.dancerId), x: p.x, y: p.y, angle: p.angle || 0, waypoints: p.waypoints || undefined })),
      })),
    };

    return JSON.stringify(exportData, null, 2);
  },

  async importJSON(jsonString) {
    const data = JSON.parse(jsonString);

    if (data.version === 2) {
      return this._importV2(data);
    }
    // Legacy format: [dancers, formations, noteInfo] (sparse array)
    if (Array.isArray(data)) {
      return this._importLegacy(data);
    }
    throw new Error('지원하지 않는 파일 형식입니다.');
  },

  async _importV2(data) {
    return db.transaction('rw', db.notes, db.dancers, db.formations, db.positions, async () => {
      const now = new Date();
      const noteId = await db.notes.add({
        title: data.note.title,
        musicName: data.note.musicName,
        musicBlobId: null,
        duration: data.note.duration || 30000,
        stageWidth: data.note.stageWidth || undefined,
        stageHeight: data.note.stageHeight || undefined,
        dancerScale: data.note.dancerScale || undefined,
        audienceDirection: data.note.audienceDirection || undefined,
        dancerShape: data.note.dancerShape || undefined,
        gridGap: data.note.gridGap || undefined,
        showWings: data.note.showWings != null ? data.note.showWings : undefined,
        markers: data.note.markers || undefined,
        location: 'local',
        createdAt: now,
        editedAt: now,
      });

      const dancerIds = [];
      for (let i = 0; i < data.dancers.length; i++) {
        const d = data.dancers[i];
        const did = await db.dancers.add({ noteId, name: d.name, color: d.color, order: i });
        dancerIds.push(did);
      }

      for (let i = 0; i < data.formations.length; i++) {
        const f = data.formations[i];
        const fid = await db.formations.add({ noteId, startTime: f.startTime, duration: f.duration, order: i });
        for (const pos of f.positions) {
          if (pos.dancerIndex >= 0 && pos.dancerIndex < dancerIds.length) {
            await db.positions.add({ formationId: fid, dancerId: dancerIds[pos.dancerIndex], x: pos.x, y: pos.y, angle: pos.angle || 0, waypoints: pos.waypoints || undefined });
          }
        }
      }

      return noteId;
    });
  },

  // Legacy format: [dancers(sparse), formations, noteInfo]
  async _importLegacy(data) {
    const [rawDancers, rawFormations, rawNoteInfo] = data;

    // Filter out null entries from sparse array (index 0 is null)
    const dancers = rawDancers.filter((d) => d !== null && d !== undefined);
    const dancerIdRemap = new Map();
    rawDancers.forEach((d, i) => {
      if (d !== null && d !== undefined) {
        dancerIdRemap.set(d.id || i, dancers.indexOf(d));
      }
    });

    const formations = rawFormations.map((f) => {
      const positions = [];
      if (f.positionsAtSameTime) {
        f.positionsAtSameTime.forEach((pos, did) => {
          if (pos !== null && pos !== undefined) {
            const newIndex = dancerIdRemap.get(did);
            if (newIndex !== undefined) {
              positions.push({ dancerIndex: newIndex, x: pos.x, y: pos.y });
            }
          }
        });
      }
      return { startTime: f.start, duration: f.duration, positions };
    });

    const v2Data = {
      note: {
        title: rawNoteInfo?.title || '가져온 노트',
        duration: rawNoteInfo?.duration || 30000,
        musicName: rawNoteInfo?.musicname || null,
      },
      dancers: dancers.map((d) => ({ name: d.name, color: d.color })),
      formations,
    };

    return this._importV2(v2Data);
  },

  async getThumbnailData(noteId) {
    const dancers = await db.dancers.where('noteId').equals(noteId).sortBy('order');
    if (dancers.length === 0) return null;

    const firstFormation = await db.formations.where('noteId').equals(noteId).sortBy('order');
    if (firstFormation.length === 0) return null;

    const positions = await db.positions.where('formationId').equals(firstFormation[0].id).toArray();
    const note = await db.notes.get(noteId);

    return {
      dancers,
      positions,
      stageWidth: note?.stageWidth || 600,
      stageHeight: note?.stageHeight || 400,
      dancerShape: note?.dancerShape || 'pentagon',
      dancerScale: note?.dancerScale || 1.0,
      showWings: note?.showWings === true,
    };
  },

  async requestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
      return navigator.storage.persist();
    }
    return false;
  },
};
