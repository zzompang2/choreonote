import { TIME_UNIT, COLOR_NUM, floorTime, $ } from "/js/constant.js";

import MusicPlayer from "./components/MusicPlayer.js";
import SideScreen from "./components/SideScreen.js";
import Stage from "./components/Stage.js";
import Timeline from "./components/Timeline.js";
import Toast from "./components/Toast.js";
import Toolbar from "./components/Toolbar.js";

const TAG = "main.js/";

/* Elements */
const $playerSection = document.getElementById("player_section");
const $mainSection = document.getElementById("main_section");

let stage;
let musicPlayer;
let timeline;
let toolbar;
let sideScreen;

// const state = {
//   noteTitle: "",
//   dancerArray: [],
//   formationArray: [],
//   musicInfo: { name: "testMusic", duration: 30000 },
//   curTime: 0,               // millisecond
//   isMusicPlaying: false,
//   selectedBoxIdx: -1,
//   gap: 30,
//   copiedFormation: [],
//   selectedDancer: -1,
// }

class State {
  constructor({ noteInfo, dancers, times, postions }) {
    this.noteInfo = noteInfo;
    this.dancers = [];
    dancers.forEach(dancer => this.dancers[dancer.id] = dancer);
    this.formations = times.map(time => ({
      ...time,
      positionsAtSameTime: []
    }));
    postions.forEach(position => {
      const index = this.formations.findIndex(elem => elem.id == position.tid);
      this.formations[index].positionsAtSameTime[position.did] = position;
    });
    
    this.curTime = 0;
    this.isMusicPlaying = false;
    this.selectedBoxIdx = -1;
    this.selectedDancer = -1;
    this.gap = 30;
    this.copiedFormation = [];
  }
}

let musicFile;
let isNoMusicNote;
let noteLength = 10;

const noteId = new URL(location).searchParams.get("id");

axios.get(`/note/info?id=${noteId}`)
.then(res => {
  const { note, dancers, times, postions } = res.data;
  createNote(note, dancers, times, postions);
})
.catch(err => {
  console.error(err);
});

let state;

function createNote(note, dancers, times, postions) {
  state = new State({
    noteInfo: note,
    dancers,
    times,
    postions,
  });
  
  // state.noteTitle = note.title;
  // state.dancerArray = dancers;
  // state.formationArray = times.map(time => ({
  //   id: time.id,
  //   time: time.start,
  //   duration: time.duration,
  //   positionsAtSameTime: []
  // }));
  
  // postions.forEach(position => {
  //   const index = state.formationArray.findIndex(elem => elem.id == position.tid);
  // 	state.formationArray[index].positionsAtSameTime.push(position);
  // });
      
  init();
}

function init() {
  // state.curTime = 0;

  stage = new Stage({
    dancerArray: state.dancers,
    formationArray: state.formations,
    gap: state.gap,
    selectDancer
  });

  musicPlayer = new MusicPlayer({
    musicInfo: state.noteInfo,
    curTime: state.curTime,
    clickPlayBtn,
    addFormationBox,
  });

  timeline = new Timeline({
    musicDuration: state.noteInfo.duration,
    formationArray: state.formations,
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
    noteTitle: state.noteInfo.title,
    dancerArray: state.dancers,
    addDancer,
    deleteDancer,
    changeDancerName,
    changeDancerColor,
    selectDancer,
  });
  
  setCurTime(0);

  /*
  const $title = document.getElementById("main_header").firstElementChild;
  $title.onclick = () => {
    if(window.confirm("초기 화면으로 돌아가시겠습니까?\n자동 저장 기능은 아직 없으니 꼭 저장해주세요!"))
    window.location.reload();
  };
  */
  $("#save_file_button").onclick = saveFile;
  $("#save_button").onclick = saveNoteDB; 
}


/**
 * 불러온 DATABASE 파일 검사 및 분석
 * @param {FILE} file 
 */
function handleFile(file) {
  if (file === undefined) {
    return;
  }
  const arr = file.name.split(".");
  if(arr[arr.length-1] != "choreo") {
    new Toast("choreo 파일이 아닙니다.", "warning");
    // window.location.reload();
    return;
  }
  state.noteTitle = arr[0];

  const reader = new FileReader();
  reader.onload = event => {
    const result = JSON.parse(event.target.result);
    if(!checkDB(result)) {
      new Toast("파일이 훼손되었습니다!", "warning");
      // window.location.reload();
      return;
    }
    [state.dancers, state.formations, state.noteInfo] = result;
    if(window.confirm(`다음으로 노래 파일을 선택해주세요! 노래 없이 불러오려면 취소를 눌러주세요.\n(노트에 등록된 노래: ${state.noteInfo.name == "" ? "없음" : state.noteInfo.name})`)) {
      document.getElementById("input_musicfile").click();
    }
    else {
      handleMusicFile();
    }
  }
  reader.readAsText(file);
}

function handleMusicFile(file) {
  if (file === undefined) {
    init();
    return;
  }

  if(file.type != "audio/mpeg") {
    window.alert("노래 파일이 아닙니다.");
    window.location.reload();
    return;
  }

  const $audio = document.getElementById("audio");
  const blobURL = window.URL.createObjectURL(file);
  $audio.src = blobURL;
  $audio.onloadedmetadata = () => {
    const duration = floorTime($audio.duration * 1000);
    if(duration < 10 || 1200 < noteLength) {
      window.alert("노래는 최소 10초, 최대 2분 길이여야 합니다.");
      window.location.reload();
      return;
    }
    else {
      if(duration != state.noteInfo.duration) {
        if(!window.confirm("노래 길이가 다릅니다. 계속 진행하시겠습니까?\n노래가 짧아진 경우, 기존 대열 일부가 삭제됩니다.")) {
          window.location.reload();
          return;
        }
        state.noteInfo.duration = duration;
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
      init();
    }
  };
}

/**
 * JSON 파일의 형식이 올바른지 확인
 * @param {Array} result 
 * @returns 
 */
function checkDB(result) {
  const [dancerArray, formationArray, noteInfo] = result;

  // dancerArray, formationArray, noteInfo 3개가 있어야 함
  if(result.length != 3) {
    console.log("Length is not 3.");
    return false;
  }

  if(dancerArray == undefined || formationArray == undefined || noteInfo == undefined) {
    console.log("Some array are undefined.");
    return true;
  }

  return true;
}

let saveNoteDB_block = false;
function saveNoteDB() {
  if (saveNoteDB_block) return;
  saveNoteDB_block = true;
  
  axios.post('/note/update', {
    noteId,
    dancerArray: state.dancers,
    formationArray: state.formations,
    noteInfo: state.noteInfo
  })
  .then(res => {
    console.log(res.data);
  })
  .catch(err => {
    console.error(err);
  })
  console.log(state.dancers, state.formations, state.noteInfo);
  saveNoteDB_block = false;
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

function saveFile() {
  const jsonData = JSON.stringify([state.dancers, state.formations, state.noteInfo]);
  const file = new Blob([jsonData], { type: "text/plain" });
  $("a", {
    href: URL.createObjectURL(file),
    download: `${state.noteTitle}`
  }).click();
}

// function handleMusicFile (file) {
//   if (file === undefined || file.type !== "audio/mpeg") {
//     console.log("It's not audio/mpeg file.");
//     return;
//   }
//   console.log(file);

//   $audio.src = file.name;
//   $audio.onloadedmetadata = function () {
//     state.musicDuration = Math.ceil($audio.duration);
//     console.log("musicDuration:", state.musicDuration);
//     init_stage();
//   };
// }


/*************
 *** MUSIC ***
 *************/

function clickPlayBtn() {
  state.isMusicPlaying ? setCurTime(state.curTime) : play();
}

let interval = null;

function play() {
  state.isMusicPlaying = true;
  const startMusicTime = state.curTime;

  // DANCER DRAG 막기
  state.selectedBoxIdx = -1;
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

    if(state.curTime == newCurTime) return;

    /* 다음 TIME_UNIT에 도달한 경우 */

    /** 노래 끝난 경우 */
    if(newCurTime >= state.noteInfo.duration) {
      pauseMusic();
      setCurTime(state.noteInfo.duration);
    }
    /** 노래 아직 안 끝남 */
    else {
      state.curTime = newCurTime;
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
    state.curTime = ms;
  }
  if(state.isMusicPlaying) {
    state.isMusicPlaying = false;
    clearInterval(interval);
    timeline.pause(state.curTime);
    musicPlayer.pause(state.curTime);
    stage.stopAndSetPosition(state.curTime);
  }
  stage.evalDraggable({ isMusicPlaying: false });
}

function setCurTime(ms) {
  // 노래 PAUSE
  pauseMusic();

  // state 업데이트
  state.curTime = ms;
  // TIME MARKER 이동
  timeline.moveTimeMarker(ms);
  // MUSIC PLAYER 업데이트
  musicPlayer.curTime = ms;
  // DANCER 이동
  update();
}

function update() {
  stage.stopAndSetPosition(state.curTime);

  // BOX 안으로 들어왔는지 검사
  let id = 0;
  for(; id < state.formations.length; id++) {
    if(state.curTime <= state.formations[id].start + state.formations[id].duration) {
      // BOX 안으로 들어온 경우: DRAGGABLE=true
      if(state.formations[id].start <= state.curTime) {
        state.selectedBoxIdx = id;
        stage.evalDraggable({ isBoxSelected: true });
      }
      // BOX 밖인 경우: DRAGGABLE=false
      else {
        state.selectedBoxIdx = -1;
        stage.evalDraggable({ isBoxSelected: false });
      }
      // BOX MARK 업데이트
      timeline.markBox(state.selectedBoxIdx);
      break;
    }
  }
  // 모든 BOX보다 오른쪽인 경우
  if(id == state.formations.length) {
    state.selectedBoxIdx = -1;
    timeline.markBox(-1);
  }

  toolbar.update(state.selectedBoxIdx);
}

/*********************
 *** FORMATION BOX ***
 *********************/

function addFormationBox() {
  if(state.isMusicPlaying) {
    new Toast("노래 재생중입니다.", "warning");
    return;
  }
  
  if(!checkFormationAddable()) {
    // Toast 창 띄우기
    new Toast("추가할 수 없는 곳이에요.", "warning");
    return;
  }

  const { noteInfo: { duration }, formations, curTime, selectedBoxIdx } = state;

  console.log("formations", formations);
  
  /* 새로 만들 BOX의 INDEX */
  let idx = 0;
  for(; idx < formations.length; idx++) {
    if(curTime < formations[idx].start) break;
  }
  
  console.log("새로운 index", idx);

  /* 선택된 BOX가 새로운 BOX보다 오른쪽인 경우 */
  if(selectedBoxIdx >= idx)
  state.selectedBoxIdx++;

  /* 새로 만들 BOX의 길이 설정(최대 5*TIME_UNIT) */
  let boxDuration;

  // 오른쪽에 아무 BOX도 없는 경우: 노래 넘어가지 않도록 길이 설정
  if(idx == formations.length)
  boxDuration = duration - curTime >= 5*TIME_UNIT ? 5*TIME_UNIT : duration - curTime;
  // 오른쪽에 BOX가 있는 경우: (사이 공간-1) 만큼 설정
  else
  boxDuration = formations[idx].start - curTime > 5*TIME_UNIT ? 5*TIME_UNIT : formations[idx].start - curTime - TIME_UNIT;

  const curPos = [];
  stage.curPosition.forEach(pos => curPos[pos.did] = {...pos}); // stage.curPos deep-copy
  state.formations.splice(idx, 0, {
    start: curTime,
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
  const { noteInfo: { duration }, formations, curTime } = state;

  // curTime 유효성 검사
  if(curTime < 0 || duration <= curTime + TIME_UNIT)
  return false;

  // curTime 을 포함하거나 바로 오른쪽에 있는 BOX 를 찾는다
  let i = 0;
  for(; i<formations.length; i++) {
    if(curTime <= formations[i].start + formations[i].duration) break;
  }

  // 모든 BOX 보다 오른쪽에 있는 경우
  if(i == formations.length) return true;

  // BOX 를 만들 공간(최소 TIME_UNIT)이 충분한 경우
  if(curTime < formations[i].start - TIME_UNIT) return true;

  return false;
}

function deleteFormationBox() {
  const targetId = state.selectedBoxIdx;
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
  const targetId = state.selectedBoxIdx;
  if(targetId == -1) return;

  state.copiedFormation = [];
  stage.curPosition.forEach(pos => state.copiedFormation[pos.did] = {...pos}); // deep copy
  new Toast("복사 되었습니다.", "success");
}

function pasteFormation() {
  const targetId = state.selectedBoxIdx;
  if(targetId == -1) return;

  if(state.copiedFormation.length == 0) {
    new Toast("복사한 대열이 없어요.", "warning");
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
  console.log("selectFormationBox", idx);
  pauseMusic();

  // 선택된 BOX를 선택한 경우: Nothing
  if(state.selectedBoxIdx == idx) return;

  // 새로운 BOX를 선택한 경우
  setCurTime(state.formations[idx].start);
}

function changeFormationTimeAndDuration({ id, start, duration }) {
  console.log(state.formations, id);
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

function addDancer() {
  if(state.isMusicPlaying) {
    new Toast("노래 재생중입니다.", "warning");
    return;
  }
  const did = state.dancers.length;
  state.dancers.push({
    id: did,
    name: did+"",
    color: "#ff631b"
  });
  state.formations.forEach(formation => {
    formation.positionsAtSameTime.push({ did, x: 0, y: 0 });
  });
  stage.stopAndSetPosition(state.curTime);
  stage.addDancer(did);
  sideScreen.addDancer(did);
}

function deleteDancer(did) {
  console.log("deleteDancer", did);
  state.dancers.splice(did, 1);
  state.dancers.forEach(dancer => {
    if(dancer.id > did)
    dancer.id--;
  })
  console.log(state.dancers);
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
  console.log(did, color, state.dancers);
  stage.changeColor(did);
}

/**
 * TODO
 * 
 * 박스 사이에서 play 한 경우
 * 박스 위치/길이 조절
 * 박스 추가
 * play 중 스크롤 이동
 * 플레이 중 다른 이벤트들 막기
 * 노래 재생 중 스크롤 자동 이동
 */