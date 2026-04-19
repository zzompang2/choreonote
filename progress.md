# 진행 상황

## 현재 상태: 유저 테스트 1차 피드백 대응 완료 — 실기기 검증 + 게임형 미션 설계 대기

### 최근 완료 (2026-04-18 — 이번 세션)
**유저 테스트 피드백 P1~P2 9건 반영 (커밋 `371af80`, `cf0653c`)**:
- 재생 안정성 — hashchange 시 `engine.destroy()` 누락 fix (페이지 나가도 sourceNode 살아 노래 중첩됐던 root cause), 스테이지 캔버스 `pointerdown`에 자동 `engine.pause()` 추가 (재생 중 드래그가 메인 스레드 점유해 정지 버튼 먹통 되던 시나리오 차단)
- Escape hatch — 헤더 우측 ⟳ 버튼, 2-step confirm (첫 클릭 → 빨강 pulse + 토스트 "한 번 더 눌러 재시작" 3초, 두 번째 → `saveToDB(silent)` → `engine.destroy()` → `location.reload()`)
- 재생 버튼 강조 — `player-bar__btn--primary` 모디파이어 (데스크톱 44·모바일 52 원형 accent), 정지/prev/next는 기존 크기 유지해 시각 위계 명확
- 영상 내보내기 — `VideoExporter` 시그니처에 `showNumbers/dancerShape/gridGap` 추가, Editor 호출부도 전달. 720p·2Mbps → 1080p·6Mbps. `_drawGridCache` 호출을 gridGap 적용 이후로 이동
- 뷰 지속성 — `displayMode` 필드 신설 (`'number'`/`'name'`/`'none'`), NoteStore.saveNote 시그니처 + noteUpdate에 추가. dancerShape/gridGap도 로드 시 UI `settings-option--active` 초기 동기화 (기존엔 HTML 하드코딩이라 재진입 시 UI·renderer 어긋남)
- 집중 모드 — 플레이어바 우측 ⤢ 버튼, `.editor--focus` 클래스 토글로 header/sidebar/rail/timeline-wrap 숨김. F키 토글, ESC 탈출
- 대형 모음 — `.preset-spacing` position: sticky (top 0, 배경 var(--bg-secondary), border-bottom)

**게임형 미션 시스템 설계 결정 (세부 미정)**:
- 기존 `UNLOCK_ORDER` (inspector/presets/markers) 확장 → 대형 모음, 마킹, 경유점, 퇴장영역, 대형 갤러리까지 lock
- 사이드바 메뉴 항목 "🎯 미션" 항상 노출 (결정: 1-a)
- 기존 사용자 localStorage 전원 초기화 OK (테스트 유저만 존재)
- 자물쇠 아이콘 오해 문제 + 경유점 온보딩 피드백을 이 시스템으로 흡수
- 미정: 미션 단위(기능당 1개 vs 여러), XP/레벨 시각화, 미션 문구, 클리어 판정 조건
- **디자인 세션 시작했으나 사용자 요청으로 보류 (2026-04-18)** — 재개 시 아래 축 순서로 진행
  1. 미션 철학(a 단순/b 숙련도/c 스토리) — (a)+(b) 하이브리드 제안 상태
  2. 클리어 판정(수동/조건/튜토리얼)
  3. 진행 가시화(XP/뱃지/도장)
  4. 미션 센터 UI 위치(독립 페이지/드로어/모달)
  5. 자물쇠 재설계
  6. 확장 기능 범위(현 3종 + 5종 = 8종?)

### 이전 완료 (2026-04-18 earlier — 동일 날짜)
- **카드 시각 언어 확정** — 노트=공책 종이(크림톤+괘선+dog-ear 14px+hover 미세 rotate), 갤러리/컬렉션=포스트잇(5색 파스텔+±1° 기울어짐). 썸네일 스테이지 4x4 격자 + 센터 크로스
- **타임라인 스냅 단위 125ms (1/8초)** — `TIME_UNIT` 250→125. `MIN_FORMATION_DURATION`=250, `DEFAULT_FORMATION_DURATION`=1000, `PASTE_FORMATION_DURATION`=1250
- **iOS/모바일 버그픽스** — PlaybackEngine.play async + _starting 플래그, 무음 스위치 무시(`audioSession='playback'`), iPad PWA safe-area, 홈 인디케이터 여유
- **재생 중 UI freeze 2차 진단** — 대형 박스 드래그 document mouse 리스너 누수 cleanup, RAF 프레임 try/catch

### 시각 언어 결정 (유효)
- **노트 = 공책 종이 한 장**: 내가 정리한 작업물. 썸네일 + 괘선 + dog-ear
- **갤러리/컬렉션 = 포스트잇**: 브레인스토밍 보드에서 가져온 영감 한 컷
- 브랜드 페르소나 확정은 실사용자 피드백 후로 연기

### 결정사항 (유효)
- **마켓 업로드**: 체크박스 대신 연속 범위 선택 (단일 or 최대 5개 연속)
- **인증 정책**: 공유 링크는 익명, 갤러리 가져오기/업로드만 로그인
- **용어 규칙**: 대형(Formation), 동선 구간(전환 영역), 동선(이동 경로). 갤러리(공개) ↔ 컬렉션(개인) 짝
- **클라우드 저장**: 음악 미포함, IndexedDB primary, 서버는 백업
- **컬렉션 모델**: 참조 저장(preset_id only), 적용은 에디터 대형 모음 패널에서 단일/2-대형만

## 다음 할 일
- [ ] **실기기 검증 (유저 테스트 피드백 반영분)** — 우선순위 높음
  - 재생 → 페이지 이탈 → 재진입 시 노래 중첩 해소
  - 재생 중 캔버스 드래그 시 자동 정지
  - 헤더 ⟳ 버튼 2-step 동작 (먹통 상태 포함)
  - 영상 내보내기 → 댄서 모양·이름/숫자·1080p 반영
  - 노트 재진입 시 댄서 표기·모양·격자 UI 복원
  - F 키/⤢ 버튼 집중 모드 (모바일 포함)
- [ ] **영상 내보내기 관객석 흰색 누적 재현** — 3D 경로 의심. 재현 시나리오 (어느 옵션 조합인지) 확보 후 수정
- [ ] **게임형 미션 센터 큰 디자인 세션** — 위치(1-a 확정)·신규 사용자 최소 기능 범위·기존 사용자 초기화 범위는 결정됨. 미션 단위/시각화/문구/클리어 조건 설계
- [ ] **컬렉션 실기기 검증** — 모달 저장/제거, [내 컬렉션] 탭 필터, 에디터 단일/멀티 대형 적용, 댄서 수 미스매치
- [ ] **폴더 모델 실기기 검증 남은 시나리오** — `downloadAllOnLogin` + 충돌 모달, 명시적 vs 만료 분기, 기기 전환, 폴더 이동, 오프라인 복구 `↺` 라운드트립
- [ ] **iPad PWA safe-area 실기기 확인** — standalone 좌측 60px 패딩이 Stage Manager 창 컨트롤과 안 겹치는지
- [ ] 대형 갤러리 3단계: 좋아요/인기순 정렬, 검색
- [ ] 공유 뷰어 미세 조정
- [ ] (P3) BPM 기반 박자 스냅 — 현재 125ms 고정

## 컨텍스트
- Supabase: `gflnxqrvzlydyjmokyep.supabase.co` (서울 리전)
- 테이블: shares(공유), market_presets(갤러리), notes(클라우드), user_baskets(컬렉션)
- IndexedDB v3: notes에 `displayMode`('number'/'name'/'none') 필드 추가 (스키마 버전 영향 없음 — 인덱스 아님)
- `findFormationIdxAtTime(formations, ms)` 헬퍼는 `Editor.js` 모듈 스코프 — 다른 곳에서도 재사용 여지
- 컬렉션 탭 ↔ 전체 탭 **필터 상태 공유** (인원수·태그·관객방향) — 의도된 동작
- `.editor--focus` 클래스: header/sidebar/sidebar-rail/timeline-wrap display: none + grid-template-columns 축소

## QA 리포트
- `.gstack/qa-reports/qa-report-localhost-2026-04-17.md` — 헤들리스 QA, health 95 → 100
