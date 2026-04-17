# ChoreoNote-web

> **⚠️ 필수**: 대화 시작 시 `progress.md`를 **가장 먼저** 읽고, 이전 세션 컨텍스트를 파악한 상태에서 응답할 것. 사용자가 묻기 전에 proactive하게 읽어야 한다.

안무 대형(포메이션) 노트 웹앱. 무대 위 댄서 배치를 타임라인으로 관리하고, 전환 애니메이션을 재생/영상 내보내기할 수 있다.

## 기술 스택
- **프론트엔드**: Vanilla JS (SPA, 프레임워크 없음), Canvas 2D 렌더링
- **저장소**: IndexedDB (Dexie.js) — 클라이언트 전용
- **서버**: Supabase (서울 리전, Free) — 공유 링크, 대형 마켓, Google OAuth, 추후 통계/리뷰/동기화
- **빌드**: Vite 5 + vite-plugin-pwa (Workbox generateSW)
- **배포**: GitHub Pages (정적)
- **PWA**: 오프라인 지원, 전체 에셋 프리캐시, 업데이트 알림

## 프론트엔드 핵심 파일 (`client/src/`)

| 영역 | 파일 | 역할 |
|------|------|------|
| 진입점 | `main.js` | 라우터 등록 (`/`, `/dashboard`, `/edit`, `/share`, `/market`, `/trash`) + 전역 auth 핸들러 초기화 |
| 페이지 | `pages/Editor.js` | 에디터 — 캔버스, 사이드바, 타임라인, 플레이어바 통합 |
| | `pages/Dashboard.js` | 노트 목록, 생성/삭제/정렬/가져오기 (AppLayout 사용) |
| | `pages/Landing.js` | 랜딩 페이지 |
| | `pages/Viewer.js` | 공유 재생 전용 뷰어 (읽기 전용, Supabase 조회) |
| | `pages/Market.js` | 대형 갤러리 — `[전체][내 컬렉션]` 탭, 필터(인원수·태그·관객방향), 업로드 (Google OAuth, AppLayout 사용) |
| | `pages/Trash.js` | 휴지통 — 삭제된 노트 복원/영구삭제 (독립 라우트, AppLayout 사용) |
| 렌더링 | `renderer/StageRenderer.js` | Canvas 무대 렌더링 (댄서, 그리드, 경로, 2D/3D) |
| 엔진 | `engine/PlaybackEngine.js` | Web Audio 재생, 시간 동기화, 선형 보간 |
| | `engine/VideoExporter.js` | captureStream + MediaRecorder 영상 내보내기 |
| 저장 | `store/NoteStore.js` | 노트 CRUD, 대형/댄서/포지션 관리 (Dexie 트랜잭션) |
| | `store/db.js` | Dexie 스키마 v3 (notes에 `location` 필드 — `'local'` \| `'cloud'`) |
| | `store/supabase.js` | Supabase 클라이언트 초기화 (PKCE auth flow) |
| | `store/cloud-notes.sql` | Supabase notes 테이블 DDL (참조용) |
| | `store/user-baskets.sql` | Supabase user_baskets 테이블 DDL (컬렉션, preset_id 참조 + RLS) |
| 유틸 | `utils/constants.js` | 무대 크기, 그리드, 타임라인 상수 |
| | `utils/history.js` | Undo/Redo 스택 (50단계, JSON 스냅샷) |
| | `utils/formations.js` | 대형 프리셋, 보간 계산 |
| | `utils/router.js` | hash 기반 SPA 라우터 + `rerouteCurrent` (auth 변경 시 재렌더용) |
| | `utils/theme.js` | 다크/라이트 모드 |
| | `utils/toast.js` | 토스트 알림 |
| | `utils/share.js` | 공유 링크 생성/조회 (Supabase) |
| | `utils/auth.js` | Google OAuth + 전역 `initAuthHandler` (SIGNED_IN→`rerouteCurrent`+자동 다운로드, SIGNED_OUT→플래그 분기), `getCurrentUser` 500ms timeout(세션 지연 시 null 반환), 세션 만료 배너 API |
| | `utils/market.js` | 대형 갤러리 preset CRUD API (Supabase) |
| | `utils/basket.js` | 컬렉션 CRUD API — `addToBasket`/`removeFromBasket`/`fetchBasket`/`isInBasket` (user_baskets) |
| | `utils/thumbnail.js` | 캔버스 썸네일 렌더링 (Dashboard/Market 공용) |
| | `utils/cloudSync.js` | 폴더 모델 API (`uploadOnSave`/`downloadAllOnLogin`/`moveNoteToCloud`/`moveNoteToLocal`) + 충돌 감지/해결 |
| 컴포넌트 | `components/AppLayout.js` | 공용 셸 (220px 사이드바 + 모바일 drawer) — Dashboard/Market/Trash에서 사용, 에디터·랜딩·공유뷰어는 풀스크린 |
| | `components/ChatBot.js` | FAQ 챗봇 (FAB + 사이드바 임베드, 팁 배너, 자동완성) |
| | `components/ConflictModal.js` | 클라우드 충돌 해결 모달 (덮어쓰기/서버교체/둘다유지) |
| | `components/PresetDetailModal.js` | 갤러리 preset 상세 모달 (애니메이션 미리보기 + 액션) — `mode: 'market'` (저장) / `'basket'` (제거) 분기 |
| 스타일 | `style.css` | 전역 CSS (다크/라이트 변수 포함) |

## 데이터 모델 (IndexedDB, v3)
- **notes**: id, title, musicName, musicBlobId, duration, settings(JSON), cloudId, cloudUpdatedAt, **location**(`'local'`|`'cloud'`), cloudUploadPending(업로드 실패 시 true, 성공 시 자동 해제)
- **dancers**: id, noteId, name, color, order, shape, size
- **formations**: id, noteId, startTime, duration, order
- **positions**: id, formationId, dancerId, x, y, angle, waypoints
- **musicFiles**: id, noteId, blob

## 데이터 모델 (Supabase)
- **shares**: id(8자), title, note_json, view_count
- **market_presets**: id(UUID), user_id, title, description, dancer_count, formation_count, preset_data(JSONB), download_count, created_at
- **notes**: id(UUID), user_id, title, note_json(JSONB), music_name, created_at, updated_at (RLS: 본인만 접근)
- **user_baskets**: id(UUID), user_id, preset_id(→market_presets ON DELETE CASCADE), added_at — 컬렉션은 참조 모델 (원본 preset 삭제 시 자동 정리), `UNIQUE(user_id, preset_id)`

## 좌표계
- 무대 중앙이 (0, 0), 오른쪽 +x, 아래쪽 +y
- Canvas 렌더링 시 HALF_W/HALF_H + WING_SIZE 만큼 오프셋
- 퇴장 영역(wing): 무대 바깥 80px 구역

## 주요 패턴
- UI는 DOM 직접 조작 (`innerHTML` + 이벤트 바인딩), 컴포넌트 프레임워크 없음
- 상태 변경 → `renderStage()` / `renderTimeline()` 등 수동 호출로 반영
- Undo/Redo: 변경 전 전체 포지션 스냅샷을 JSON으로 저장
- 타임라인: 1px = `PIXEL_PER_SEC`(40) / 1000 ms. 스냅/시크 단위 `TIME_UNIT`=125ms(1/8초), 대형 최소 길이 `MIN_FORMATION_DURATION`=250ms, 기본 길이 `DEFAULT_FORMATION_DURATION`=1000ms
- iOS Safari 오디오: `PlaybackEngine.play()`는 async — `audioContext.resume()` await 후 `sourceNode.start()`. `_starting` 플래그로 이중 탭 레이스 차단. `navigator.audioSession.type='playback'` 로 iOS 16.4+ 무음 스위치 무시
- PWA safe-area: `viewport-fit=cover` + `editor__header`/`app-sidebar`/`app-topbar`에 `env(safe-area-inset-*)` 반영. standalone 모드에선 좌측 padding 최소 60px (iPad Stage Manager 창 컨트롤 간섭 방지)
- **OAuth 복귀 시 UI는 세션 복원에 블록되지 않음**: PKCE 코드 교환이 수 초 지연될 수 있어 `getCurrentUser`/`getSession`에 UI 렌더를 기다리게 하면 빈 화면. 즉시 로그아웃 상태로 그린 뒤 `SIGNED_IN`에서 `rerouteCurrent`로 재렌더.

## 개발 시 참고
- `TODO.md`에 우선순위별 작업 목록 있음
- `progress.md`가 있으면 대화 시작 시 읽어서 이전 세션 컨텍스트를 파악할 것
- 한국어 UI, 코드 주석도 한국어 혼용
- 테스트 없음 (유닛 테스트 도입 예정)
