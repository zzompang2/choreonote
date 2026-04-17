# 진행 상황

## 현재 상태: 에디터 P2 버그 2건 수정 · 바구니 작업(대열 마켓 2단계) 미커밋 재개 대기

### 최근 완료 (2026-04-17 pm·후반)
- **에디터 P2 버그 2건 수정** (`4236250`)
  - 버그 1: 새 대형 생성 시 `calcPositionsAt(currentMs)`에서 x/y만 복사하고 angle이 누락 → 각도가 초기화됨. positions에 `angle: cp.angle || 0` 추가.
  - 버그 2: 대형 삭제 후 `Math.min(selectedFormation, length-1)` 단순 클램프 → 타임마커와 무관한 대형이 선택됨. `findFormationIdxAtTime(formations, ms)` 헬퍼 추가 (박스 내부면 해당 대형, gap이면 직전 대형). toolbar `-` + 키보드 Delete 양쪽 적용.
  - 커밋 분리 주의: 바구니 작업이 Editor.js에 섞여있어 HEAD 리셋 → 3개 edit 재적용 → 커밋 → 전체 파일 복원 방식으로 분리함.

### 최근 완료 (2026-04-17 pm·전반)
- **OAuth 로그인 복귀 직후 첫 렌더 hang 수정** (`3bdff13`)
  - 원인: PKCE 코드 교환이 수 초 지연되는 구간에서 `getSession`/`getUser`가 resolve 안 됨. `renderAppLayout`이 `innerHTML=''` 후 `await getCurrentUser()`에서 블록 → 아무것도 그려지지 않음.
  - 해법: `main.js`에서 `await getSession()` 제거, `getCurrentUser`에 500ms timeout, `SIGNED_IN` 이벤트에서 `rerouteCurrent()`.
  - 모바일 메타 태그 `mobile-web-app-capable` 추가 (`f3953c1`).

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
- [ ] **대열 마켓 2단계 이어서** (바구니 작업 진행 중, **미커밋 상태**):
  - 신규 파일: `utils/basket.js`, `store/user-baskets.sql`, `components/PresetDetailModal.js`
  - 수정 중: `pages/Market.js`, `pages/Editor.js`(Editor는 에디터 사이드바 내 바구니 섹션 + `_renderBasket` / `applyBasketItem` / `pickAndMatch` 로직), `locales/*`, `style.css`
  - "내 바구니에 저장" + 에디터 대형 모음 연동
  - 마켓 카드 디자인 대시보드 카드와 차별화 재검토
- [ ] **폴더 모델 — 실기기 수동 검증 남은 시나리오** (OAuth 기본 flow는 통과)
  - `downloadAllOnLogin` 자동 다운로드 + 충돌 모달 동작
  - 명시적 로그아웃 vs 세션 만료 분기 (캐시 삭제 / 재로그인 배너)
  - 기기 전환 (A에서 수정 → B에서 로그인 → 다운로드)
  - 폴더 이동 (로컬→클라우드 업로드, 클라우드→로컬 확인 모달 + 서버 삭제)
  - 오프라인 편집 → `↺` 배지 → 온라인 복구 후 배지 자동 해제
- [ ] 대열 마켓 3단계: 좋아요/인기순, 검색
- [ ] 공유 뷰어 미세 조정

## QA 리포트
- `.gstack/qa-reports/qa-report-localhost-2026-04-17.md` — 헤들리스 QA 결과, health 95 → 100
- ISSUE-001 수정: 720p 뷰포트에서 상세 모달 body(321px) < player(402px) overflow clip → flex 기반 canvas 축소로 해결

## 컨텍스트
- Supabase: `gflnxqrvzlydyjmokyep.supabase.co` (서울 리전)
- 테이블: shares(공유), market_presets(마켓), notes(클라우드), user_baskets(바구니 — 미배포)
- Google OAuth 활성화 완료
- preset_data JSONB 구조: version, note, dancers, dancerCount, formations, tags, thumbnailIndex
- `findFormationIdxAtTime(formations, ms)` 헬퍼는 `Editor.js` 모듈 스코프 (line 46 부근) — 다른 곳에서도 재사용 여지 있음
