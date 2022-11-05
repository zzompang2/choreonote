import { STAGE_WIDTH, STAGE_HEIGHT, COLOR_NUM, roundPos, $ } from "/js/constant.js";
import Toast from "./Toast.js";

const TAG = "Dancer.js/";

export default class Dancer {
  constructor({ dancer, position, gap, selectDancer, isSnap }) {    
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
    this.$dancer.style.left = STAGE_WIDTH/2 + position.x + "px";
    this.$dancer.style.top = STAGE_HEIGHT/2 + position.y + "px";
    this.$dancer.style.transitionDuration = "100ms";
    this.isSnap = isSnap;
    this.reason = "";
    
    this.$dancer.onclick = e => {
      e.stopPropagation();
      selectDancer(dancer.id);
    }

    // 윗면
    const $up = document.createElement("div");
    $up.className = "up";
    $up.style.backgroundColor = dancer.color;
    const $textNode = document.createTextNode(dancer.id);
    $up.appendChild($textNode);
    this.$dancer.appendChild($up);

    // SIDE
    this.getSideColor = (hexColor) => {
      const magnitude = -20;
      hexColor = hexColor.replace(`#`, ``);
      if (hexColor.length === 6) {
        const decimalColor = parseInt(hexColor, 16);
        let r = (decimalColor >> 16) + magnitude;
        r > 255 && (r = 255);
        r < 0 && (r = 0);
        let g = (decimalColor & 0x0000ff) + magnitude;
        g > 255 && (g = 255);
        g < 0 && (g = 0);
        let b = ((decimalColor >> 8) & 0x00ff) + magnitude;
        b > 255 && (b = 255);
        b < 0 && (b = 0);
        let result = (g | (b << 8) | (r << 16)).toString(16);

        while(result.length !== 6) {
          result = "0" + result;
        }
        return `#${result}`;
      } else {
        return hexColor;
      }
    };
    
    this.getSideColor("#1af0ff");
    
    const $sideGroup = document.createElement("div");
    $sideGroup.className = "side_group";
    const sideColor = this.getSideColor(dancer.color);
    for(let i=0; i<24; i++) {
      const $side = document.createElement("div");
      $side.className = "side";
      $side.style.backgroundColor = sideColor;
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
        const newX = roundPos(this.position.x + e.clientX - initialPos.x, gap);
        const newY = roundPos(this.position.y + e.clientY - initialPos.y, gap);
        e.target.style.transform = `translate(${newX - this.position.x}px, ${newY - this.position.y}px)`;
      }
      else
      e.target.style.transform = `translate(${e.clientX - initialPos.x}px, ${e.clientY - initialPos.y}px)`;
    	e.dataTransfer.effectAllowed = "move";
    }

    const dragEnd = e => {
      // 실제 formationArray 배열의 값이 변경됨!
      let newX = this.position.x + (e.clientX - initialPos.x);
      let newY = this.position.y + (e.clientY - initialPos.y);

      if(this.isSnap) {
        newX = roundPos(newX, gap);
        newY = roundPos(newY, gap);
      }
      
      // STAGE 밖으로 나갔는지 검사
      newX = newX > 300 ? 300 : (newX < -300 ? -300 : newX);
      newY = newY > 200 ? 200 : (newY < -200 ? -200 : newY);

      this.position.x = newX;
      this.position.y = newY;

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
    this.$dancer.style.left = STAGE_WIDTH/2 + pos.x + "px";
    this.$dancer.style.top = STAGE_HEIGHT/2 + pos.y + "px";
  }

  move(destPos, duration) {
    this.$dancer.style.transitionDuration = duration + "ms";
    this.$dancer.style.left = STAGE_WIDTH/2 + destPos.x + "px";
    this.$dancer.style.top = STAGE_HEIGHT/2 + destPos.y + "px";
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
      this.$dancer.firstChild.innerText = this.dancer.id;
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
    const sideColor = this.getSideColor(color);
    
    this.$dancer.querySelector(".up").style.backgroundColor = color;

    [...this.$dancer.lastChild.children].forEach($side => {
      $side.style.backgroundColor = sideColor;
    });
  }

  decreaseId(nameIsShown) {
    // this.dancer.id--;
    this.$dancer.id = this.dancer.id-1;
    if(!nameIsShown)
    this.$dancer.firstChild.innerText = this.dancer.id;
  }
  
  select() {
    this.$dancer.classList.add("dancer--selected");
  }
  
  unselect() {
    this.$dancer.classList.remove("dancer--selected");
  }
}