import FormationBox from "./FormationBox.mjs";

// import * as CONST from "../values/Constants.js";
const TAG = "Timeline.mjs/";

export default class Timeline {
  constructor({
    musicDuration,
    formationArray,
    pauseMusic,
    setCurTime,
    selectFormationBox,
    changeFormationTimeAndDuration,
  }) {
    this.curTime = 0;
    this.musicDuration = musicDuration;
    this.formationArray = formationArray;
    this.selectFormationBox = selectFormationBox;
    this.changeFormationTimeAndDuration = changeFormationTimeAndDuration;
    this.$timeline = document.getElementById("timeline_section");
    const $container = this.$timeline.children[0];
    this.markedBoxIdx = -1;

    $container.style.width = musicDuration / 1000 * PIXEL_PER_SEC + TIMELINE_PADDING*2 + "px";
    /* TIMELINE */
    //[...$container.children].forEach(elem => elem.remove());
    const $timeRuler = document.createElement("div");
    const $timeNumber = document.createElement("div");
    const $timeScale = document.createElement("div");

    $timeRuler.id = "time_ruler";
    $timeNumber.id = "time_number";
    $timeScale.id = "time_scale";
    
    this.$formationBoxSection = document.createElement("div");
    this.$formationBoxSection.id = "formation_box_section";

    /* TIME MARKER */
    this.$timeMarker = document.createElement("div");
    this.$timeMarker.setAttribute("id", "time_marker");
    this.$timeMarker.style.left = TIMELINE_PADDING + "px";
    const $line = document.createElement("div");
    $line.setAttribute("id", "line");
    $line.setAttribute("draggable", false);
    const $handle = document.createElement("div");
    $handle.setAttribute("id", "handle");
    $handle.setAttribute("draggable", true);
    $handle.ondragstart = e => dragStart(e);
    $handle.ondrag = e => drag(e);
    $handle.ondragend = e => dragEnd(e);
    this.$timeMarker.appendChild($line);
    this.$timeMarker.appendChild($handle);

    let initialPos = 0;
    const emptyImg = document.createElement("img");
    this.dragging = false;

    const dragStart = e => {
      initialPos = e.clientX;
      /* 드래그 잔상 지우기 위해 드래그 이미지에 빈 img 태그 넣음 */
      e.dataTransfer.setDragImage(emptyImg, 0, 0);
      pauseMusic();
      this.dragging = true;
    };

    const drag = e => {
      let newTime = this.curTime + roundTime((e.clientX - initialPos-HANDLE_WIDTH/2) / PIXEL_PER_SEC * 1000);
      newTime = newTime > 0 ? newTime : 0;
      setCurTime(newTime);
      this.$timeMarker.style.transform = `translate(${e.clientX - initialPos}px, 0)`;
    }

    const dragEnd = e => {
      // 실제 위치 이동
      this.$timeMarker.style.transform = null;
      let newTime = roundTime(this.curTime + (e.offsetX-HANDLE_WIDTH/2) / PIXEL_PER_SEC * 1000);
      newTime = newTime <= 0 ? 0 : newTime > musicDuration ? musicDuration : newTime;
      this.dragging = false;
      setCurTime(newTime);
    };

    /* TIME RULER */
    /** TIME NUMBER */
    let $space = document.createElement("div");
    $space.style.width = TIMELINE_PADDING - PIXEL_PER_SEC/2 + "px";
    $timeNumber.appendChild($space);

    for (let sec=0; sec <= musicDuration / 1000; sec++) {
      const $div = document.createElement("div");
      $div.style.width = PIXEL_PER_SEC + "px";
      $div.setAttribute("class", "number");
      $div.setAttribute("id", sec);
      const $textNode = document.createTextNode(musicDurationFormat(sec * 1000));
      $div.appendChild($textNode);
      $timeNumber.appendChild($div);
    }

    /** TIME SCALE */
    $space = document.createElement("div");
    $space.style.width = TIMELINE_PADDING - PIXEL_PER_SEC/8 + "px";
    $timeScale.appendChild($space);

    for (let i=0; i<musicDuration/250+1; i++) {
      const $wrap = document.createElement("div");
      $wrap.setAttribute("id", i);
      $wrap.setAttribute("class", "scale_wrap");
      $wrap.style.width = PIXEL_PER_SEC/4 + "px";
      const $div = document.createElement("div");
      $div.setAttribute("class", "scale");
      $div.style.height = i % 4 == 0 ? '8px' : '4px';
      $wrap.appendChild($div);
      $timeScale.appendChild($wrap);
    }

    const $divider = document.createElement("div");
    $divider.id = "divider";

    this.$formationBoxSection.appendChild($divider);

    let $fragment = document.createDocumentFragment();
    $timeRuler.appendChild($timeNumber);
    $timeRuler.appendChild($timeScale);
    $fragment.appendChild($timeRuler);
    $fragment.appendChild(this.$formationBoxSection);
    $fragment.appendChild(this.$timeMarker);
    $fragment.appendChild($divider);
    $container.appendChild($fragment);

    $timeRuler.addEventListener("click", e => clickTimeRuler(e), true);

    // (clientX - target.offsetLeft) 는 스크린 기준이라, 스크롤된 상태를 고려하지 않음. 따라서 offsetX 사용
    const clickTimeRuler = ({ offsetX }) => {
      const offset = offsetX - TIMELINE_PADDING;
      let selectedTime = roundTime(offset / PIXEL_PER_SEC * 1000);
      selectedTime = selectedTime < 0 ? 0 : selectedTime > musicDuration ? musicDuration : selectedTime;
      setCurTime(selectedTime);
    }

    /* FORMATION BOX */
    $fragment = document.createDocumentFragment();

    this.formationList = [];
    formationArray.forEach((formationInfo, id) => {
      const formationBox = new FormationBox({
        formationInfo, id,
        selectFormationBox,
        changeFormationTimeAndDuration,
      });
      $fragment.appendChild(formationBox.$box);
      this.formationList.push(formationBox);
    })
    this.$formationBoxSection.appendChild($fragment);
  }

  moveTimeMarker(ms) {
    if(this.dragging) return;
    this.curTime = ms;
    this.$timeMarker.style.left = TIMELINE_PADDING + ms/1000 * PIXEL_PER_SEC + "px";

  }

  play() {
    this.$timeMarker.style.transitionDuration = this.musicDuration - this.curTime + "ms";
    this.$timeMarker.style.left = TIMELINE_PADDING + this.musicDuration/1000 * PIXEL_PER_SEC + "px";
    this.interval = setInterval(() => {
      this.$timeline.scrollBy(1, 0);
    }, 1000/PIXEL_PER_SEC);
  }

  pause(ms) {
    this.$timeMarker.style.transitionDuration = "0ms";
    this.moveTimeMarker(ms);
    clearInterval(this.interval);
  }

  markBox(id) {
    // 이미 선택된 BOX인 경우
    if(this.markedBoxIdx == id) return;

    // 선택된 BOX 초기화
    if(this.markedBoxIdx != -1) {
      this.formationList[this.markedBoxIdx].unmark();
    }
    // 새로운 BOX 선택
    if(id != -1) {
      this.formationList[id].mark();
    }
    this.markedBoxIdx = id;
  }

  addFormationBox(id) {
    this.formationList.forEach(form => {
      if(form.id >= id) {
        form.setId(form.id+1);
      }
    })
    const formationBox = new FormationBox({
      formationInfo: this.formationArray[id],
      id,
      selectFormationBox: this.selectFormationBox,
      changeFormationTimeAndDuration: this.changeFormationTimeAndDuration,
    });
    this.formationList.splice(id, 0, formationBox);
    this.$formationBoxSection.insertBefore(formationBox.$box, this.$formationBoxSection.children[id]);
  }

  deleteFormationBox(id) {
    this.formationList.splice(id, 1);
    this.formationList.forEach(form => {
      if(form.id > id) {
        form.setId(form.id-1);
      }
    });
    this.$formationBoxSection.removeChild(this.$formationBoxSection.children[id]);
    this.markedBoxIdx = -1;
  }

  updateFormationBox(id) {
    this.formationList[id].updateFormationBox();
  }

  moveFormationBox(id, newId) {
    const target = this.formationList.splice(id, 1)[0];
    this.formationList.splice(newId, 0, target);
    this.formationList.forEach((form, id) => {
      if(form.id != id) {
        form.setId(id);
      }
    });
    this.formationList[newId].updateFormationBox();

    const targetElem = this.$formationBoxSection.removeChild(this.$formationBoxSection.children[id]);
    this.$formationBoxSection.insertBefore(targetElem, this.$formationBoxSection.children[newId]);

    if(this.markedBoxIdx == id) {
      this.markedBoxIdx = newId;
    }
  }
}