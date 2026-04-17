# 진행 상황

## 현재 상태: OAuth 복귀 첫 렌더 hang 해결 · 실기기 검증 나머지 시나리오 + 바구니 작업 진행 중

### 최근 완료 (2026-04-17 pm)
- **OAuth 로그인 복귀 직후 첫 렌더 hang 수정** (`3bdff13`)
  - 증상: 구글 로그인 후 복귀하면 `#app`이 빈 채로 멈춤 (prod는 챗봇만, dev는 완전 백지). 새로고침 시 정상.
  - 원인: PKCE 코드 교환이 수 초 지연되는 구간에서 `getSession`/`getUser`가 resolve 안 됨. `renderAppLayout`이 `innerHTML=''` 후 `await getCurrentUser()`에서 블록 → 아무것도 그려지지 않음.
  - 해법:
    - `main.js`: `await getSession()` 제거, 라우터·챗봇 즉시 시작
    - `auth.js`: `getCurrentUser`에 500ms timeout (지연 시 null 반환 → UI는 로그아웃 상태로 즉시 렌더)
    - `auth.js`: `SIGNED_IN` 이벤트에서 `rerouteCurrent()` 호출 → 세션 뒤늦게 복원 시 자동 재렌더
    - `router.js`: `rerouteCurrent` export (현재 라우트 핸들러 재실행)
  - 모바일 메타 태그 `mobile-web-app-capable` 추가 (`f3953c1`, 표준화, apple- prefix는 호환 유지)

### 최근 완료 (2026-04-17 am)
- **마켓 UI 개선**
  - 모든 마켓 썸네일/미리보기에서 `showWings: false` 강제 (퇴장영역 숨김)
  - 상세 모달 캔버스에 관객석 좌석 strip 추가 — `renderFormationThumbnail`의 `showAudience: 'top'|'bottom'` 옵션, 무대 바깥에 2줄 seat 박스 (`wingBg` 배경)
  - 상세 모달 애니메이션 총 길이 **대형 수 × 1초**로 정규화 (상대 비율 유지)
  - 단일 대형은 재생 컨트롤 숨기고 정적 캔버스만
  - 관객 방향 토글: 이모지 → `관객석 ↓/↑` 텍스트 버튼
  - 모바일 필터 한 줄: `[인원수 드롭다운] [태그 (N)] [정렬 ▼] [관객석 ↓]` — 태그는 모달로, 인원수는 select로 전환
  - 필터 그룹핑: 좌(필터: 인원수+태그) / 우(뷰: 정렬+관객석), `market__filter-left/-right` 구조
- **클라우드/로컬 폴더 모델 — 스캐폴딩 + UI 연결 완료**
  - `db.js` v3: `location` 필드 추가 + 기존 노트 백필(`cloudId` 있으면 cloud)
  - `NoteStore`: createNote/importJSON 기본 `location='local'`
  - `auth.js`: `initAuthHandler` — 명시적 로그아웃/세션 만료 분기, `SIGNED_IN` 시 pending 플래그 기반 자동 동기화, `wasSessionExpired()` 배너 상태
  - `cloudSync`: `uploadNote` → `uploadOnSave` 이름 변경, `moveNoteToCloud/Local`, `downloadAllOnLogin`
  - `Editor`: 저장 시 `location==='cloud'`만 자동 업로드
  - `Dashboard`: 💻 내 기기 / ☁ 클라우드 두 섹션 그리드, 빈 섹션 힌트, 카드 ⋯ 메뉴(이동/삭제 통합, 히트 영역 확장, 리스트뷰에선 카드 오른쪽 중앙에 anchor), 세션 만료 배너, `app:cloud-notes-updated` 이벤트 재렌더
  - 업로드 실패 `↺` 배지: `uploadOnSave`/`moveNoteToCloud` 실패 시 `cloudUploadPending` 플래그 세움, 다음 성공 시 자동 해제. 카드 썸네일 좌상단에 주황색 오버레이
- **사이드바 레이아웃 도입**
  - `components/AppLayout.js` — 220px 고정 사이드바 + 모바일(≤840px) 햄버거 drawer
  - 메뉴: 내 노트 / 마켓 / 커뮤니티(준비 중) / 휴지통
  - Trash 독립 `/trash` 라우트
  - 에디터·랜딩·공유뷰어는 풀스크린 유지

### 결정사항 (유효)
- **마켓 업로드**: 체크박스 대신 연속 범위 선택 (단일 or 최대 5개 연속)
- **태그 vs 설명**: 설명란 제거, 느낌 태그(8종)로 대체. 모양 태그는 빼고 썸네일이 담당
- **제목 유지**: 모양 태그 없으므로 검색·표현 수단으로 제목 필요
- **인증 정책**: 공유 링크는 익명, 마켓 가져오기/업로드만 로그인
- **용어 규칙**: 대형(Formation), 동선 구간(전환 영역), 동선(이동 경로)
- **클라우드 저장**: 음악 미포함, IndexedDB primary, 서버는 백업
- **대시보드 썸네일**: 노트의 `showWings` 설정과 무관하게 카드에선 항상 무대만 (클린 룩)
- **마켓 썸네일/미리보기**: 위와 동일하게 `showWings:false, hideOffstage:true` 강제
- **마켓 상세 모달 캔버스만** 관객석 좌석 표시 (카드 썸네일엔 없음)
- **사이드바 도입**: 대시보드/마켓/휴지통/커뮤니티는 공용 AppLayout, 에디터·랜딩·공유뷰어는 풀스크린
- **클라우드/로컬 폴더 모델 (iCloud 방식)**:
  - 위치가 곧 상태. 상태 아이콘 전부 폐기
  - `💻 내 기기` / `☁ 클라우드` 두 폴더 동시 노출 (평균 10개 이하 전제)
  - 저장마다 자동 업로드 (클라우드 폴더 노트만), 로그인 직후 자동 다운로드
  - 폴더 이동: 로컬→클라우드=업로드, 클라우드→로컬=서버도 삭제(확인 모달)
  - 비로그인 = 클라우드 섹션 숨김, 첫 노트 기본 위치 = 내 기기
  - 로그아웃 구분: 명시적(플래그) = 캐시 삭제 / 세션 만료 = 캐시 유지 + 재로그인 배너
  - 재로그인 시 cloudId 매칭 병합으로 중복 방지

## 다음 할 일
- [x] ~~**사이드바 브라우저 검증**~~ — /dashboard /market /trash 전환, 활성 하이라이트, 모바일 drawer + scrim 확인 완료 (2026-04-17 QA)
- [x] ~~**마켓 브라우저 검증**~~ — 프리셋 목록, 인원수/태그/정렬/관객석 토글, 상세 모달(관객석 strip + 재생 + 점프 칩), 모바일 필터 모달 확인 완료. **버그 1건 수정** (ISSUE-001 상세 모달 재생 컨트롤 잘림 — `b185aca`)
- [x] ~~**폴더 모델 — 비로그인 시나리오**~~ — 💻 내 기기 단독 표시, ↺ 배지 렌더/해제 검증 완료
- [x] ~~**OAuth 로그인 후 첫 렌더 이슈**~~ — hang 원인 파악 및 수정 완료 (`3bdff13`)
- [ ] **폴더 모델 — 실기기 수동 검증 남은 시나리오** (OAuth 기본 flow는 통과)
  - `downloadAllOnLogin` 자동 다운로드 + 충돌 모달 동작
  - 명시적 로그아웃 vs 세션 만료 분기 (캐시 삭제 / 재로그인 배너)
  - 기기 전환 (A에서 수정 → B에서 로그인 → 다운로드)
  - 폴더 이동 (로컬→클라우드 업로드, 클라우드→로컬 확인 모달 + 서버 삭제)
  - 오프라인 편집 → `↺` 배지 → 온라인 복구 후 배지 자동 해제
- [ ] **대열 마켓 2단계 이어서** (바구니 작업 진행 중, 미커밋):
  - 신규 파일: `utils/basket.js`, `store/user-baskets.sql`, `components/PresetDetailModal.js`
  - 수정 중: `pages/Market.js`, `pages/Editor.js`, `locales/*`, `style.css`
  - "내 바구니에 저장" + 에디터 대형 모음 연동
  - 마켓 카드 디자인 대시보드 카드와 차별화 재검토
- [ ] 대열 마켓 3단계: 좋아요/인기순, 검색
- [ ] 공유 뷰어 미세 조정

## QA 리포트
- `.gstack/qa-reports/qa-report-localhost-2026-04-17.md` — 헤들리스 QA 결과, health 95 → 100
- ISSUE-001 수정: 720p 뷰포트에서 상세 모달 body(321px) < player(402px) overflow clip → flex 기반 canvas 축소로 해결

## 컨텍스트
- Supabase: `gflnxqrvzlydyjmokyep.supabase.co` (서울 리전)
- 테이블: shares(공유), market_presets(마켓), notes(클라우드)
- Google OAuth 활성화 완료
- preset_data JSONB 구조: version, note, dancers, dancerCount, formations, tags, thumbnailIndex

