const TAG = "FormationBox.mjs/";

export default class FormationBox {
  constructor({ formationInfo, id, selectFormationBox, changeFormationTimeAndDuration }) {
    this.id = id;
    this.formationInfo = formationInfo;
    this.$box = document.createElement("div");
    this.$box.id = id;
    this.$box.className = "formation_box";
    this.$box.style.width = formationInfo.duration / 1000 * PIXEL_PER_SEC + "px";
    this.$box.style.left = TIMELINE_PADDING + formationInfo.time / 1000 * PIXEL_PER_SEC + "px";

    const $body = document.createElement("div");
    $body.className = "body";
    $body.draggable = true;
    $body.onclick = e => {
      e.stopPropagation();  // $bg 클릭 방지
      selectFormationBox(this.id);
    }

    let initialX;
    $body.ondragstart = e => {
      initialX = e.clientX;
      /* 드래그 잔상 지우기 위해 드래그 이미지에 빈 img 태그 넣음 */
      const img = document.createElement("img");
      e.dataTransfer.setDragImage(img, 0, 0);
    }
    $body.ondrag = e => {
      if(e.clientX == 0) return;  // 마지막 drag의 clientX가 0으로 가는 오류
      this.$box.style.transform = `translate(${e.clientX - initialX}px, 0)`;
    }
    $body.ondragend = e => {
      // 변경 초기화
      this.$box.style.transform = null;
      // new TIME 계산
      const offset = e.clientX - initialX;
      const newTime = formationInfo.time + roundTime(offset / PIXEL_PER_SEC * 1000);
      changeFormationTimeAndDuration({ id: this.id, time: newTime });
    }
    
    const $handlerLeft = document.createElement("div");
    $handlerLeft.draggable = true;
    $handlerLeft.className = "handler left";
    $handlerLeft.ondragstart = e => {
      initialX = e.clientX;
      /* 드래그 잔상 지우기 위해 드래그 이미지에 빈 img 태그 넣음 */
      const img = document.createElement("img");
      e.dataTransfer.setDragImage(img, 0, 0);
    }
    $handlerLeft.ondrag = e => {
      const offset = e.clientX - initialX;
      this.$box.style.transform = `translate(${offset}px, 0)`;
      const newWidth = formationInfo.duration / 1000 * PIXEL_PER_SEC - offset;
      this.$box.style.width = newWidth + "px";
    }
    $handlerLeft.ondragend = e => {
      // 변경 초기화
      this.$box.style.transform = null;
      this.$box.style.width = formationInfo.duration / 1000 * PIXEL_PER_SEC + "px";
      // new TIME & DURATION 계산
      const offset = e.clientX - initialX;
      const newTime = formationInfo.time + roundTime(offset / PIXEL_PER_SEC * 1000);
      const newDuration = formationInfo.duration - roundTime(offset / PIXEL_PER_SEC * 1000);
      changeFormationTimeAndDuration({ id: this.id, time: newTime, duration: newDuration });
    }

    const $handlerRight = document.createElement("div");
    $handlerRight.draggable = true;
    $handlerRight.className = "handler right";
    $handlerRight.ondragstart = e => {
      initialX = e.clientX;
      /* 드래그 잔상 지우기 위해 드래그 이미지에 빈 img 태그 넣음 */
      const img = document.createElement("img");
      e.dataTransfer.setDragImage(img, 0, 0);
    }
    $handlerRight.ondrag = e => {
      const newWidth = formationInfo.duration / 1000 * PIXEL_PER_SEC + e.clientX - initialX;
      this.$box.style.width = newWidth + "px";
    }
    $handlerRight.ondragend = e => {
      // 변경 초기화
      this.$box.style.width = formationInfo.duration / 1000 * PIXEL_PER_SEC + "px";
      // new DURATION 계산
      const offset = e.clientX - initialX;
      const newDuration = formationInfo.duration + roundTime(offset / PIXEL_PER_SEC * 1000);
      changeFormationTimeAndDuration({ id: this.id, duration: newDuration });
    }
    this.$box.appendChild($body);
    this.$box.appendChild($handlerLeft);
    this.$box.appendChild($handlerRight);
  }

  mark() {
    this.$box.children[0].classList.add("selected");
  }

  unmark() {
    this.$box.children[0].classList.remove("selected");
  }

  setId(newId) {
    this.id = newId;
    this.$box.id = newId;
  }

  updateFormationBox() {
    this.$box.style.left = TIMELINE_PADDING + this.formationInfo.time / 1000 * PIXEL_PER_SEC + "px";
    this.$box.style.width = this.formationInfo.duration / 1000 * PIXEL_PER_SEC + "px";
  }
}