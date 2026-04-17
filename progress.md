# 진행 상황

## 현재 상태: 대시보드 UI 리디자인 완료, 대열 마켓 2단계(미니 플레이어) 작업 중

### 최근 완료 (2026-04-17)
- **대시보드 UI 리디자인**
  - 노트 카드: 보더+14px radius+hover lift, 썸네일 하단 구분선
  - 메타: 수정일 제거, `2026. 04. 17. · 3:24` (생성일 YYYY. MM. DD. + duration)
  - 동기화 뱃지 → 썸네일 좌상단 22px 원형 아이콘 (로컬 전용은 표시 안함)
  - 썸네일에서 `showWings: false, hideOffstage: true` 강제 — 퇴장영역/퇴장 댄서 숨김
  - 헤더 단순화: 정렬 드롭다운에 아이콘+caret, 툴바 그룹(정렬+뷰) 캡슐화
  - 로그인/로그아웃 → 32px 원형 아바타(이미지/이니셜)+드롭다운 메뉴
  - 가져오기 버튼 아이콘화, 모바일 actions flex-wrap

### 진행 중 (미커밋)
- **대열 마켓 2단계 — 상세 모달 미니 플레이어** (`client/src/pages/Market.js`, `locales/*.js`)
  - PlaybackEngine 임포트, 엔진용 dancers/formations 변환 (flip 포함)
  - 480x320 캔버스 + 타임라인(트랙+박스+playhead) + 재생 컨트롤 + 대형 칩
  - `marketPlay/Pause/Replay` i18n 키 추가
  - **상태**: 구현 진행 중, 동작 여부 미확인 → 다음 세션에서 브라우저 테스트 필요

### 결정사항 (유효)
- **마켓 업로드**: 체크박스 대신 연속 범위 선택 (단일 or 최대 5개 연속)
- **태그 vs 설명**: 설명란 제거, 느낌 태그(8종)로 대체. 모양 태그는 빼고 썸네일이 담당
- **제목 유지**: 모양 태그 없으므로 검색·표현 수단으로 제목 필요
- **인증 정책**: 공유 링크는 익명, 마켓 가져오기/업로드만 로그인
- **용어 규칙**: 대형(Formation), 동선 구간(전환 영역), 동선(이동 경로)
- **클라우드 저장**: 음악 미포함, IndexedDB primary, 서버는 백업
- **대시보드 썸네일**: 노트의 `showWings` 설정과 무관하게 카드에선 항상 무대만 (클린 룩)

## 다음 할 일
- [ ] **대열 마켓 2단계 이어서**:
  - 미커밋 미니 플레이어 브라우저 테스트 (재생/일시정지/timeline 시크/chip 점프)
  - "새 노트로 가져오기" → "내 바구니에 저장" + 에디터 대형 모음에서 불러오기
  - 마켓 카드 디자인을 대시보드 노트 카드와 차별화 (대시보드가 리디자인됐으니 재검토)
- [ ] 대열 마켓 3단계: 좋아요/인기순, 검색
- [ ] 공유 뷰어 미세 조정 (플레이어바 중앙정렬, 챗봇 FAB 위치)

## 컨텍스트
- Supabase: `gflnxqrvzlydyjmokyep.supabase.co` (서울 리전)
- 테이블: shares(공유), market_presets(마켓), notes(클라우드)
- Google OAuth 활성화 완료
- preset_data JSONB 구조: version, note, dancers, dancerCount, formations, tags, thumbnailIndex
