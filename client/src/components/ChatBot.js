import { t, getLang } from '../utils/i18n.js';

// --- FAQ 데이터 ---

const FAQ_KO = [
  // 일반
  { q: ['코레오노트', '뭐하는', '어떤 앱', '소개'], a: 'ChoreoNote는 안무 대형(포메이션)을 타임라인으로 관리하고, 전환 애니메이션을 재생·영상 내보내기할 수 있는 웹앱입니다.', context: 'all' },
  { q: ['시작', '처음', '어떻게 쓰'], a: '노트 목록에서 "새 노트"를 만들고, 편집 화면에서 댄서를 배치한 뒤 타임라인에 대형을 추가하세요. 재생 버튼으로 결과를 확인할 수 있어요.', context: 'all' },
  { q: ['로그인', '회원가입', '계정'], a: '로그인 없이 바로 사용할 수 있어요. 모든 데이터는 브라우저에 저장됩니다.', context: 'all' },
  { q: ['저장', '데이터', '어디에'], a: '모든 데이터는 브라우저의 IndexedDB에 저장됩니다. 서버에 전송되지 않아요. 설정에서 JSON 백업을 내보낼 수 있습니다.', context: 'all' },
  { q: ['모바일', '아이패드', '태블릿', '핸드폰'], a: '모바일과 아이패드에서도 사용할 수 있어요. 터치로 댄서를 드래그하고, 핀치 줌으로 무대를 확대/축소할 수 있습니다.', context: 'all' },

  // 랜딩
  { q: ['무료', '가격', '요금'], a: 'ChoreoNote는 완전 무료입니다. 가입도, 결제도 필요 없어요.', context: 'landing' },
  { q: ['기능', '뭘 할 수'], a: '댄서 배치, 대형 전환 애니메이션, 음악 동기화, 3D 뷰, 영상 내보내기, 공유 링크 등을 지원해요.', context: 'landing' },
  { q: ['설치', '다운로드', '앱'], a: '설치 없이 브라우저에서 바로 사용할 수 있어요. 홈 화면에 추가하면 앱처럼 실행됩니다.', context: 'landing' },
  { q: ['오프라인', '인터넷'], a: 'PWA를 지원해서 한 번 접속하면 오프라인에서도 사용할 수 있어요.', context: 'landing' },

  // 대시보드
  { q: ['노트 만들기', '새 노트', '노트 생성'], a: '노트 목록에서 "+ 새 노트" 버튼을 누르면 새 노트가 생성되고 편집 화면으로 이동합니다.', context: 'dashboard' },
  { q: ['삭제', '휴지통', '복원'], a: '노트를 삭제하면 휴지통으로 이동합니다. 30일 후 자동 삭제되며, 그 전에 복원할 수 있어요.', context: 'dashboard' },
  { q: ['가져오기', 'import', 'json'], a: '노트 목록의 "가져오기" 버튼으로 JSON 백업 파일을 불러올 수 있습니다.', context: 'dashboard' },

  // 에디터 — 추천 키워드 상위 4개: 스냅, 교환, 정렬, 단축키
  { q: ['스냅', '격자', '자석'], a: '스냅을 켜면(S 키) 댄서가 격자에 딱 맞게 붙습니다. 깔끔한 배치가 필요할 때 유용해요.', context: 'editor' },
  { q: ['교환', '스왑', 'swap'], a: '툴바의 교환 버튼을 누른 뒤, 두 댄서를 차례로 클릭하면 위치가 교환됩니다.', context: 'editor' },
  { q: ['정렬', '균등 배치', 'align'], a: '여러 댄서를 선택하면 댄서 편집 패널에 정렬 버튼이 나타나요. 가로/세로 정렬, 균등 배치를 할 수 있습니다.', context: 'editor' },

  // 에디터 — 단축키 (기존 도움말 패널 내용을 FAQ로 통합)
  { q: ['단축키', '키보드', '핫키'], html: true, a: `<div class="chatbot-shortcuts">
<div class="shortcut-row"><kbd>Space</kbd><span>재생 / 일시정지</span></div>
<div class="shortcut-row"><kbd>←</kbd> <kbd>→</kbd><span>250ms 이동</span></div>
<div class="shortcut-row"><kbd>↑</kbd> <kbd>↓</kbd><span>이전 / 다음 대형</span></div>
<div class="shortcut-row"><kbd>N</kbd><span>대형 추가</span></div>
<div class="shortcut-row"><kbd>S</kbd><span>스냅 토글</span></div>
<div class="shortcut-row"><kbd>+</kbd> <kbd>−</kbd><span>타임라인 줌</span></div>
<div class="shortcut-row"><kbd>Tab</kbd><span>패널 전환</span></div>
<div class="shortcut-row"><kbd>Del</kbd><span>대형 삭제</span></div>
<div class="shortcut-row"><kbd>Ctrl+Z</kbd><span>되돌리기</span></div>
<div class="shortcut-row"><kbd>Ctrl+Shift+Z</kbd><span>다시 실행</span></div>
<div class="shortcut-row"><kbd>Ctrl+A</kbd><span>전체 선택</span></div>
<div class="shortcut-row"><kbd>Ctrl+C</kbd> <kbd>V</kbd><span>복사 / 붙여넣기</span></div>
<div class="shortcut-row"><kbd>3</kbd><span>3D 뷰 토글</span></div>
<div class="shortcut-row"><kbd>Esc</kbd><span>해제</span></div>
<div class="shortcut-row"><kbd>Shift+클릭</kbd><span>다중 선택</span></div>
<div class="shortcut-row"><kbd>Shift+휠</kbd><span>타임라인 스크롤</span></div>
</div>`, context: 'editor' },
  // 에디터 — 댄서
  { q: ['댄서 추가', '댄서 만들기', '멤버 추가'], a: '사이드바의 댄서 목록에서 "+ 댄서 추가"를 누르세요. 이름, 색상 등은 댄서를 선택 후 댄서 편집 패널에서 변경할 수 있어요.', context: 'editor' },
  { q: ['댄서 선택', '다중 선택', '여러 명'], a: '무대에서 Shift+클릭으로 여러 댄서를 선택하거나, 빈 공간을 드래그해서 영역 선택할 수 있어요.', context: 'editor' },
  { q: ['댄서 색상', '색 바꾸기'], a: '댄서를 선택하면 사이드바 댄서 편집 패널에서 색상을 변경할 수 있어요.', context: 'editor' },

  // 에디터 — 대형/타임라인
  { q: ['대형 추가', '대열 추가', '포메이션'], a: '타임라인의 빈 곳을 클릭한 뒤 "+ 대형" 버튼을 누르거나, N 키를 누르세요.', context: 'editor' },
  { q: ['대형 삭제', '대열 삭제'], a: '삭제할 대형을 선택한 뒤 "− 대형" 버튼 또는 Delete 키를 누르세요.', context: 'editor' },
  { q: ['복사', '붙여넣기', '대형 복사'], a: '대형을 선택하고 복사 버튼(Ctrl+C)을 누른 뒤, 빈 곳을 클릭하고 붙여넣기(Ctrl+V)하세요.', context: 'editor' },
  { q: ['프리셋', '대열 모음', '원형', 'V자'], a: '사이드바의 대열 모음에서 원형, V자 등 프리셋을 한 번에 적용할 수 있어요.', context: 'editor' },
  { q: ['타임라인', '줌', '확대', '축소'], a: '+ / - 키 또는 타임라인 하단 줌 버튼으로 확대/축소할 수 있어요. Shift+휠로 가로 스크롤합니다.', context: 'editor' },

  // 에디터 — 재생/음악/영상
  { q: ['재생', '플레이', '스페이스'], a: '스페이스바를 누르거나 재생 버튼을 클릭하세요. 방향키 ↑↓로 이전/다음 대형으로 이동합니다.', context: 'editor' },
  { q: ['음악', '노래', '오디오'], a: '설정 패널에서 "음악 넣기"를 눌러 오디오 파일을 로드하세요. 10초~10분 길이를 지원합니다.', context: 'editor' },
  { q: ['영상', '내보내기', '동영상', 'mp4', '비디오'], a: '헤더의 "영상 저장" 버튼을 누르면 현재 보이는 그대로 MP4로 내보낼 수 있어요.', context: 'editor' },
  { q: ['경유점', 'waypoint', '이동 경로', '곡선'], a: '두 대형 사이 전환 구간(화살표 영역)을 클릭하면 경유점을 편집할 수 있어요. 댄서의 이동 경로를 곡선으로 만들 수 있습니다.', context: 'editor' },

  // 에디터 — 기타
  { q: ['되돌리기', 'undo', 'redo', '실행 취소'], a: 'Ctrl+Z로 되돌리기, Ctrl+Shift+Z로 다시 실행할 수 있어요. 최대 50단계까지 지원합니다.', context: 'editor' },
  { q: ['3d', '3D', '입체'], a: '무대 설정에서 3D 뷰를 켤 수 있어요. 입체적인 시점에서 대형을 확인할 수 있습니다.', context: 'editor' },
  { q: ['공유', '링크', '보내기'], a: '설정의 "공유 링크 복사"를 누르면 읽기 전용 URL이 생성됩니다. 링크를 받은 사람은 로그인 없이 볼 수 있어요.', context: 'editor' },
  { q: ['마킹', '마커', '표시'], a: '사이드바의 마킹 패널에서 무대 위 마킹(X, 사각형, 원형)을 추가할 수 있어요. 실제 무대 바닥 표시를 재현할 때 유용합니다.', context: 'editor' },
  { q: ['무대 드래그', '스테이지 사용법'], a: '댄서를 드래그해서 이동, Shift+클릭으로 다중 선택, 빈 공간 드래그로 영역 선택, 마우스 휠로 방향 회전이 가능해요.', context: 'editor' },
  { q: ['타임라인 사용법', '대형 박스'], a: '대형 박스를 드래그해서 이동/리사이즈, 대형 사이 빈 공간 클릭으로 전환 구간 선택, 전환 구간에서 경유점 편집이 가능해요.', context: 'editor' },

  // 뷰어
  { q: ['뷰어', '공유 페이지', '읽기 전용'], a: '공유 뷰어는 읽기 전용입니다. 재생, 대형 이동, 줌, 음악 로드가 가능하고, 사이드바에서 라벨/관객 방향을 변경할 수 있어요.', context: 'viewer' },
];

const FAQ_EN = [
  // General
  { q: ['choreonote', 'what is', 'about', 'intro'], a: 'ChoreoNote is a web app for managing dance formations on a timeline with transition animations, playback, and video export.', context: 'all' },
  { q: ['start', 'begin', 'how to use', 'get started'], a: 'Create a "New Note" in the note list, place dancers in the editor, and add formations to the timeline. Press play to see the result.', context: 'all' },
  { q: ['login', 'signup', 'account'], a: 'No login required. All data is stored in your browser.', context: 'all' },
  { q: ['save', 'data', 'where stored'], a: 'All data is stored in your browser\'s IndexedDB. Nothing is sent to a server. You can export a JSON backup in Settings.', context: 'all' },
  { q: ['mobile', 'ipad', 'tablet', 'phone', 'touch'], a: 'Works on mobile and iPad. Drag dancers with touch, pinch to zoom the stage.', context: 'all' },

  // Landing
  { q: ['free', 'price', 'cost'], a: 'ChoreoNote is completely free. No signup or payment needed.', context: 'landing' },
  { q: ['features', 'what can'], a: 'Dancer placement, formation transitions, music sync, 3D view, video export, share links, and more.', context: 'landing' },
  { q: ['install', 'download', 'app'], a: 'No installation needed — just open your browser. Add to home screen for an app-like experience.', context: 'landing' },
  { q: ['offline', 'internet'], a: 'PWA supported — once loaded, it works offline too.', context: 'landing' },

  // Dashboard
  { q: ['create note', 'new note'], a: 'Press "+ New Note" in the note list to create a note and open the editor.', context: 'dashboard' },
  { q: ['delete', 'trash', 'restore'], a: 'Deleted notes go to the trash. They\'re auto-deleted after 30 days, but can be restored before then.', context: 'dashboard' },
  { q: ['import', 'json', 'load file'], a: 'Use the "Import" button in the note list to load a JSON backup file.', context: 'dashboard' },

  // Editor — top 4 suggestions: snap, swap, align, shortcut
  { q: ['snap', 'grid'], a: 'Toggle snap (S key) to make dancers stick to the grid. Great for clean positioning.', context: 'editor' },
  { q: ['swap', 'exchange'], a: 'Press the swap button in the toolbar, then click two dancers to exchange their positions.', context: 'editor' },
  { q: ['align', 'distribute'], a: 'Select multiple dancers to reveal align buttons in the Edit Dancer panel. Align horizontally/vertically or distribute evenly.', context: 'editor' },

  // Editor — Shortcuts
  { q: ['shortcut', 'keyboard', 'hotkey'], html: true, a: `<div class="chatbot-shortcuts">
<div class="shortcut-row"><kbd>Space</kbd><span>Play / Pause</span></div>
<div class="shortcut-row"><kbd>←</kbd> <kbd>→</kbd><span>Seek 250ms</span></div>
<div class="shortcut-row"><kbd>↑</kbd> <kbd>↓</kbd><span>Prev / Next formation</span></div>
<div class="shortcut-row"><kbd>N</kbd><span>Add formation</span></div>
<div class="shortcut-row"><kbd>S</kbd><span>Toggle snap</span></div>
<div class="shortcut-row"><kbd>+</kbd> <kbd>−</kbd><span>Timeline zoom</span></div>
<div class="shortcut-row"><kbd>Tab</kbd><span>Switch panel</span></div>
<div class="shortcut-row"><kbd>Del</kbd><span>Delete formation</span></div>
<div class="shortcut-row"><kbd>Ctrl+Z</kbd><span>Undo</span></div>
<div class="shortcut-row"><kbd>Ctrl+Shift+Z</kbd><span>Redo</span></div>
<div class="shortcut-row"><kbd>Ctrl+A</kbd><span>Select all</span></div>
<div class="shortcut-row"><kbd>Ctrl+C</kbd> <kbd>V</kbd><span>Copy / Paste</span></div>
<div class="shortcut-row"><kbd>3</kbd><span>Toggle 3D</span></div>
<div class="shortcut-row"><kbd>Esc</kbd><span>Deselect</span></div>
<div class="shortcut-row"><kbd>Shift+click</kbd><span>Multi-select</span></div>
<div class="shortcut-row"><kbd>Shift+wheel</kbd><span>Scroll timeline</span></div>
</div>`, context: 'editor' },
  // Editor — Dancers
  { q: ['add dancer', 'create dancer', 'new dancer'], a: 'Press "+ Add Dancer" in the sidebar dancer list. Edit name, color, etc. by selecting a dancer and using the Edit Dancer panel.', context: 'editor' },
  { q: ['select dancer', 'multi select', 'multiple'], a: 'Shift+click to select multiple dancers, or drag an empty area to box-select.', context: 'editor' },
  { q: ['dancer color', 'change color'], a: 'Select a dancer, then change the color in the Edit Dancer panel.', context: 'editor' },

  // Editor — Formations/Timeline
  { q: ['add formation', 'new formation'], a: 'Click an empty spot on the timeline and press "+ Form." or press the N key.', context: 'editor' },
  { q: ['delete formation', 'remove formation'], a: 'Select the formation and press "− Form." or the Delete key.', context: 'editor' },
  { q: ['copy', 'paste', 'duplicate'], a: 'Select a formation, press Copy (Ctrl+C), click an empty spot, then Paste (Ctrl+V).', context: 'editor' },
  { q: ['preset', 'circle', 'v-shape', 'formation library'], a: 'Use the Formations panel in the sidebar to apply presets like circle or V-shape.', context: 'editor' },
  { q: ['timeline', 'zoom', 'scroll'], a: 'Use + / - keys or the zoom buttons at the bottom of the timeline. Shift+wheel for horizontal scroll.', context: 'editor' },

  // Editor — Playback/Music/Video
  { q: ['play', 'playback', 'space'], a: 'Press Space or click the play button. Arrow keys ↑↓ jump to previous/next formation.', context: 'editor' },
  { q: ['music', 'audio', 'song'], a: 'Press "Add Music" in the settings panel to load an audio file. Supports 10s to 10min.', context: 'editor' },
  { q: ['video', 'export', 'mp4', 'record'], a: 'Press "Export Video" in the header to export the current view as MP4.', context: 'editor' },
  { q: ['waypoint', 'path', 'curve'], a: 'Click the transition area (arrow between formations) to edit waypoints. You can create curved dancer paths.', context: 'editor' },

  // Editor — Other
  { q: ['undo', 'redo'], a: 'Ctrl+Z to undo, Ctrl+Shift+Z to redo. Up to 50 steps.', context: 'editor' },
  { q: ['3d', '3D', 'perspective'], a: 'Toggle 3D view in Stage Setup for a perspective view of formations.', context: 'editor' },
  { q: ['share', 'link', 'send'], a: 'Press "Copy Share Link" in Settings to generate a read-only URL. No login needed to view.', context: 'editor' },
  { q: ['marking', 'marker', 'stage mark'], a: 'Use the Markings panel to add X marks, rectangles, or circles on stage — useful for replicating real floor marks.', context: 'editor' },
  { q: ['stage drag', 'stage usage'], a: 'Drag dancers to move, Shift+click for multi-select, drag empty area to box-select, mouse wheel to rotate direction.', context: 'editor' },
  { q: ['timeline usage', 'formation box'], a: 'Drag formation boxes to move/resize, click gaps between formations for transitions, edit waypoints in transition areas.', context: 'editor' },

  // Viewer
  { q: ['viewer', 'shared page', 'read only'], a: 'The shared viewer is read-only. You can play, navigate formations, zoom, load music, and change labels/audience direction in the sidebar.', context: 'viewer' },
];

// --- 팁 데이터 (페이지별) ---

const TIPS_KO = {
  landing: [
    '로그인 없이 바로 사용할 수 있어요. 브라우저만 있으면 OK!',
    '모바일, 아이패드에서도 사용 가능해요. 언제 어디서든 안무 노트를!',
    'JSON 백업으로 작업을 안전하게 보관하세요.',
    '공유 링크를 만들면 팀원이 로그인 없이 안무를 볼 수 있어요.',
    '영상 저장 버튼 하나로 MP4를 만들어 바로 공유할 수 있어요.',
    'PWA를 지원해서 홈 화면에 추가하면 앱처럼 사용할 수 있어요.',
  ],
  dashboard: [
    '로그인 없이 바로 사용할 수 있어요. 모든 데이터는 브라우저에 저장됩니다.',
    '삭제한 노트는 휴지통에서 30일간 복원할 수 있어요.',
    'JSON 내보내기로 노트를 백업하고, 다른 기기에서 가져올 수 있어요.',
    '노트를 최근 수정순, 생성일순, 이름순으로 정렬해보세요.',
    '홈 화면에 추가하면 앱처럼 바로 실행할 수 있어요.',
    '저장 공간이 부족하면 불필요한 노트를 삭제하거나 휴지통을 비워보세요.',
  ],
  editor: [
    'Shift+클릭으로 댄서를 여러 명 한번에 선택할 수 있어요.',
    '대형 사이 빈 공간을 클릭하면 경유점을 편집할 수 있어요.',
    '마우스 휠로 댄서의 바라보는 방향을 바꿀 수 있어요.',
    '3 키를 누르면 3D 뷰로 전환됩니다.',
    'Ctrl+A로 모든 댄서를 한번에 선택할 수 있어요.',
    '대열 모음에서 원형, V자 등 프리셋을 한 번에 적용해보세요.',
    '설정에서 "공유 링크 복사"를 누르면 팀원에게 안무를 보여줄 수 있어요.',
    '마킹 기능으로 실제 무대 바닥의 표시를 재현할 수 있어요.',
    'N 키를 누르면 빠르게 대형을 추가할 수 있어요.',
    'Shift+휠로 타임라인을 가로 스크롤할 수 있어요.',
    '댄서를 선택하고 정렬 버튼으로 깔끔하게 배치해보세요.',
    '영상 저장 버튼 하나로 MP4를 만들 수 있어요.',
    'JSON 백업으로 작업을 안전하게 보관하세요.',
    'Ctrl+휠 또는 핀치 줌으로 무대를 확대/축소할 수 있어요.',
  ],
  viewer: [
    'Space로 재생/일시정지, ↑↓로 대형 이동할 수 있어요.',
    '+/- 키로 타임라인을 확대/축소할 수 있어요.',
    '사이드바에서 댄서 라벨과 관객 방향을 변경할 수 있어요.',
  ],
};

const TIPS_EN = {
  landing: [
    'No login required. Just open your browser and start!',
    'Works on mobile and iPad too. Create choreo notes anywhere!',
    'Keep your work safe with JSON backups.',
    'Share links let your team view choreography without logging in.',
    'One click on "Export Video" to create and share an MP4.',
    'Add to home screen for an app-like experience (PWA supported).',
  ],
  dashboard: [
    'No login needed. All data is stored in your browser.',
    'Deleted notes stay in trash for 30 days — you can restore them.',
    'Export notes as JSON to back up or transfer to another device.',
    'Sort your notes by recent, created date, or name.',
    'Add to home screen for instant access like a native app.',
    'Running low on storage? Delete unused notes or empty the trash.',
  ],
  editor: [
    'Shift+click to select multiple dancers at once.',
    'Click the gap between formations to edit waypoints.',
    'Use the mouse wheel to change a dancer\'s facing direction.',
    'Press 3 to toggle 3D view.',
    'Ctrl+A to select all dancers at once.',
    'Try applying presets like circle or V-shape from the Formations panel.',
    'Press "Copy Share Link" in Settings to share your choreography with your team.',
    'Use markings to replicate real floor marks on stage.',
    'Press N to quickly add a formation.',
    'Shift+wheel to scroll the timeline horizontally.',
    'Select dancers and use align buttons for clean positioning.',
    'One click on "Export Video" to create an MP4.',
    'Keep your work safe with JSON backups.',
    'Ctrl+wheel or pinch to zoom the stage.',
  ],
  viewer: [
    'Space to play/pause, ↑↓ to jump between formations.',
    '+/- keys to zoom the timeline.',
    'Change dancer labels and audience direction in the sidebar.',
  ],
};

// --- 현재 페이지 감지 ---
function detectPage() {
  const hash = window.location.hash.slice(1) || '/';
  if (hash.startsWith('/edit')) return 'editor';
  if (hash.startsWith('/dashboard')) return 'dashboard';
  if (hash.startsWith('/share')) return 'viewer';
  return 'landing';
}

function getPageLabel(page) {
  const labels = {
    ko: { landing: '시작 화면', dashboard: '노트 목록', editor: '편집 화면', viewer: '공유 뷰어' },
    en: { landing: 'Home', dashboard: 'Note List', editor: 'Editor', viewer: 'Shared Viewer' },
  };
  return (labels[getLang()] || labels.ko)[page] || page;
}

// --- FAQ 검색 ---
function searchFaq(query, pageOverride) {
  const faq = getLang() === 'en' ? FAQ_EN : FAQ_KO;
  const page = pageOverride || detectPage();
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const queryWords = q.split(/\s+/).filter((w) => w.length >= 2);

  const scored = faq.map((item) => {
    let bestScore = 0;
    for (const keyword of item.q) {
      const kw = keyword.toLowerCase();
      let s = 0;
      if (q === kw) {
        // 완전 일치
        s = 20;
      } else if (q.includes(kw)) {
        // 쿼리가 키워드를 완전히 포함 ("댄서 추가"가 "댄서 추가"를 포함)
        s = 15;
      } else if (kw.includes(q)) {
        // 키워드가 쿼리를 포함 — 커버율에 비례 ("댄서" → "댄서 추가"는 50%)
        s = Math.round(10 * (q.length / kw.length));
      } else if (queryWords.length > 1) {
        // 여러 단어: 모든 단어가 키워드에 포함되어야 점수 부여
        const matchedWords = queryWords.filter((w) => kw.includes(w));
        if (matchedWords.length === queryWords.length) {
          s = 8;
        }
      }
      if (s > bestScore) bestScore = s;
    }
    if (bestScore === 0) return { ...item, score: 0 };
    // 현재 페이지 context 보너스
    if (item.context === page) bestScore += 5;
    else if (item.context === 'all') bestScore += 2;
    return { ...item, score: bestScore };
  });

  const sorted = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  if (sorted.length === 0) return [];

  // 최고 점수 대비 절반 이하인 결과는 제외 (너무 약한 매칭 걸러냄)
  const topScore = sorted[0].score;
  return sorted
    .filter((item) => item.score >= topScore * 0.5)
    .slice(0, 3);
}

// --- 추천 질문 (페이지 기반) ---
function getSuggestions(pageOverride) {
  const faq = getLang() === 'en' ? FAQ_EN : FAQ_KO;
  const page = pageOverride || detectPage();
  const contextItems = faq.filter((item) => item.context === page);
  const generalItems = faq.filter((item) => item.context === 'all');
  const pool = contextItems.length >= 3 ? contextItems : [...contextItems, ...generalItems];
  return pool.slice(0, 4).map((item) => item.q[0]);
}

// --- 팁 로테이션 ---
function getTips(page) {
  const all = getLang() === 'en' ? TIPS_EN : TIPS_KO;
  return all[page] || all.editor;
}

let tipIndex = Math.floor(Math.random() * 10);
let tipInterval = null;
let currentTipPage = null;

function startTipRotation(el, page) {
  if (!el) return;
  const container = el.closest('.chatbot-tip');
  currentTipPage = page || detectPage();
  const tips = getTips(currentTipPage);
  el.textContent = tips[tipIndex % tips.length];
  container.classList.add('chatbot-tip--visible');

  tipInterval = setInterval(() => {
    container.classList.remove('chatbot-tip--visible');
    setTimeout(() => {
      tipIndex++;
      const t = getTips(currentTipPage);
      el.textContent = t[tipIndex % t.length];
      container.classList.add('chatbot-tip--visible');
    }, 400);
  }, 20000);
}

function stopTipRotation() {
  if (tipInterval) {
    clearInterval(tipInterval);
    tipInterval = null;
  }
}

// ====== FAB 모드 (랜딩/대시보드) ======

let fabEl = null;
let fabPanelEl = null;
let fabOpen = false;

export function initChatBot() {
  fabEl = document.createElement('button');
  fabEl.className = 'chatbot-fab';
  fabEl.setAttribute('aria-label', t('chatTitle'));
  fabEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  document.body.appendChild(fabEl);

  fabPanelEl = document.createElement('div');
  fabPanelEl.className = 'chatbot-panel';
  fabPanelEl.innerHTML = buildFabPanelHTML();
  document.body.appendChild(fabPanelEl);

  fabEl.addEventListener('click', () => toggleFab());
  fabPanelEl.querySelector('.chatbot-panel__close').addEventListener('click', () => toggleFab());

  const input = fabPanelEl.querySelector('.chatbot-panel__input');
  const defaultFabChips = () => getSuggestions();

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      handleFabQuery(input.value);
      input.value = '';
      refreshFabSuggestions();
    }
  });

  // 실시간 자동완성
  input.addEventListener('input', () => {
    const q = input.value.trim();
    const container = fabPanelEl.querySelector('.chatbot-panel__suggestions');
    if (!q) {
      renderChips(container, defaultFabChips(), false);
      return;
    }
    const results = searchFaq(q);
    const autoLabels = results.map((r) => r.q[0]);
    if (autoLabels.length > 0) {
      renderChips(container, autoLabels, true);
    } else {
      renderChips(container, defaultFabChips(), false);
    }
  });

  fabPanelEl.querySelector('.chatbot-panel__send').addEventListener('click', () => {
    handleFabQuery(input.value);
    input.value = '';
    refreshFabSuggestions();
  });
  fabPanelEl.querySelector('.chatbot-panel__suggestions').addEventListener('click', (e) => {
    const chip = e.target.closest('.chatbot-chip');
    if (!chip) return;
    handleFabQuery(chip.textContent);
  });

  // 페이지 전환 시 FAB 표시/숨김 + context 갱신
  function updateFabVisibility() {
    const page = detectPage();
    const showFab = page === 'landing' || page === 'dashboard';
    fabEl.classList.toggle('chatbot-fab--hidden', !showFab);
    if (!showFab && fabOpen) toggleFab();
    refreshFabSuggestions();
    // context 라벨 갱신
    const ctx = fabPanelEl.querySelector('.chatbot-panel__context');
    if (ctx) ctx.textContent = t('chatContextHint', { page: getPageLabel(page) });
    // 팁도 페이지에 맞게 갱신
    if (fabOpen) startFabTip();
  }
  updateFabVisibility();
  window.addEventListener('hashchange', updateFabVisibility);
}

function toggleFab() {
  fabOpen = !fabOpen;
  fabPanelEl.classList.toggle('chatbot-panel--open', fabOpen);
  fabEl.classList.toggle('chatbot-fab--active', fabOpen);
  if (fabOpen) {
    refreshFabSuggestions();
    startFabTip();
    setTimeout(() => fabPanelEl.querySelector('.chatbot-panel__input')?.focus(), 100);
  } else {
    stopTipRotation();
  }
}

function startFabTip() {
  stopTipRotation();
  const tipText = fabPanelEl.querySelector('#fab-chatbot-tip-text');
  startTipRotation(tipText, detectPage());
}

function buildFabPanelHTML() {
  const page = detectPage();
  return `
    <div class="chatbot-panel__header">
      <span class="chatbot-panel__title">${t('chatTitle')}</span>
      <span class="chatbot-panel__context">${t('chatContextHint', { page: getPageLabel(page) })}</span>
      <button class="chatbot-panel__close" aria-label="${t('close')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="chatbot-tip chatbot-panel__tip" id="fab-chatbot-tip">
      <svg class="chatbot-tip__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <span class="chatbot-tip__text" id="fab-chatbot-tip-text"></span>
    </div>
    <div class="chatbot-panel__body" id="fab-chatbot-body">
      <div class="chatbot-msg chatbot-msg--bot">${t('chatWelcome')}</div>
    </div>
    <div class="chatbot-panel__suggestions-wrap">
      <div class="chatbot-panel__suggestions-label">${t('chatSuggestionLabel')}</div>
      <div class="chatbot-panel__suggestions"></div>
    </div>
    <div class="chatbot-panel__footer">
      <input class="chatbot-panel__input" type="text" placeholder="${t('chatPlaceholder')}" />
      <button class="chatbot-panel__send" aria-label="Send"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
    </div>
  `;
}

function handleFabQuery(query) {
  const q = query.trim();
  if (!q) return;
  const body = fabPanelEl.querySelector('#fab-chatbot-body');
  appendMessage(body, q, true);
  const results = searchFaq(q);
  appendAnswer(body, results);
}

function refreshFabSuggestions() {
  const container = fabPanelEl.querySelector('.chatbot-panel__suggestions');
  if (!container) return;
  const suggestions = getSuggestions();
  container.innerHTML = suggestions.map((s) => `<button class="chatbot-chip">${s}</button>`).join('');
}

// ====== 임베드 모드 (에디터/뷰어 사이드바) ======

export function buildHelpPanelHTML(page) {
  return `
    <div class="sidebar__panel-title">${t('chatTitle')}</div>
    <div class="chatbot-tip" id="chatbot-tip">
      <svg class="chatbot-tip__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <span class="chatbot-tip__text" id="chatbot-tip-text"></span>
    </div>
    <div class="chatbot-embed__body" id="embed-chatbot-body"></div>
    <div class="chatbot-embed__chips" id="embed-suggestions"></div>
    <div class="chatbot-embed__footer">
      <input class="chatbot-panel__input" id="embed-chatbot-input" type="text" placeholder="${t('chatPlaceholder')}" />
      <button class="chatbot-panel__send" id="embed-chatbot-send" aria-label="Send"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
    </div>
  `;
}

export function initEmbeddedChat(container, page) {
  const panel = container.querySelector('#panel-help');
  if (!panel) return;

  // 팁 시작
  const tipText = panel.querySelector('#chatbot-tip-text');
  stopTipRotation();
  startTipRotation(tipText, page);

  // 추천 질문 칩
  const suggestionsEl = panel.querySelector('#embed-suggestions');
  renderChips(suggestionsEl, getSuggestions(page));

  const body = panel.querySelector('#embed-chatbot-body');
  const input = panel.querySelector('#embed-chatbot-input');
  const sendBtn = panel.querySelector('#embed-chatbot-send');
  const defaultChips = getSuggestions(page);

  function handleEmbed(query) {
    const q = query.trim();
    if (!q) return;
    appendMessage(body, q, true);
    const results = searchFaq(q, page);
    appendAnswer(body, results);
    input.value = '';

    // 검색 후 관련 키워드로 칩 갱신 (기본 모드)
    const relatedChips = getRelatedSuggestions(q, page);
    renderChips(suggestionsEl, relatedChips.length > 0 ? relatedChips : defaultChips, false);
  }

  // 실시간 자동완성: 타이핑하면 칩이 자동완성으로 바뀜
  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) {
      renderChips(suggestionsEl, defaultChips, false);
      return;
    }
    const results = searchFaq(q, page);
    const autoLabels = results.map((r) => r.q[0]);
    if (autoLabels.length > 0) {
      renderChips(suggestionsEl, autoLabels, true);
    } else {
      renderChips(suggestionsEl, defaultChips, false);
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      handleEmbed(input.value);
    }
  });
  sendBtn.addEventListener('click', () => handleEmbed(input.value));

  suggestionsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chatbot-chip');
    if (!chip) return;
    handleEmbed(chip.textContent);
  });

  // 도움말 레일 아이콘 클릭 시 input focus
  const helpRailBtn = container.querySelector('[data-panel="help"]');
  if (helpRailBtn) {
    helpRailBtn.addEventListener('click', () => {
      setTimeout(() => input.focus(), 100);
    });
  }
}

// ====== 칩 렌더링 ======

function updateChipsFade(container) {
  if (!container) return;
  const atEnd = container.scrollWidth - container.scrollLeft - container.clientWidth < 4;
  container.classList.toggle('chatbot-embed__chips--end', atEnd);
}

function renderChips(container, labels, isAutocomplete) {
  if (!container) return;
  const cls = isAutocomplete ? 'chatbot-chip chatbot-chip--auto' : 'chatbot-chip';
  container.innerHTML = labels.map((s) => `<button class="${cls}">${s}</button>`).join('');
  // fade 힌트 갱신
  if (container.classList.contains('chatbot-embed__chips')) {
    requestAnimationFrame(() => updateChipsFade(container));
    if (!container._fadeListenerAdded) {
      container.addEventListener('scroll', () => updateChipsFade(container), { passive: true });
      container._fadeListenerAdded = true;
    }
  }
}

function getRelatedSuggestions(query, page) {
  const faq = getLang() === 'en' ? FAQ_EN : FAQ_KO;
  const q = query.toLowerCase().trim();

  // 검색 결과에 매칭된 항목들의 context 기반으로 관련 항목 추출
  const results = searchFaq(q, page);
  const matchedContexts = new Set(results.map((r) => r.context));

  // 매칭된 항목 자체의 키워드는 제외하고, 같은 context의 다른 항목 키워드 수집
  const matchedKeywords = new Set();
  for (const r of results) {
    for (const kw of r.q) matchedKeywords.add(kw);
  }

  const candidates = faq.filter((item) => {
    if (matchedKeywords.has(item.q[0])) return false;
    return matchedContexts.has(item.context) || item.context === page || item.context === 'all';
  });

  // 현재 페이지 context 우선, 최대 4개
  candidates.sort((a, b) => {
    const aScore = a.context === page ? 2 : a.context === 'all' ? 1 : 0;
    const bScore = b.context === page ? 2 : b.context === 'all' ? 1 : 0;
    return bScore - aScore;
  });

  return candidates.slice(0, 4).map((item) => item.q[0]);
}

// ====== 공용 헬퍼 ======

/** context를 사용자 친화적 라벨로 변환 (현재 페이지와 같거나 'all'이면 null) */
function getContextBadge(context) {
  const page = detectPage();
  if (context === 'all' || context === page) return null;
  const labels = {
    ko: { landing: '시작 화면', dashboard: '노트 목록', editor: '편집 화면', viewer: '공유 뷰어' },
    en: { landing: 'Home', dashboard: 'Note List', editor: 'Editor', viewer: 'Shared Viewer' },
  };
  return (labels[getLang()] || labels.ko)[context] || null;
}

function formatAnswer(text, context, isHtml) {
  const badge = getContextBadge(context);
  const content = isHtml ? text : `<p>${text}</p>`;
  if (!badge) return content;
  return `<span class="chatbot-badge">${badge}</span>${content}`;
}

function appendMessage(body, text, isUser) {
  const msg = document.createElement('div');
  msg.className = `chatbot-msg chatbot-msg--${isUser ? 'user' : 'bot'}`;
  msg.textContent = text;
  body.appendChild(msg);
  body.scrollTop = body.scrollHeight;
}

function appendAnswer(body, results) {
  const msg = document.createElement('div');
  msg.className = 'chatbot-msg chatbot-msg--bot';

  if (results.length === 0) {
    msg.textContent = t('chatNoResult');
  } else if (results.length === 1) {
    msg.innerHTML = formatAnswer(results[0].a, results[0].context, results[0].html);
  } else {
    // 2개 이상 — 선택지 제시
    msg.innerHTML = `<p>${t('chatDisambiguate')}</p>`;
    const choices = document.createElement('div');
    choices.className = 'chatbot-choices';
    results.forEach((r) => {
      const badge = getContextBadge(r.context);
      const btn = document.createElement('button');
      btn.className = 'chatbot-choice';
      btn.textContent = badge ? `${r.q[0]}` : r.q[0];
      if (badge) {
        const tag = document.createElement('span');
        tag.className = 'chatbot-badge chatbot-badge--inline';
        tag.textContent = badge;
        btn.prepend(tag);
      }
      btn.addEventListener('click', () => {
        msg.remove();
        appendMessage(body, r.q[0], true);
        const answer = document.createElement('div');
        answer.className = 'chatbot-msg chatbot-msg--bot';
        answer.innerHTML = formatAnswer(r.a, r.context, r.html);
        body.appendChild(answer);
        body.scrollTop = body.scrollHeight;
      });
      choices.appendChild(btn);
    });
    msg.appendChild(choices);
  }

  body.appendChild(msg);
  body.scrollTop = body.scrollHeight;
}
