import { STAGE_WIDTH, STAGE_HEIGHT, $ } from "/js/constant.js";
import Dancer from "./Dancer.js";

const TAG = "Stage.js/";

export default class Stage {
  #curPos;

  constructor({ dancerArray, formationArray, gap, selectDancer }) {
    this.gap = gap;
    this.formationBoxIdx = 0;
    this.dancerArray = dancerArray;
    this.formationArray = formationArray;
    this.#curPos = formationArray[0].positionsAtSameTime;
    this.dancerObjArray = [];
    this.isRotated = false;
    this.isSloped = false;
    this.isBoxSelected = false;
    this.isMusicPlaying = false;
    this.nameIsShown = false;
    this.selectDancer = selectDancer;

    this.$stageSection = $("#stage_section");
    this.$stageWrap = $("#stage_wrap");

    this.$stageSection.onclick = e => {
    	e.stopPropagation();
      selectDancer(-1);
    }
        
    /* COORDINATE */
    this.$stageAxis = $("#stage_axis");
    this.$stageAxis.setAttribute("id", "stage_axis");

    for(let i = 0, left = 0; left < STAGE_WIDTH/2; left += gap) {
      const $axis = document.createElement("div");
      $axis.setAttribute("class", "axis_vertical");
      $axis.style.left = STAGE_WIDTH /2 + left + "px";
      if(i % 4 == 0) $axis.style.width = "2px";
      this.$stageAxis.appendChild($axis);
      i++;
    }
    for(let i = 1, left = gap; left < STAGE_WIDTH/2; left += gap) {
      const $axis = document.createElement("div");
      $axis.setAttribute("class", "axis_vertical");
      $axis.style.left = STAGE_WIDTH /2 - left + "px";
      if(i % 4 == 0) $axis.style.width = "2px";
      this.$stageAxis.appendChild($axis);
      i++;
    }
    for(let i = 0, top = 0; top < STAGE_HEIGHT/2; top += gap) {
      const $axis = document.createElement("div");
      $axis.setAttribute("class", "axis_horizontal");
      $axis.style.top = STAGE_HEIGHT /2 + top + "px";
      if(i % 4 == 0) $axis.style.height = "2px";
      this.$stageAxis.appendChild($axis);
      i++;
    }
    for(let i = 1, top = gap; top < STAGE_HEIGHT/2; top += gap) {
      const $axis = document.createElement("div");
      $axis.setAttribute("class", "axis_horizontal");
      $axis.style.top = STAGE_HEIGHT /2 - top + "px";
      if(i % 4 == 0) $axis.style.height = "2px";
      this.$stageAxis.appendChild($axis);
      i++;
    }

    /* STAGE */
    this.$stageDancer = $("#stage_dancer");
    this.$stageDancer.ondragover = e => e.preventDefault();
    this.dancerArray.forEach((dancer, idx) => {
      const dancerObj = new Dancer({ dancer, position: this.#curPos[dancer.id], gap, selectDancer: this.selectDancer });
      this.dancerObjArray[dancer.id] = dancerObj;
      this.$stageDancer.appendChild(dancerObj.$dancer);
    });

    /* BUTTON */
    $("#coordinate_btn").onclick = e => this.showAxis(e.target.checked);
    $("#snap_btn").onclick = e => this.snap(e.target.checked);
    $("#dancer_name_btn").onclick = e => this.showDancerName(e.target.checked);
    $("#rotate_btn").onclick = e => this.rotate(e.target);
    $("#slope_btn").onclick = e => this.slope(e.target);
  }

  get curPosition() {
    return this.#curPos;
  }

  /**
   * 댄서 드래그 가능해도 되는지 평가한다.
   * @param {bool} isBoxSelected 선택된 BOX 가 있는가
   */
  evalDraggable({ isBoxSelected, isMusicPlaying }) {
    if(isBoxSelected != undefined) {
      this.isBoxSelected = isBoxSelected;
    }
    if(isMusicPlaying != undefined) {
      this.isMusicPlaying = isMusicPlaying;
    }

    // isDraggable = !this.isRotated && !this.isSloped && this.isBoxSelected;
    if(this.isMusicPlaying)
    this.dancerObjArray.forEach(obj => obj.setDraggable(false, "노래 재생중입니다."));
    else if(this.isRotated || this.isSloped)
    this.dancerObjArray.forEach(obj => obj.setDraggable(false, "무대가 회전되어 있거나 3D 상태일 땐 움직일 수 없어요."));
    else if(!this.isBoxSelected)
    this.dancerObjArray.forEach(obj => obj.setDraggable(false, "대열 상자를 먼저 선택해주세요."));
    else
    this.dancerObjArray.forEach(obj => obj.setDraggable(true));
  }

  moveDancers(destPos, duration) {
    const toPos = destPos.positionsAtSameTime;
    this.dancerObjArray.forEach(dancer => dancer.move(toPos[dancer.dancer.id], duration));
  }

  stopAndSetPosition(ms) {
    this.#curPos = this.calcPositionAt(ms);
    this.dancerObjArray.forEach(dancer => dancer.stop());
    this.dancerObjArray.forEach(dancer => {
      dancer.setPosition(this.#curPos[dancer.dancer.id]);
    });
  }

  calcPositionAt(ms) {
    let newPos;
  
    for(let i in this.formationArray) {
      // i BOX 내부이거나 왼쪽인 경우
      if(ms <= this.formationArray[i].start + this.formationArray[i].duration) {
        // BOX 내부에 걸친 경우 || 첫번째 BOX 보다 왼쪽인 경우
        if(this.formationArray[i].start <= ms || i == 0) {
          newPos = this.formationArray[i].positionsAtSameTime;
        }
        // BOX 보다 왼쪽인 경우
        else {
          const prevBoxPosition = this.formationArray[i-1].positionsAtSameTime;
          const prevBoxEndTime = this.formationArray[i-1].start + this.formationArray[i-1].duration;
          const ratio = (ms - prevBoxEndTime) / (this.formationArray[i].start - prevBoxEndTime);
          newPos = this.formationArray[i].positionsAtSameTime.map(({ did, x, y }) =>
          ({
            did,
            x: prevBoxPosition[did].x + (x - prevBoxPosition[did].x) * ratio,
            y: prevBoxPosition[did].y + (y - prevBoxPosition[did].y) * ratio
          }));
        }
        break;
      }
      // i BOX보다 오른쪽인 경우
      // else continue;
    }
    // 마지막 BOX 보다 오른쪽인 경우
    if(newPos === undefined) {
      newPos = this.formationArray[this.formationArray.length-1].positionsAtSameTime;
    }
    return newPos;
  }

  rotate(target) {
    if(this.isBlocked) {
      target.checked = this.isRotated;
      return;
    }
    this.isBlocked = true;
    setTimeout(() => this.isBlocked = false, 1000);
    this.isRotated = target.checked;

    /* ROTATE */
    if(this.isRotated) {
      this.$stageWrap.style.transform += "rotateZ(180deg)";
    }
    /* UNROTATE */
    else {
      this.$stageWrap.style.transform = this.isSloped ? "translateY(-20px) rotateX(30deg)" : "";
    }
    this.evalDraggable({});
  }

  slope(target) {
    if(this.isBlocked) {
      target.checked = this.isSloped;
      return;
    }
    this.isBlocked = true;
    setTimeout(() => this.isBlocked = false, 1200);
    this.isSloped = target.checked;

    if(this.isRotated) {
      /* ROTATE 상태에서 SLOPE */
      if(this.isSloped) {
        this.$stageWrap.style.transform += "translateY(20px) rotateX(-30deg)";
        setTimeout(() => {
          this.$stageWrap.style.transitionDuration = "0s";
          this.$stageWrap.style.transform = "translateY(-20px) rotateX(30deg) rotateZ(180deg)";
          setTimeout(() => this.$stageWrap.style.transitionDuration = "1s", 100);
        }, 1000);
      }
      /* ROTATE 상태에서 UNSLOPE */
      else {
        this.$stageWrap.style.transform += "rotateX(30deg) translateY(-20px)";
        setTimeout(() => {
          this.$stageWrap.style.transitionDuration = "0s";
          this.$stageWrap.style.transform = "rotateZ(180deg)";
          setTimeout(() => this.$stageWrap.style.transitionDuration = "1s", 100);
        }, 1000);
      }
    }
    /* 기본 상태에서 SLOPE | UNSLOPE */
    else {
      this.$stageWrap.style.transform = this.isSloped ? "translateY(-20px) rotateX(30deg)" : "";
    }

    /* DANCER 3D 변환 */
    if(this.isSloped)
    this.dancerObjArray.forEach($dancer => $dancer.slope());
    else
    this.dancerObjArray.forEach($dancer => $dancer.unslope());

    this.evalDraggable({});
  }

  showDancerName(bool) {
    this.nameIsShown = bool;
    this.dancerObjArray.forEach($dancer => $dancer.showName(this.nameIsShown));
  }

  showAxis(bool) {
    this.$stageAxis.style.display = bool ? "block" : "none";
  }

  snap(bool) {
    this.dancerObjArray.forEach($dancer => $dancer.snap(bool));
  }

  changeName(did, name) {
    this.dancerObjArray[did].changeName(name, this.nameIsShown);
  }

  changeColor(did) {
    this.dancerObjArray[did].changeColor();
  }

  addDancer(did) {
    const dancer = this.dancerArray[did];
    const dancerObj = new Dancer({ dancer, position: this.#curPos[did], gap: this.gap, selectDancer: this.selectDancer });
    this.dancerObjArray[did] = dancerObj;
    this.$stageDancer.appendChild(dancerObj.$dancer);
    this.evalDraggable({});
  }

  removeDancer(id) {
    const target = this.dancerObjArray.splice(id, 1)[0];
    this.$stageDancer.removeChild(target.$dancer);
    this.dancerObjArray.forEach(dancer => {
      if(dancer.dancer.id >= id)
      dancer.decreaseId(this.nameIsShown);
    });
  }
  
  select(did) {
    this.dancerObjArray[did].select();
  }
  
  unselect(did) {
    this.dancerObjArray[did].unselect();
  }
}