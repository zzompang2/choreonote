# 진행 상황

## 현재 상태: 유저 테스트 피드백 실기기 검증 완료 — 신규 회귀 버그 4건도 같은 세션에 수정

### 최근 완료 (2026-04-19~20 — 이번 세션)
**실기기 검증 (데스크톱)** — 유저 테스트 피드백 P1~P2 9건 모두 통과:
- 영상 내보내기 옵션/1080p 반영
- 재생 → 이탈 → 재진입 노래 중첩 해소
- 재생 중 캔버스 드래그 자동 정지 + 정지 버튼 먹통 시나리오
- ⟳ 2-step 재시작
- 노트 재진입 시 댄서 표기·모양·격자 UI 복원
- F/⤢ 집중 모드
- 모바일 실기기 집중 모드만 아직 안 돌림

**검증 중 발견된 신규 버그 4건 수정**:
- `a14392b` — 에디터 새로고침 시 레일 사이드바 안 열리는 버그. OAuth 복귀 `SIGNED_IN` → `rerouteCurrent`가 첫 `renderEditor`의 `await loadAudio` 도중 두 번째 `renderEditor`를 실행 → setups 이중 바인딩 → `openPanel` 2회 호출로 토글 상쇄. `_renderToken` 가드 도입 (await 재개 직후 토큰 바뀌면 폐기 + `localEngine.destroy()`)
- `37196b3` — 재생 중 전환 영역에서 stage 클릭 시 이전 대형이 편집되던 버그. `onFormationChange`는 `idx>=0`일 때만 `selectedFormation`을 갱신해 전환 영역에서도 마지막 대형 인덱스가 남음. stage `pointerdown` auto-pause 후 `selectedFormation`을 현재 `currentMs` 기준으로 재계산.
- `8ad703a` — 사각형·원형 마킹 빗금이 45°가 아님. 공식이 `h-d` vs `w-d` 혼동 + 루프 범위 과잉. `y=x+c` (c∈[-w,h]) 기준으로 재작성. 2D/3D 모두.
- `cdb15ff` — 세 건 한꺼번에:
  1. 스테이지 가로 470~765px에서 오른쪽으로 넘침. `.stage-canvas { width:100% !important }`가 `fitStage` inline style을 덮어써 canvas가 intrinsic 760px로 렌더. `!important` 제거.
  2. 데스크톱 집중 모드에서 player-bar가 상단에 뜸. header 숨김 → auto-placement로 row 1 차지. `.player-bar`에 `grid-row: 3`, `.editor__timeline-wrap`에 `grid-row: 4` 명시.
  3. 집중 모드 진입 시 스테이지가 화면에 안 채워짐. grid-template-columns 0.25s transition 중간값을 rAF가 읽음 → 260ms 지연 fit 추가.
  4. 집중 모드 편집 차단: `renderer.focusMode` 플래그 추가, `_onMouseDown`/`pointerdown`/`touchstart`(단일 터치) 진입 차단 (핀치줌은 허용). 진입 시 선택된 댄서·대형·전환 클리어 + UI 재그리기. 편집 툴바(undo/redo 등) CSS로 숨김.

**Bug #1 (음악 계속 재생) 해결 경로 메모**: PWA 서비스워커 캐시가 오래된 번들 제공. 로컬 dev 서버(localhost:5174)에서는 정상. 배포 후 유저가 "업데이트" 배너 눌러야 최신 코드 반영.

### 이전 세션 결정 — 유지
- **시각 언어**: 노트=공책(크림톤+괘선+dog-ear), 갤러리/컬렉션=포스트잇(5색 파스텔+기울어짐)
- **타임라인**: `TIME_UNIT`=125ms (1/8초), `MIN_FORMATION_DURATION`=250, `DEFAULT`=1000
- **iOS/모바일 오디오**: `PlaybackEngine.play()` async + `_starting` 플래그, 무음 스위치 무시
- **PWA safe-area**: standalone 모드에선 좌측 padding 최소 60px (iPad Stage Manager 창 컨트롤 간섭)
- **마켓 업로드**: 연속 범위 선택 (단일 or 최대 5개)
- **인증 정책**: 공유 익명, 갤러리 업로드/가져오기만 로그인
- **클라우드**: 음악 미포함, IndexedDB primary
- **컬렉션**: 참조 저장(preset_id), 에디터에서 단일/2-대형만 적용

### 게임형 미션 시스템 — 디자인 세션 보류 (2026-04-18)
- 사이드바 메뉴 "🎯 미션" 항상 노출 (1-a 확정)
- `UNLOCK_ORDER` 확장 범위: 대형 모음, 마킹, 경유점, 퇴장영역, 대형 갤러리 → 8종?
- 기존 사용자 localStorage 전원 초기화 OK
- 재개 시 6축 순서로: (1) 철학(a+b 하이브리드) → (2) 클리어 판정 → (3) 진행 가시화 → (4) 미션 센터 UI 위치 → (5) 자물쇠 재설계 → (6) 확장 범위

## 다음 할 일
- [ ] **모바일 실기기 검증** — 집중 모드(F키 대신 ⤢ 버튼), 레일/사이드바 등 이번 세션 수정분 포함
- [ ] **영상 내보내기 관객석 흰색 누적 재현** — 3D 경로 의심. 재현 시나리오 (옵션 조합) 확보 후 수정
- [ ] **게임형 미션 센터 디자인 세션** 재개 (6축 순서)
- [ ] **컬렉션 실기기 검증** — 모달 저장/제거, [내 컬렉션] 탭 필터, 에디터 단일/멀티 적용, 댄서 수 미스매치
- [ ] **폴더 모델 실기기 검증 남은 시나리오** — `downloadAllOnLogin` + 충돌 모달, 명시적 vs 만료 분기, 기기 전환, 폴더 이동, 오프라인 복구 `↺` 라운드트립
- [ ] **iPad PWA safe-area 실기기** — standalone 좌측 60px 패딩이 Stage Manager 창 컨트롤과 안 겹치는지
- [ ] 대형 갤러리 3단계: 좋아요/인기순 정렬, 검색
- [ ] 공유 뷰어 미세 조정
- [ ] (P3) BPM 기반 박자 스냅

## 컨텍스트
- Supabase: `gflnxqrvzlydyjmokyep.supabase.co` (서울 리전)
- 테이블: shares(공유), market_presets(갤러리), notes(클라우드), user_baskets(컬렉션)
- IndexedDB v3: notes에 `displayMode`(number/name/none) 필드
- `findFormationIdxAtTime(formations, ms)` 헬퍼는 `Editor.js` 모듈 스코프
- 컬렉션 탭 ↔ 전체 탭 필터 상태 공유 (의도된 동작)
- `.editor--focus` 클래스: header/sidebar/sidebar-rail/timeline-wrap display: none + grid-template-columns 축소
- **`renderer.focusMode`** 플래그 (신규): 3D와 동일하게 `_onMouseDown` 등에서 편집 차단
- **`_renderToken`** (신규, `Editor.js`): 동시 `renderEditor` 레이스 차단 가드

## QA 리포트
- `.gstack/qa-reports/qa-report-localhost-2026-04-17.md` — 헤들리스 QA, health 95 → 100
