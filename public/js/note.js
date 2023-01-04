import { TIME_UNIT, floorTime, $ } from "/js/constant.js";

import State from "./components/State.js";
import MusicPlayer from "./components/MusicPlayer.js";
import SideScreen from "./components/SideScreen.js";
import Stage from "./components/Stage.js";
import Timeline from "./components/Timeline.js";
import Toast from "./components/Toast.js";
import Toolbar from "./components/Toolbar.js";

const NOTE_ID = Number(new URL(location).searchParams.get("id"));

let state;
let stage;
let musicPlayer;
let timeline;
let toolbar;
let sideScreen;

/************/

/*** MAIN ***/

/************/

initializeNote();

/****************/

/*** FUNCTION ***/

/****************/

function initializeNote() {
  axios.get(`/note/info?id=${NOTE_ID}`)
  .then(res => {
    const { noteInfo, dancers, times, postions } = res.data;
    
    /* State */
    state = new State({ noteInfo, dancers, times, postions });
    
    /* Audio */
    const $audio = $("#audio");
    $audio.src = null;

    if (state.noteInfo.musicfile) {
      $audio.src = "assets/music/" + state.noteInfo.musicfile;
      $audio.onloadedmetadata = () => {
      };
    }

    stage = new Stage({
      state,
      selectDancer,
    });

    musicPlayer = new MusicPlayer({
      state,
      clickPlayBtn,
      addFormationBox,
    });

    timeline = new Timeline({
      state,
      pauseMusic,
      setCurTime,
      selectFormationBox,
      changeFormationTimeAndDuration,
    });

    toolbar = new Toolbar({
      copyFormation,
      pasteFormation,
      deleteFormationBox
    });

    sideScreen = new SideScreen({
      state,
      addDancer,
      deleteDancer,
      changeDancerName,
      changeDancerColor,
      selectDancer,
      changeNoteTitle,
    });

    setCurTime(0);
    resetSaveTimer();

    $("#header_logo").onclick = e => {
      e.stopPropagation();
      $("#logo_contextMenu").style.display = "flex";
      $("#logo_contextMenu").style.left = 0;
    }

    $("#open_dashboard_button").onclick = () => window.open('/dashboard');
    $("#save_file_button").onclick = saveFile;
    $("#save_button").onclick = saveNoteDB;
    $("#music_input").onchange = e => handleMusicFile(e.target.files[0]);
  })
  .catch(err => {
    console.error(err);
  });
}

function changeNoteTitle(newTitle) {
	if (newTitle.trim() !== "") {
    state.noteInfo.title = newTitle.trim();
  }
  sideScreen.changeNoteTitle();
}

function handleMusicFile(file) {
  if (!file) return;

  if(file.type != "audio/mpeg") {
    window.alert("노래 파일이 아닙니다.");
    return;
  }
  
  if(file.size >= 20 * 1024 * 1024) {
    window.alert("파일 크기가 너무 큽니다(최대 20MB).");
    return;
  }
  
  const formData = new FormData();
  const config = {
    header: { 'content-type': 'multipart/form-data' },
  };
  
  formData.append('musicFile', file);		// 이름이 upload.single() 매개변수와 같아야 함
  
  // 파일 업로드
  axios.post('/note/musicfile', formData, config)
  .then(res => {
    // location.reload();
    const { filename, originalname } = res.data;
    
    console.log(filename, originalname);
    
    // 노래 길이 구하고 DB 업데이트
    const $audio = $("#audio");
    $audio.src = "assets/music/" + filename;
    $audio.onloadedmetadata = () => {
      const duration = floorTime($audio.duration * 1000);
            
      if(duration < 10000 || 600000 < duration) {
        window.alert("노래는 최소 10초, 최대 10분 길이여야 합니다.");
        // window.location.reload(); // 새로고침
        return;
      }
      
      if(duration < state.noteInfo.duration) {
        if(!window.confirm("노래 길이가 기존보다 짧습니다. 계속 진행하시겠습니까?\n기존 대열 일부가 삭제됩니다.")) {
          return;
        }
                
        // 노래 길이 넘어가는 박스 삭제하기
        let id = 0;
        for(; id < state.formations.length; id++) {
          if(state.formations[id].start + state.formations[id].duration > duration)
          break;
        }
        if(id == 0) {
          state.formations = [{ ...state.formations[0], start: 0, duration: 2000}]
        }
        if(id != state.formations.length) {
          state.formations = state.formations.splice(id);
        }
      }

      state.noteInfo.musicfile = filename;
      state.noteInfo.musicname = originalname;
      state.noteInfo.duration = duration;
      
      
      timeline = new Timeline({
        state,
        pauseMusic,
        setCurTime,
        selectFormationBox,
        changeFormationTimeAndDuration,
      });
      musicPlayer = new MusicPlayer({
        state,
        clickPlayBtn,
        addFormationBox,
      });
      
      sideScreen.setMusicName();
      setCurTime(0);
    };
  })
  .catch(err => {
    console.error(err);
  });
}

let saveNoteDB_block = false;
function saveNoteDB() {
  if (saveNoteDB_block) return;
  
  new Toast("저장중입니다...", "success");
  saveNoteDB_block = true;
    
  axios.post('/note/update', {
    noteId: NOTE_ID,
    dancers: state.dancers,
    formations: state.formations,
    noteInfo: state.noteInfo
  })
  .then(res => {
    resetSaveTimer();
    new Toast("저장 완료!", "success");
  })
  .catch(err => {
    new Toast("저장 실패", "warning");
    console.error(err);
  })
  saveNoteDB_block = false;
}

function saveFile() {
  // console.log(state.dancers, state.formations, state.noteInfo);
  const jsonData = JSON.stringify([state.dancers, state.formations, state.noteInfo]);
  const file = new Blob([jsonData], { type: "text/plain" });
  $("a", {
    href: URL.createObjectURL(file),
    download: `${state.noteInfo.title}`
  }).click();
}

function setCurTime(ms) {
  // 노래 PAUSE
  pauseMusic();

  // state 업데이트
  state.currentTime = ms;
  // TIME MARKER 이동
  timeline.moveTimeMarker(ms);
  // MUSIC PLAYER 업데이트
  musicPlayer.curTime = ms;
  // DANCER 이동
  update();
}

function update() {
  stage.stopAndSetPosition(state.currentTime);

  // BOX 안으로 들어왔는지 검사
  let id = 0;
  for(; id < state.formations.length; id++) {
    if(state.currentTime <= state.formations[id].start + state.formations[id].duration) {
      // BOX 안으로 들어온 경우: DRAGGABLE=true
      if(state.formations[id].start <= state.currentTime) {
        state.selectedBox = id;
        stage.evalDraggable({ isBoxSelected: true });
      }
      // BOX 밖인 경우: DRAGGABLE=false
      else {
        state.selectedBox = -1;
        stage.evalDraggable({ isBoxSelected: false });
      }
      // BOX MARK 업데이트
      timeline.markBox(state.selectedBox);
      break;
    }
  }
  // 모든 BOX보다 오른쪽인 경우
  if(id == state.formations.length) {
    state.selectedBox = -1;
    timeline.markBox(-1);
  }

  toolbar.update(state.selectedBox);
}

/*************/

/*** MUSIC ***/

/*************/

function clickPlayBtn() {
  state.isPlaying ? setCurTime(state.currentTime) : play();
}

let interval = null;

function play() {
  state.isPlaying = true;
  const startMusicTime = state.currentTime;

  // DANCER DRAG 막기
  state.selectedBox = -1;
  timeline.markBox(-1);
  toolbar.update(-1);
  stage.evalDraggable({ isBoxSelected: false, isMusicPlaying: true });

  // 바로 오른쪽에 있는 BOX 찾기(포함된 BOX 제외)
  let idx = 0;
  for(; idx < state.formations.length-1; idx++) {
    if(startMusicTime < state.formations[idx+1].start)
    break;
  }

  // BOX 사이에서 시작한 경우: 바로 움직임을 시작해야 함
  if(idx < state.formations.length-1 && startMusicTime >= state.formations[idx].start + state.formations[idx].duration) {
    idx++;
    stage.moveDancers(
      state.formations[idx],
      state.formations[idx].start - startMusicTime
    );
  }

  // TIME MARKER & MUSIC PLAYER 플레이
  timeline.play();
  musicPlayer.play();

  const startDate = new Date().getTime();

  clearInterval(interval);
  interval = setInterval(() => {
    // const newCurTime = musicPlayer.audioCurTime;
    const newCurTime = startMusicTime + floorTime(new Date().getTime() - startDate);

    if(state.currentTime == newCurTime) return;

    /* 다음 TIME_UNIT에 도달한 경우 */

    /** 노래 끝난 경우 */
    if(newCurTime >= state.noteInfo.duration) {
      pauseMusic();
      setCurTime(state.noteInfo.duration);
    }
    /** 노래 아직 안 끝남 */
    else {
      state.currentTime = newCurTime;
      musicPlayer.setCurTimeText(newCurTime);

      // 더이상 움직일 게 없는 경우
      if(idx < state.formations.length-1 && newCurTime == state.formations[idx].start + state.formations[idx].duration) {
        idx++;
        stage.moveDancers(
          state.formations[idx],
          state.formations[idx].start - state.formations[idx-1].start - state.formations[idx-1].duration
        );
      }
      else if(newCurTime == state.formations[idx].start) {
        stage.stopAndSetPosition(newCurTime);
      }
    }
  },
  100);
}

/**
 * state 업데이트
 * TIMELINE - pause(moveTimeMarker)
 * MUSIC PLAYER - pause
 */
function pauseMusic(ms) {
  if(ms != undefined) {
    state.currentTime = ms;
  }
  if(state.isPlaying) {
    state.isPlaying = false;
    clearInterval(interval);
    timeline.pause(state.currentTime);
    musicPlayer.pause(state.currentTime);
    stage.stopAndSetPosition(state.currentTime);
  }
  stage.evalDraggable({ isMusicPlaying: false });
}

/*********************/

/*** FORMATION BOX ***/

/*********************/

function addFormationBox() {
  if(state.isPlaying) {
    new Toast("노래 재생중입니다.", "warning");
    return;
  }
  
  if(!checkFormationAddable()) {
    // Toast 창 띄우기
    new Toast("추가할 수 없는 곳이에요.", "warning");
    return;
  }

  const { noteInfo: { duration }, formations, currentTime, selectedBox } = state;
  
  /* 새로 만들 BOX의 INDEX */
  let idx = 0;
  for(; idx < formations.length; idx++) {
    if(currentTime < formations[idx].start) break;
  }
  
  /* 선택된 BOX가 새로운 BOX보다 오른쪽인 경우 */
  if(selectedBox >= idx)
  state.selectedBox++;

  /* 새로 만들 BOX의 길이 설정(최대 5*TIME_UNIT) */
  let boxDuration;

  // 오른쪽에 아무 BOX도 없는 경우: 노래 넘어가지 않도록 길이 설정
  if(idx == formations.length)
  boxDuration = duration - currentTime >= 5*TIME_UNIT ? 5*TIME_UNIT : duration - currentTime;
  // 오른쪽에 BOX가 있는 경우: (사이 공간-1) 만큼 설정
  else
  boxDuration = formations[idx].start - currentTime > 5*TIME_UNIT ? 5*TIME_UNIT : formations[idx].start - currentTime - TIME_UNIT;

  const curPos = [];
  stage.curPosition.forEach(pos => curPos[pos.did] = {...pos}); // stage.curPos deep-copy
  state.formations.splice(idx, 0, {
    start: currentTime,
    duration: boxDuration,
    positionsAtSameTime: curPos
  });
  timeline.addFormationBox(idx);
  update();
}

/**
 * state 상태에서 새로운 formation 을 추가할 수 있는지 여부를 체크한다.
 */
const checkFormationAddable = () => {
  const { noteInfo: { duration }, formations, currentTime } = state;

  // currentTime 유효성 검사
  if(currentTime < 0 || duration <= currentTime + TIME_UNIT)
  return false;

  // currentTime 을 포함하거나 바로 오른쪽에 있는 BOX 를 찾는다
  let i = 0;
  for(; i<formations.length; i++) {
    if(currentTime <= formations[i].start + formations[i].duration) break;
  }

  // 모든 BOX 보다 오른쪽에 있는 경우
  if(i == formations.length) return true;

  // BOX 를 만들 공간(최소 TIME_UNIT)이 충분한 경우
  if(currentTime < formations[i].start - TIME_UNIT) return true;

  return false;
}

function deleteFormationBox() {
  const targetId = state.selectedBox;
  if(targetId == -1) return;

  if(state.formations.length == 1) {
    new Toast("최소 1개의 대열은 있어야 해요.", "warning");
    return;
  }

  if(!window.confirm("정말 삭제하시겠습니까? 되돌릴 수 없어요!"))
  return;

  state.formations.splice(targetId, 1);
  timeline.deleteFormationBox(targetId);
  update();
}

function copyFormation() {
  const targetId = state.selectedBox;
  if(targetId == -1) return;

  state.copiedFormation = [];
  stage.curPosition.forEach(pos => state.copiedFormation[pos.did] = {...pos}); // deep copy
  new Toast("복사 되었습니다.", "success");
}

function pasteFormation() {
  const targetId = state.selectedBox;
  if(targetId == -1) return;

  if(state.copiedFormation.length == 0) {
    new Toast("복사한 대열이 없어요.", "warning");
    return;
  }
  
  if (state.copiedFormation.length !== state.dancers.length) {
    new Toast(`복사한 대열이 현재 댄서 수와 맞지 않아요. (복사한 대열: ${state.copiedFormation.length-1}명)`, "warning");
    return;
  }

  const newPosition = [];
  state.copiedFormation.forEach(pos => newPosition[pos.did] = {...pos}); // deep copy
  state.formations[targetId].positionsAtSameTime = newPosition;
  update();
  new Toast("붙여넣기 완료!", "success");
}

/**
 * FORMATION BOX 선택
 */
function selectFormationBox(idx) {
  pauseMusic();

  // 선택된 BOX를 선택한 경우: Nothing
  if(state.selectedBox == idx) return;

  // 새로운 BOX를 선택한 경우
  setCurTime(state.formations[idx].start);
}

function changeFormationTimeAndDuration({ id, start, duration }) {
  // RIGHT HANDLE
  if(start == undefined) {
    if(duration <= 0) return;
    // 마지막 BOX: TIMELINE 밖으로 나간 경우 return
    if(id == state.formations.length-1) {
      if(state.formations[id].start + duration > state.noteInfo.duration) return;
    }
    // 마지막이 아닌 BOX: 오른쪽 BOX에 닿거나 겹친 경우 return
    else {
      if(state.formations[id].start + duration >= state.formations[id+1].start) return;
    }
    // CHANGE!
    // formations를 변경하면 참조값을 갖고있는
    // FormationBox의 formationInfo 값도 변경되어 있음.
    // 따라서 따로 값을 넘겨줄 필요 없이 업데이트를 하면 됨.
    state.formations[id].duration = duration;
    timeline.updateFormationBox(id);
    update();
  }
  // BODY
  else if(duration == undefined) {
    // TIMELINE 밖으로 나간 경우 return
    if(start < 0) return;
    if(start + state.formations[id].duration > state.noteInfo.duration) return;
    // 다른 BOX와 겹치는지 확인
    let newId = 0; // 새로운 index
    for(let i=0; i<state.formations.length; i++) {
      if(i == id) continue; // 자기 자신은 패스
      const { duration } = state.formations[id];
      const { start: iTime, duration: iDuration } = state.formations[i];
      // start 보다 왼쪽의 BOX들 무시
      if(iTime + iDuration < start) {
        newId++;
        continue;
      }
      // i BOX가 오른쪽에 있는 경우: 문제 없음
      if(start + duration < iTime) break;
      // i BOX와 겹치는 경우 return
      return;
    }
    // CHANGE!
    state.formations[id].start = start;
    if(newId == id) {
      timeline.updateFormationBox(id);
    }
    // 순서가 변한 경우
    else {
      const target = state.formations.splice(id, 1)[0];
      state.formations.splice(newId, 0, target);
      timeline.moveFormationBox(id, newId);
    }
    update();
  }
  // LEFT HANDLE
  else {
    if(start < 0 || duration <= 0) return;
    // 첫번째 BOX: start >=0 이므로 문제 없음
    // 첫번째가 아닌 BOX: 왼쪽 BOX에 닿거나 겹친 경우 return
    if(id != 0) {
      const { start: leftTime, duration: leftDuration } = state.formations[id-1];
      if(start <= leftTime + leftDuration) return;
    }
    // CHANGE!
    state.formations[id].start = start;
    state.formations[id].duration = duration;
    timeline.updateFormationBox(id);
    update();
  }
}

/**************/

/*** DANCER ***/

/**************/

function addDancer() {
  if(state.isPlaying) {
    new Toast("노래 재생중입니다.", "warning");
    return;
  }
  const did = state.dancers.length;
  state.dancers.push({
    id: did,
    name: "이름",
    color: "#D63F72"
  });
  state.formations.forEach(formation => {
    formation.positionsAtSameTime.push({ tid: formation.id, did, x: 0, y: 0 });
  });
  stage.stopAndSetPosition(state.currentTime);
  stage.addDancer(did);
  sideScreen.addDancer(did);
}

function deleteDancer(did) {
  selectDancer(-1);
  
  state.dancers.splice(did, 1);
  state.dancers.forEach(dancer => {
    if(dancer.id > did)
    dancer.id--;
  })
  state.formations.forEach(formation => {
    formation.positionsAtSameTime.splice(did, 1);
    formation.positionsAtSameTime.forEach(pos => {
      if(pos.did > did)
      pos.did--;
    });
  });
  stage.removeDancer(did);
  sideScreen.removeDancer(did);
}

function changeDancerName(did, name) {
  state.dancers[did].name = name;
  stage.changeName(did, name);
}

function changeDancerColor(did, color) {
  state.dancers[did].color = color;
  stage.changeColor(did);
}

function selectDancer(id) {
  if(state.selectedDancer != -1) {
    sideScreen.unselect(state.selectedDancer);
    stage.unselect(state.selectedDancer);
  }
  state.selectedDancer = id;
  if (id != -1) {
  	sideScreen.select(id);
    stage.select(id);
  }
}

let headerTimeTimer;
function resetSaveTimer() {
  let saveTime = 0;
  $("#save_timer").textContent = "마지막 저장 0분전";
  
  headerTimeTimer = setInterval(() => {
    $("#save_timer").textContent = `마지막 저장 ${++saveTime}분전`;
  }, 1000 * 60);
}