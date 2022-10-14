const TAG = "MusicPlayer.mjs/";

export default class MusicPlayer {
  constructor({ musicInfo, curTime, clickPlayBtn, addFormationBox }) {
    this.$playerSection = document.createElement("div");
    this.$playerSection.id = "player_section";

    this.isMusicPlaying = false;

    // TRACK
    const $track = document.createElement("div");
    $track.id = "track";
    this.$progress = document.createElement("div");
    this.$progress.id = "progress";
    this.$progress.style.width = "0";
    $track.appendChild(this.$progress);

    const $timeAndBtn = document.createElement("div");
    $timeAndBtn.id = "time_and_btn";

    // TIME TEXT
    this.$curTimeText = document.createElement("div");
    this.$curTimeText.id = "curtime_text";
    this.$curTimeText.className = "time_number";
    const $curTimeSec = document.createElement("div");
    $curTimeSec.className = "min_sec";
    let $textNode = document.createTextNode("0:00.");
    $curTimeSec.appendChild($textNode);
    const $curTimeMSec = document.createElement("div");
    $curTimeMSec.className = "millisec";
    $textNode = document.createTextNode("000");
    $curTimeMSec.appendChild($textNode);
    this.$curTimeText.appendChild($curTimeSec);
    this.$curTimeText.appendChild($curTimeMSec);

    // BUTTON
    const $btnContainer = document.createElement("div");
    $btnContainer.id = "btn_container";

    const $addBtn = document.createElement("div");
    $addBtn.id = "add_btn";
    $addBtn.className = "icon_btn";
    $addBtn.onclick = addFormationBox;
    const $addIcon = document.createElement("object");
    $addIcon.id = "add";
    $addIcon.type = "image/svg+xml";
    $addIcon.data = "./assets/icons/Large(32)/Add.svg";
    $addBtn.appendChild($addIcon);

    const $playBtn = document.createElement("div");
    $playBtn.id = "play_btn";
    $playBtn.className = "icon_btn";
    $playBtn.onclick = clickPlayBtn;
    this.$playIcon = document.createElement("object");
    this.$playIcon.id = "play";
    this.$playIcon.type = "image/svg+xml";
    this.$playIcon.data = "./assets/icons/Large(32)/Play.svg";
    this.$pauseIcon = document.createElement("object");
    this.$pauseIcon.id = "pause";
    this.$pauseIcon.type = "image/svg+xml";
    this.$pauseIcon.data = "./assets/icons/Large(32)/Pause.svg";
    this.$pauseIcon.style.display = "none";
    $playBtn.appendChild(this.$playIcon);
    $playBtn.appendChild(this.$pauseIcon);

    $btnContainer.appendChild($addBtn);
    $btnContainer.appendChild($playBtn);

    // DURATION TEXT
    const $durationText = document.createElement("div");
    $durationText.id = "duration_text";
    $durationText.className = "time_number";
    const $durationSec = document.createElement("div");
    $durationSec.className = "min_sec";
    $textNode = document.createTextNode("0:00.");
    $durationSec.appendChild($textNode);
    const $durationMSec = document.createElement("div");
    $durationMSec.className = "millisec";
    $textNode = document.createTextNode("000");
    $durationMSec.appendChild($textNode);
    $durationText.appendChild($durationSec);
    $durationText.appendChild($durationMSec);

    const text = musicDurationFormat(musicInfo.duration, true);
    $durationText.children[0].childNodes[0].data = text.slice(0, -3);
    $durationText.children[1].childNodes[0].data = text.slice(-3);

    $timeAndBtn.appendChild(this.$curTimeText);
    $timeAndBtn.appendChild($btnContainer);
    $timeAndBtn.appendChild($durationText);

    this.$playerSection.appendChild($track);
    this.$playerSection.appendChild($timeAndBtn);

    this.musicCanPlay = musicInfo.name == "" ? false : true;
    this.$audio = document.getElementById("audio");
    // this.$audio.src = musicInfo.name;
    //this.$audio.onloadedmetadata = () => console.log("노래길이:", this.$audio.duration);
    this._curTime = curTime;
    this.musicDuration = musicInfo.duration; // ms
  }

  setCurTimeText(ms) {
    const text = musicDurationFormat(ms, true);
    this.$curTimeText.children[0].childNodes[0].data = text.slice(0, -3);
    this.$curTimeText.children[1].childNodes[0].data = text.slice(-3);
  }

  moveProgress(ms) {
    this.$progress.style.width = ms / this.musicDuration * 100 + "%";
  }

  play() {
    this.$audio.play();
    this.$playIcon.style.display = "none";
    this.$pauseIcon.style.display = "block";

    this.$progress.style.transitionDuration = this.musicDuration - this._curTime + "ms";
    this.$progress.style.width = "100%";
  }

  /* PAUSE 후, TIME_UNIT 으로 나누어 떨어지는 시간으로 설정 */
  pause(ms) {
    this.$audio.pause();
    this._curTime = ms;
    this.$audio.currentTime = ms / 1000;
    this.setCurTimeText(ms);
    this.$progress.style.transitionDuration = "0s";
    this.moveProgress(ms);
    this.$playIcon.style.display = "block";
    this.$pauseIcon.style.display = "none";
  }

  set curTime(ms) {
    this.pause(ms);
  }

  get audioCurTime() {
    return floorTime(this.$audio.currentTime * 1000);
  }
}
