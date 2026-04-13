# ChoreoNote-web

안무 대형(포메이션) 노트 웹앱. 무대 위 댄서 배치를 타임라인으로 관리하고, 전환 애니메이션을 재생/영상 내보내기할 수 있다.

## 기술 스택
- **프론트엔드**: Vanilla JS (SPA, 프레임워크 없음), Canvas 2D 렌더링
- **저장소**: IndexedDB (Dexie.js) — 클라이언트 전용, 서버 DB 미사용
- **빌드**: 없음 (ES modules + importmap, 번들러 없음)
- **배포**: GitHub Pages (정적)
- **서버**: Express + Nunjucks (레거시, 현재 사용 안 함)

## 프론트엔드 핵심 파일 (`client/src/`)

| 영역 | 파일 | 역할 |
|------|------|------|
| 진입점 | `main.js` | 라우터 등록 (`/`, `/dashboard`, `/edit`) |
| 페이지 | `pages/Editor.js` | 에디터 — 캔버스, 사이드바, 타임라인, 플레이어바 통합 |
| | `pages/Dashboard.js` | 노트 목록, 생성/삭제/정렬/가져오기 |
| | `pages/Landing.js` | 랜딩 페이지 |
| 렌더링 | `renderer/StageRenderer.js` | Canvas 무대 렌더링 (댄서, 그리드, 경로, 2D/3D) |
| 엔진 | `engine/PlaybackEngine.js` | Web Audio 재생, 시간 동기화, 선형 보간 |
| | `engine/VideoExporter.js` | captureStream + MediaRecorder 영상 내보내기 |
| 저장 | `store/NoteStore.js` | 노트 CRUD, 대형/댄서/포지션 관리 (Dexie 트랜잭션) |
| | `store/db.js` | Dexie 스키마 (notes, dancers, formations, positions, musicFiles) |
| 유틸 | `utils/constants.js` | 무대 크기, 그리드, 타임라인 상수 |
| | `utils/history.js` | Undo/Redo 스택 (50단계, JSON 스냅샷) |
| | `utils/formations.js` | 대형 프리셋, 보간 계산 |
| | `utils/router.js` | hash 기반 SPA 라우터 |
| | `utils/theme.js` | 다크/라이트 모드 |
| | `utils/toast.js` | 토스트 알림 |
| 스타일 | `style.css` | 전역 CSS (다크/라이트 변수 포함) |

## 데이터 모델 (IndexedDB)
- **notes**: id, title, musicName, musicBlobId, duration, settings(JSON)
- **dancers**: id, noteId, name, color, order, shape, size
- **formations**: id, noteId, startTime, duration, order
- **positions**: id, formationId, dancerId, x, y, angle, waypoints
- **musicFiles**: id, noteId, blob

## 좌표계
- 무대 중앙이 (0, 0), 오른쪽 +x, 아래쪽 +y
- Canvas 렌더링 시 HALF_W/HALF_H + WING_SIZE 만큼 오프셋
- 퇴장 영역(wing): 무대 바깥 80px 구역

## 주요 패턴
- UI는 DOM 직접 조작 (`innerHTML` + 이벤트 바인딩), 컴포넌트 프레임워크 없음
- 상태 변경 → `renderStage()` / `renderTimeline()` 등 수동 호출로 반영
- Undo/Redo: 변경 전 전체 포지션 스냅샷을 JSON으로 저장
- 타임라인: 1px = `PIXEL_PER_SEC`(40) / 1000 ms, 최소 시간 단위 250ms

## 개발 시 참고
- `TODO.md`에 우선순위별 작업 목록 있음
- 한국어 UI, 코드 주석도 한국어 혼용
- 테스트 없음 (유닛 테스트 도입 예정)
