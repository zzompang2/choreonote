# 진행 상황

## 현재 상태: 클라우드/로컬 폴더 모델 스캐폴딩 완료 (백엔드/저장소 레이어) · 다음은 대시보드 UI 연결

### 최근 완료 (2026-04-17)
- **마켓 UI 개선**
  - 모든 마켓 썸네일/미리보기에서 `showWings: false` 강제 (퇴장영역 숨김)
  - 상세 모달 캔버스에 관객석 좌석 strip 추가 — `renderFormationThumbnail`의 `showAudience: 'top'|'bottom'` 옵션, 무대 바깥에 2줄 seat 박스 (`wingBg` 배경)
  - 상세 모달 애니메이션 총 길이 **대형 수 × 1초**로 정규화 (상대 비율 유지)
  - 단일 대형은 재생 컨트롤 숨기고 정적 캔버스만
  - 관객 방향 토글: 이모지 → `관객석 ↓/↑` 텍스트 버튼
  - 모바일 필터 한 줄: `[인원수 드롭다운] [태그 (N)] [정렬 ▼] [관객석 ↓]` — 태그는 모달로, 인원수는 select로 전환
  - 필터 그룹핑: 좌(필터: 인원수+태그) / 우(뷰: 정렬+관객석), `market__filter-left/-right` 구조
- **클라우드/로컬 폴더 모델 — 스캐폴딩 완료**
  - `db.js` v3: `location` 필드 추가 + 기존 노트 백필(`cloudId` 있으면 cloud)
  - `NoteStore`: createNote/importJSON 기본 `location='local'`
  - `auth.js`: `initAuthHandler` 신설 — 명시적 로그아웃/세션 만료 분기, `SIGNED_IN` 시 pending 플래그 기반 자동 동기화, `wasSessionExpired()`로 배너 상태 조회
  - `cloudSync`: `uploadNote` → `uploadOnSave` 이름 변경, 관련 i18n 키 추가
  - `Editor`: 저장 시 `location==='cloud'`인 노트만 자동 업로드
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
- [ ] **대시보드 UI 연결** (폴더 모델 UI 레이어, 구현순서 5~7번)
  - 기존 `cloud-section`, `renderSyncIcon`, `.note-card__sync*` CSS 제거
  - 두 섹션 그리드 (`💻 내 기기`, `☁ 클라우드`), 빈 섹션 힌트 카드
  - 카드 더보기 메뉴: `☁ 클라우드로 이동` / `💻 내 기기로 이동` (후자 확인 모달)
  - 업로드 실패 시 `↺` 마이크로 인디케이터
  - 세션 만료 배너 렌더 (`wasSessionExpired()`)
- [ ] **수동 검증**: 로그인/로그아웃(의도/만료), 기기 전환, 폴더 이동, 오프라인 편집 후 복구
- [ ] **사이드바 브라우저 검증**: `/dashboard` `/market` `/trash` 전환, 활성 메뉴 하이라이트, 모바일 drawer, user slot 드롭다운
- [ ] **마켓 브라우저 검증**: 관객석 좌석 표시, 단일/다중 대형 재생, 모바일 필터 모달/드롭다운
- [ ] **대열 마켓 2단계 이어서**:
  - "새 노트로 가져오기" → "내 바구니에 저장" + 에디터 대형 모음 연동
  - 마켓 카드 디자인 대시보드 카드와 차별화 재검토
- [ ] 대열 마켓 3단계: 좋아요/인기순, 검색
- [ ] 공유 뷰어 미세 조정

## 컨텍스트
- Supabase: `gflnxqrvzlydyjmokyep.supabase.co` (서울 리전)
- 테이블: shares(공유), market_presets(마켓), notes(클라우드)
- Google OAuth 활성화 완료
- preset_data JSONB 구조: version, note, dancers, dancerCount, formations, tags, thumbnailIndex

### 폴더 모델 — 남은 구현 (5~8)
5. **대시보드 UI** — 두 섹션 그리드, 카드 더보기 메뉴, 업로드 실패 인디케이터, 세션 만료 배너
6. **i18n 추가 키**: 이미 staged된 `folderLocal/Cloud`, `moveToCloud/Local`, `confirmMoveToLocal`, `logoutConfirm`, `sessionExpiredBanner`, `cloudRestoreToast`, `cardMoreMenu` 활용
7. **CSS 정리**: `.note-card__sync*` 제거, `.dashboard__folder-section` 신설
8. **수동 검증**: 4가지 시나리오 (로그인/로그아웃 의도·만료, 기기 전환, 폴더 이동, 오프라인 복구)
