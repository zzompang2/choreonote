import Toast from "./Toast.mjs";

const TAG = "Dancer.mjs/";

export default class Dancer {
  constructor({ dancer, position, gap }) {
    this.dancer = dancer;
    this.draggable = false;
    this.position = position;
    this.$dancer = document.createElement("div");
    this.$dancer.id = dancer.id;
    this.$dancer.className = "dancer";
    this.$dancer.draggable = true;
    this.$dancer.ondragstart = e => dragStart(e);
    this.$dancer.ondrag = e => drag(e);
    this.$dancer.ondragend = e => dragEnd(e);
    this.$dancer.style.left = STAGE_WIDTH/2 + position.posx + "px";
    this.$dancer.style.top = STAGE_HEIGHT/2 + position.posy + "px";
    this.$dancer.style.transitionDuration = "100ms";
    this.isSnap = false;
    this.reason = "";

    // 윗면
    const $up = document.createElement("div");
    $up.className = `up color${dancer.color}`;
    const $textNode = document.createTextNode(dancer.id+1);  // 표시할 숫자는 id+1
    $up.appendChild($textNode);
    this.$dancer.appendChild($up);

    const $sideGroup = document.createElement("div");
    $sideGroup.className = "side_group";
    for(let i=0; i<24; i++) {
      const $side = document.createElement("div");
      $side.className = `side side_color${dancer.color}`;
      $side.style.transform = `translateY(-20px) rotateX(-90deg) rotateY(${15*i}deg) translateZ(14.5px)`;
      $sideGroup.appendChild($side);
    }
    this.$dancer.appendChild($sideGroup);
    
    const initialPos = { x: 0, y: 0 };
    const emptyImg = document.createElement("img");

    const dragStart = e => {
      if(!this.draggable) {
        new Toast(this.reason, "warning");
        return false;
      }
      // 드래그한 요소의 데이터 자료 형태 & 그 값을 설정해 저장
      initialPos.x = e.clientX;
      initialPos.y = e.clientY;
      this.$dancer.style.transitionDuration = "0ms";
      e.dataTransfer.setDragImage(emptyImg, 0, 0);
    };

    const drag = e => {
      if(this.isSnap) {
        const newX = roundPos(this.position.posx + e.clientX - initialPos.x, gap);
        const newY = roundPos(this.position.posy + e.clientY - initialPos.y, gap);
        e.target.style.transform = `translate(${newX - this.position.posx}px, ${newY - this.position.posy}px)`;
      }
      else
      e.target.style.transform = `translate(${e.clientX - initialPos.x}px, ${e.clientY - initialPos.y}px)`;
    }

    const dragEnd = e => {
      // 실제 formationArray 배열의 값이 변경됨!
      let newX = this.position.posx + (e.clientX - initialPos.x);
      let newY = this.position.posy + (e.clientY - initialPos.y);

      if(this.isSnap) {
        newX = roundPos(newX, gap);
        newY = roundPos(newY, gap);
      }

      this.position.posx = newX;
      this.position.posy = newY;

      // 실제 위치 이동
      e.target.style.transform = null;
      e.target.style.left = STAGE_WIDTH/2 + newX + "px";
      e.target.style.top = STAGE_HEIGHT/2 + newY + "px";
      // DRAG 끝낼 때 가끔 (0, 0)으로 갔다오는 현상을 해결하기 위해 10ms 이후에 적용
      setTimeout(() => this.$dancer.style.transitionDuration = "100ms", 10);
    };
  }

  setDraggable(isDraggable, reason) {
    this.draggable = isDraggable;
    this.reason = reason;
  }

  setPosition(pos) {
    this.position = pos;
    this.$dancer.style.left = STAGE_WIDTH/2 + pos.posx + "px";
    this.$dancer.style.top = STAGE_HEIGHT/2 + pos.posy + "px";
  }

  move(destPos, duration) {
    this.$dancer.style.transitionDuration = duration + "ms";
    this.$dancer.style.left = STAGE_WIDTH/2 + destPos.posx + "px";
    this.$dancer.style.top = STAGE_HEIGHT/2 + destPos.posy + "px";
  }

  stop() {
    this.$dancer.style.transitionDuration = "100ms";
  }

  slope() {
    // $up
    this.$dancer.children[0].style.transform = "translateZ(40px)";
    this.$dancer.children[1].style.transform = "scaleZ(1)";
  }

  unslope() {
    this.$dancer.children[0].style.transform = "translateZ(0px)";
    this.$dancer.children[1].style.transform = "scaleZ(0)";
  }

  snap(isSnap) {
    this.isSnap = isSnap;
  }

  showName(nameIsShown) {
    if(nameIsShown) {
      this.$dancer.firstChild.innerText = this.dancer.name.slice(0, 3);
      this.$dancer.firstChild.classList.add("name");
    }
    else {
      this.$dancer.firstChild.innerText = this.dancer.id+1;
      this.$dancer.firstChild.classList.remove("name");
    }
  }

  changeName(name, nameIsShown) {
    //this.dancer.name = name;
    if(nameIsShown)
    this.$dancer.firstChild.innerText = this.dancer.name.slice(0, 3);
  }

  changeColor() {
    const color = this.dancer.color;
    const oldColor = color - 1 < 0 ? COLOR_NUM-1 : color - 1;

    this.$dancer.firstChild.classList.remove(`color${oldColor}`);
    this.$dancer.firstChild.classList.add(`color${color}`);
    [...this.$dancer.lastChild.children].forEach($side => {
      $side.classList.remove(`side_color${oldColor}`);
      $side.classList.add(`side_color${color}`);
    });
  }

  decreaseId(nameIsShown) {
    // this.dancer.id--;
    this.$dancer.id = this.dancer.id;
    if(!nameIsShown)
    this.$dancer.firstChild.innerText = this.dancer.id+1;
  }
}