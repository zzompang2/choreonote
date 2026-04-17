# 진행 상황

## 현재 상태: 노트=공책 종이 · 갤러리/컬렉션=포스트잇 (브레인스토밍 보드) 시각 언어 확정

### 최근 완료 (2026-04-18)
- **카드 시각 언어 확정** — 노트=공책 종이(크림톤+괘선+dog-ear 14px+hover 미세 rotate), 갤러리/컬렉션=포스트잇(5색 파스텔+±1° 기울어짐+hover 반듯해지며 들림). 다크=무채톤 파스텔, 라이트=밝은 파스텔. 썸네일 스테이지 4x4 격자 + 센터 크로스(`drawStageGrid` 헬퍼)
- **에디터 UX 세트** — 재생 중 타임라인 auto-scroll, 댄서 이름 input 포커스 시 전체 텍스트 선택, 위치복사/붙여넣기 버튼 스크롤 내부로, "선택 댄서로 대형 만들기" 버튼 제거, 대형 프리셋 '역대각선' 추가, 바텀시트 상단 핸들 drag-to-dismiss(36px zone, 60px threshold)
- **타임라인 스냅 단위 125ms (1/8초)** — `TIME_UNIT` 250→125. 별개 상수 `MIN_FORMATION_DURATION`=250, `DEFAULT_FORMATION_DURATION`=1000, `PASTE_FORMATION_DURATION`=1250 도입. 룰러 눈금·기존 데이터 영향 없음
- **iOS/모바일 버그픽스** — (1) 음악 재생: `PlaybackEngine.play()` async화, `audioContext.resume()` await, `_starting` 플래그로 이중 탭 레이스 차단. (2) 무음 스위치 무시: `navigator.audioSession.type='playback'` (iOS 16.4+). (3) 댄서 색상 + 버튼: `<label>` 안에 컬러 input 투명 오버레이. (4) iPad PWA safe-area: `viewport-fit=cover` + 헤더 좌측 padding(standalone 최소 60px). (5) 홈 인디케이터 여유: 타임라인 바텀바 + 바텀시트 하단 padding에 `max(X, env(safe-area-inset-bottom))`
- **재생 중 UI freeze 2차 진단** — 대형 박스 드래그의 document mouse 리스너가 onUp에서 제거되지 않아 누수. 각 드래그마다 onMove/onUp 스택. cleanup 래퍼로 종료 시 제거. 추가로 `_animate` RAF 프레임에 try/catch — 콜백 throw 시 체인 끊김 방지

### 시각 언어 결정 (2026-04-18, 유효)
- **노트 = 공책 종이 한 장**: 내가 정리한 작업물. 썸네일 + 괘선 + dog-ear
- **갤러리/컬렉션 = 포스트잇**: 브레인스토밍 보드에서 가져온 영감 한 컷. 파스텔 5색, 기울어진 각도
- 두 카드는 "기록 생태계 속 다른 도구" (공책 vs 포스트잇) — 재질·색·모양 모두 대비
- 대안 검토 후 폐기: 찢어진 종이(과함), 스프링노트 커버(썸네일 죽음), 책장 꽂힌 책(지나친 장식), 카세트/백스테이지/스니커박스(브랜드 페르소나 미정 상태에서 선택 불가). 브랜드 확정은 실사용자 피드백 후로 연기

### 이전 완료 (2026-04-17 evening)
- **컬렉션 기능 도입** (`c4ebfdd`)
  - Supabase `user_baskets` (preset_id 참조 모델, RLS, ON DELETE CASCADE) — 원본 preset 삭제 시 자동 정리
  - `utils/basket.js` — addToBasket / removeFromBasket / fetchBasket / isInBasket
  - **에디터 대형 모음 패널에 "내 컬렉션" 섹션** — 카드 클릭 시 *선택 대형 + 바로 뒤 대형* 좌표 덮어쓰기 (단일이면 1개), 가까운 매칭(헝가리안 + 그리디 prefilter), 댄서 수 미스매치 시 가까운 N명에만 적용
  - **`components/PresetDetailModal.js`** 추출 — Market 상세 모달을 Dashboard/Market 양쪽에서 재사용 가능하게. `mode='market'` (저장) / `'basket'` (제거) 분기
  - **갤러리 페이지 `[전체][내 컬렉션]` 탭** — `filtersHTML` / `bindFiltersHandlers` 헬퍼 추출로 두 탭 공유. 컬렉션 탭에선 정렬 select 제외
  - **컬렉션 탭 클라이언트 필터링** — 인원수, 느낌 태그, 관객 방향 토글 (정렬은 "최근 추가한 순" 고정)
  - **용어 변경**: 대형 마켓 → 대형 갤러리, 내 바구니 → 내 컬렉션. i18n 키는 유지(`market*`/`basket*`), 텍스트만 변경. 카피·토스트엔 "영감" 살림 ("내 컬렉션에 영감을 담았어요")

### 결정사항 (유효)
- **마켓 업로드**: 체크박스 대신 연속 범위 선택 (단일 or 최대 5개 연속)
- **태그 vs 설명**: 설명란 제거, 느낌 태그(8종)로 대체. 모양 태그는 빼고 썸네일이 담당
- **인증 정책**: 공유 링크는 익명, 갤러리 가져오기/업로드만 로그인
- **용어 규칙**: 대형(Formation), 동선 구간(전환 영역), 동선(이동 경로). 갤러리(공개) ↔ 컬렉션(개인) 짝
- **클라우드 저장**: 음악 미포함, IndexedDB primary, 서버는 백업
- **마켓 썸네일/미리보기**: `showWings:false, hideOffstage:true` 강제
- **마켓 상세 모달 캔버스만** 관객석 좌석 표시
- **컬렉션 모델 (이번 세션 결정)**:
  - **참조 저장 (preset_id only)**: 원본 삭제 시 컬렉션도 자동 정리 (음악 스트리밍 좋아요 패턴). 데이터 가벼움, 항상 최신
  - **컬렉션 위치 = 갤러리 페이지 안 탭**: "갤러리에서 영감 받기 → 같은 페이지 컬렉션 탭에서 확인" 한 페이지 완결. 대시보드는 "내가 만든 노트"에 단일 집중
  - **컬렉션 적용 = 단일/2개 대형만**: 마켓의 가치는 "단편 영감 한 컷"이지 "안무 한 곡 통째"가 아님. 멀티 대형 적용 시 첫 대형 기준으로 노트 댄서↔preset dancerIndex 매핑 결정 후 두 대형에 같은 매핑 적용 (동선 의미 보존)
  - **댄서 수 미스매치**: preset(M) ≠ 노트(N) 시 가까운 min(M,N)쌍만 적용, 나머지는 좌표 그대로
  - **2-대형 적용 시간**: preset 원본 시간 무시, 노트 기존 두 대형의 시간 그대로 (BPM 의존이라)
  - **새 노트로 가져오기 폐기**: 컬렉션에 저장만 가능. 적용은 에디터 대형 모음 패널에서
  - **마켓 데이터 클리어**: 기존 마켓은 모두 테스트 데이터라 `TRUNCATE market_presets CASCADE`로 새 출발

## 다음 할 일
- [ ] **재생 중 UI freeze 재현 확인** — `_starting` 플래그 + 리스너 누수 수정 + RAF try/catch까지 적용됨. 여전히 발생하면 브라우저 콘솔 에러 메시지 + 기기/동작 시퀀스 확보 필요
- [ ] **컬렉션 실기기 검증**
  - 마켓 모달 → "내 컬렉션에 저장" 토스트 / 중복 시 "이미 있어요"
  - 갤러리 [내 컬렉션] 탭: 비로그인 안내 / 빈 컬렉션 / 카드 그리드 + 관객방향 flip / 클라이언트 인원수·태그 필터
  - 컬렉션 카드 클릭 → `mode='basket'` 모달 → "컬렉션에서 제거" → onAction 재렌더
  - 에디터 대형 모음 패널: 컬렉션 카드 표시 + 단일/멀티 대형 적용 + 댄서 수 미스매치 (예: preset 5명, 노트 8명) + 뒤 대형 없을 때 토스트
- [ ] **폴더 모델 — 실기기 수동 검증 남은 시나리오** (OAuth 기본 flow는 통과)
  - `downloadAllOnLogin` + 충돌 모달 / 명시적 vs 만료 분기 / 기기 전환 / 폴더 이동 / 오프라인 복구 `↺` 라운드트립
- [ ] **iPad PWA safe-area 실기기 확인** — `viewport-fit=cover` + standalone 좌측 60px 패딩이 iPad Stage Manager 창 컨트롤과 실제로 안 겹치는지
- [ ] 대형 갤러리 3단계: 좋아요/인기순 정렬, 검색
- [ ] **관리자 탭** (P3) — 다음 세션에서 목적·위치·권한 논의 후 정제
- [ ] 공유 뷰어 미세 조정
- [ ] (P3) BPM 기반 박자 스냅 — 현재 125ms 고정. 곡 BPM 입력 → 박/반박/4분박 토글 스냅

## QA 리포트
- `.gstack/qa-reports/qa-report-localhost-2026-04-17.md` — 헤들리스 QA, health 95 → 100
- ISSUE-001 (`b185aca`): 720p 뷰포트 상세 모달 player overflow → flex 기반 canvas 축소

## 컨텍스트
- Supabase: `gflnxqrvzlydyjmokyep.supabase.co` (서울 리전)
- 테이블: shares(공유), market_presets(갤러리), notes(클라우드), **user_baskets(컬렉션 — `c4ebfdd`로 추가, SQL 실행 완료)**
- Google OAuth 활성화 완료
- preset_data JSONB 구조: version, note, dancers, dancerCount, formations, tags, thumbnailIndex
- `findFormationIdxAtTime(formations, ms)` 헬퍼는 `Editor.js` 모듈 스코프 — 다른 곳에서도 재사용 여지 있음
- 컬렉션 탭 ↔ 전체 탭 **필터 상태 공유** (인원수·태그·관객방향). "전체에서 8명 필터 → 컬렉션으로 전환해도 8명 필터 유지" 의도된 동작
