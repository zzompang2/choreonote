# 진행 상황

## 현재 상태: 대형 갤러리 컬렉션 도입 완료 · 실기기 검증 + 마켓 카드 차별화 대기

### 최근 완료 (2026-04-17 evening)
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
- [ ] **컬렉션 실기기 검증** (최우선)
  - 마켓 모달 → "내 컬렉션에 저장" 토스트 / 중복 시 "이미 있어요"
  - 갤러리 [내 컬렉션] 탭: 비로그인 안내 / 빈 컬렉션 / 카드 그리드 + 관객방향 flip / 클라이언트 인원수·태그 필터
  - 컬렉션 카드 클릭 → `mode='basket'` 모달 → "컬렉션에서 제거" → onAction 재렌더
  - 에디터 대형 모음 패널: 컬렉션 카드 표시 + 단일/멀티 대형 적용 + 댄서 수 미스매치 (예: preset 5명, 노트 8명) + 뒤 대형 없을 때 토스트
- [ ] **폴더 모델 — 실기기 수동 검증 남은 시나리오** (OAuth 기본 flow는 통과)
  - `downloadAllOnLogin` + 충돌 모달 / 명시적 vs 만료 분기 / 기기 전환 / 폴더 이동 / 오프라인 복구 `↺` 라운드트립
- [ ] 마켓 카드 디자인을 대시보드 노트 카드와 차별화 (2단계 잔여)
- [ ] 대형 갤러리 3단계: 좋아요/인기순 정렬, 검색
- [ ] **관리자 탭** (P3) — 다음 세션에서 목적·위치·권한 논의 후 정제
- [ ] 공유 뷰어 미세 조정

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
