import Dancer from "./Dancer.mjs";

const TAG = "Stage.mjs/";

export default class Stage {
  #curPos;

  constructor({ dancerArray, formationArray, gap }) {
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
    this.axisIsShown = true;
    this.isSnaped = false;
    this.nameIsShown = false;

    this.$stageSection = document.createElement("div");
    this.$stageSection.id = "stage_section";

    /* COORDINATE */
    this.$stageAxis = document.createElement("div");
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
    this.$stageSection.appendChild(this.$stageAxis);

    /* STAGE */
    this.$stageDancer = document.createElement("div");
    this.$stageDancer.setAttribute("id", "stage_dancer");
    this.$stageDancer.ondragover = e => e.preventDefault();
    this.dancerArray.forEach((dancer, idx) => {
      const dancerObj = new Dancer({ dancer, position: this.#curPos[idx], gap });
      this.dancerObjArray.push(dancerObj);
      this.$stageDancer.appendChild(dancerObj.$dancer);
    });
    this.$stageSection.appendChild(this.$stageDancer);

    /* BUTTON */
    const $coordBtn = document.getElementById("coordinate_btn");
    $coordBtn.onclick = () => {
      this.showAxis();
      if(this.axisIsShown) $coordBtn.classList.add("active");
      else $coordBtn.classList.remove("active");
    }
    const $snapBtn = document.getElementById("snap_btn");
    $snapBtn.onclick = () => {
      this.snap();
      if(this.isSnaped) $snapBtn.classList.add("active");
      else $snapBtn.classList.remove("active");
    }
    const $dancerNameBtn = document.getElementById("dancer_name_btn");
    $dancerNameBtn.onclick = () => {
      this.showDancerName();
      if(this.nameIsShown) $dancerNameBtn.classList.add("active");
      else $dancerNameBtn.classList.remove("active");
    }
    const $rotateBtn = document.getElementById("rotate_btn");
    $rotateBtn.onclick = () => {
      this.rotate();
      if(this.isRotated) $rotateBtn.classList.add("active");
      else $rotateBtn.classList.remove("active");
    }
    const $slopeBtn = document.getElementById("slope_btn");
    $slopeBtn.onclick = () => {
      this.slope();
      if(this.isSloped) $slopeBtn.classList.add("active");
      else $slopeBtn.classList.remove("active");
    }
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
    this.dancerObjArray.forEach((dancer, did) => dancer.move(toPos[did], duration));
  }

  stopAndSetPosition(ms) {
    this.#curPos = this.calcPositionAt(ms);
    this.dancerObjArray.forEach(dancer => dancer.stop());
    this.dancerObjArray.forEach((dancer, did) => dancer.setPosition(this.#curPos[did]));
  }

  calcPositionAt(ms) {
    let newPos;
  
    for(let i in this.formationArray) {
      // i BOX 내부이거나 왼쪽인 경우
      if(ms <= this.formationArray[i].time + this.formationArray[i].duration) {
        // BOX 내부에 걸친 경우 || 첫번째 BOX 보다 왼쪽인 경우
        if(this.formationArray[i].time <= ms || i == 0) {
          newPos = this.formationArray[i].positionsAtSameTime;
        }
        // BOX 보다 왼쪽인 경우
        else {
          const prevBoxPosition = this.formationArray[i-1].positionsAtSameTime;
          const prevBoxEndTime = this.formationArray[i-1].time + this.formationArray[i-1].duration
          const ratio = (ms - prevBoxEndTime) / (this.formationArray[i].time - prevBoxEndTime);
          newPos = this.formationArray[i].positionsAtSameTime.map(({ did, posx, posy }) =>
          ({
            did,
            posx: prevBoxPosition[did].posx + (posx - prevBoxPosition[did].posx) * ratio,
            posy: prevBoxPosition[did].posy + (posy - prevBoxPosition[did].posy) * ratio
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

  rotate() {
    if(this.isBlocked) return;
    this.isBlocked = true;
    setTimeout(() => this.isBlocked = false, 1000);
    this.isRotated = !this.isRotated;

    /* ROTATE */
    if(this.isRotated) {
      this.$stageSection.style.transform += "rotateZ(180deg)";
    }
    /* UNROTATE */
    else {
      this.$stageSection.style.transform = this.isSloped ? "translateY(-20px) rotateX(30deg)" : "";
    }
    this.evalDraggable({});
  }

  slope() {
    if(this.isBlocked) return;
    this.isBlocked = true;
    setTimeout(() => this.isBlocked = false, 1200);
    this.isSloped = !this.isSloped;

    if(this.isRotated) {
      /* ROTATE 상태에서 SLOPE */
      if(this.isSloped) {
        this.$stageSection.style.transform += "translateY(20px) rotateX(-30deg)";
        setTimeout(() => {
          this.$stageSection.style.transitionDuration = "0s";
          this.$stageSection.style.transform = "translateY(-20px) rotateX(30deg) rotateZ(180deg)";
          setTimeout(() => this.$stageSection.style.transitionDuration = "1s", 100);
        }, 1000);
      }
      /* ROTATE 상태에서 UNSLOPE */
      else {
        this.$stageSection.style.transform += "rotateX(30deg) translateY(-20px)";
        setTimeout(() => {
          this.$stageSection.style.transitionDuration = "0s";
          this.$stageSection.style.transform = "rotateZ(180deg)";
          setTimeout(() => this.$stageSection.style.transitionDuration = "1s", 100);
        }, 1000);
      }
    }
    /* 기본 상태에서 SLOPE | UNSLOPE */
    else {
      this.$stageSection.style.transform = this.isSloped ? "translateY(-20px) rotateX(30deg)" : "";
    }

    /* DANCER 3D 변환 */
    if(this.isSloped)
    this.dancerObjArray.forEach($dancer => $dancer.slope());
    else
    this.dancerObjArray.forEach($dancer => $dancer.unslope());

    this.evalDraggable({});
  }

  showDancerName() {
    this.nameIsShown = !this.nameIsShown;
    this.dancerObjArray.forEach($dancer => $dancer.showName(this.nameIsShown));
  }

  showAxis() {
    this.axisIsShown = !this.axisIsShown;
    this.$stageAxis.style.display = this.axisIsShown ? "block" : "none";
  }

  snap() {
    this.isSnaped = !this.isSnaped;
    this.dancerObjArray.forEach(dancer => dancer.snap(this.isSnaped));
  }

  changeName(id, name) {
    this.dancerObjArray[id].changeName(name, this.nameIsShown);
  }

  changeColor(id) {
    this.dancerObjArray[id].changeColor();
  }

  addDancer(id) {
    const dancer = this.dancerArray[id];
    const dancerObj = new Dancer({ dancer, position: this.#curPos[id], gap: this.gap });
    this.dancerObjArray.push(dancerObj);
    this.$stageDancer.appendChild(dancerObj.$dancer);
    this.evalDraggable({});
  }

  removeDancer(id) {
    const target = this.dancerObjArray.splice(id, 1)[0];
    this.$stageDancer.removeChild(target.$dancer);
    this.dancerObjArray.forEach(dancer => {
      if(dancer.id > id)
      dancer.decreaseId(this.nameIsShown);
    });
  }
}