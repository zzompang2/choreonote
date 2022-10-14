const TAG = "SideScreen.mjs/";

export default class SideScreen {
  constructor({
    dancerArray,
    addDancer,
    deleteDancer,
    changeDancerName,
    changeDancerColor
  }) {
    this.dancerArray = dancerArray;
    this.changeDancerName = changeDancerName;
    this.deleteDancer = deleteDancer;
    this.changeDancerColor = changeDancerColor;
    this.screenIsShown = false;

    this.$sideScreen = document.createElement("div");
    this.$sideScreen.id = "side_screen";
    
    /* DANCER SCREEN */
    const $header = document.createElement("div");
    $header.className = "header";

    const $title = document.createElement("div");
    $title.className = "title";
    $title.innerText = "댄서";
    $header.appendChild($title);

    const $addBtn = document.createElement("div");
    $addBtn.id = "add_btn";
    $addBtn.className = "icon_btn";
    $addBtn.onclick = addDancer;
    const $addIcon = document.createElement("object");
    $addIcon.id = "add";
    $addIcon.type = "image/svg+xml";
    $addIcon.data = "./assets/icons/Add_circle.svg";
    $addBtn.appendChild($addIcon);
    $header.appendChild($addBtn);
    this.$sideScreen.appendChild($header);

    const $list = document.createElement("div");
    $list.className = "list";
    dancerArray.forEach(dancer => {
      const $did = document.createElement("div");
      $did.className = `did color${dancer.color}`;
      $did.innerText = dancer.id+1;
      $did.onclick = () => {
        $did.classList.remove(`color${dancer.color}`);
        changeDancerColor(dancer.id);
        $did.classList.add(`color${dancer.color}`);
      }

      const $name = document.createElement("input");
      $name.type = "text";
      $name.className = "name_input";
      $name.value = dancer.name;
      $name.maxLength = 20;
      $name.placeholder = "이름을 입력해주세요.";
      $name.onchange = () => {
        // 앞뒤 공백 제거 (정규표현식 사용)
        const newName = $name.value.replace(/^\s+|\s+$/gm, "");
        if(newName == "")
        $name.value = dancer.name;
        else {
          $name.value = newName;
          changeDancerName(dancer.id, newName);
        }
      }

      const $delBtn = document.createElement("div");
      $delBtn.className = "delete_btn";
      $delBtn.innerText = "삭제";
      $delBtn.onclick = () => {
        if(window.confirm("정말 삭제하시겠습니까? 되돌릴 수 없어요!"))
        deleteDancer(dancer.id);
      }

      const $elem = document.createElement("div");
      $elem.className = "elem";
      $elem.appendChild($did);
      $elem.appendChild($name);
      $elem.appendChild($delBtn);
      $list.appendChild($elem);
    });
    this.$sideScreen.appendChild($list);

    document.getElementById("main_section").appendChild(this.$sideScreen);

    const $rightToolbar = document.getElementById("right_toolbar");
    document.getElementById("dancer_btn").onclick = () => {
      this.screenIsShown = !this.screenIsShown;
      this.$sideScreen.style.right = this.screenIsShown ? "0" : "-240px";
      $rightToolbar.style.width = this.screenIsShown ? "288px" : "48px";
    };

  }

  addDancer(id) {
    const dancer = this.dancerArray[id];
    const $did = document.createElement("div");
    $did.className = `did color${dancer.color}`;
      $did.innerText = dancer.id+1;
      $did.onclick = () => {
        $did.classList.remove(`color${dancer.color}`);
        this.changeDancerColor(dancer.id);
        $did.classList.add(`color${dancer.color}`);
      }

    const $name = document.createElement("input");
    $name.type = "text";
    $name.className = "name_input";
    $name.value = dancer.name;
    $name.maxLength = 20;
    $name.placeholder = "이름을 입력해주세요.";
    $name.onchange = () => {
      // 앞뒤 공백 제거 (정규표현식 사용)
      const newName = $name.value.replace(/^\s+|\s+$/gm, "");
      if(newName == "")
      $name.value = dancer.name;
      else {
        $name.value = newName;
        this.changeDancerName(dancer.id, newName);
      }
    }

    const $delBtn = document.createElement("div");
    $delBtn.className = "delete_btn";
    $delBtn.innerText = "삭제";
    $delBtn.onclick = () => {
      if(window.confirm("정말 삭제하시겠습니까? 되돌릴 수 없어요!"))
      this.deleteDancer(dancer.id);
    }

    const $elem = document.createElement("div");
    $elem.className = "elem";
    $elem.appendChild($did);
    $elem.appendChild($name);
    $elem.appendChild($delBtn);
    this.$sideScreen.lastChild.appendChild($elem);
  }

  removeDancer(id) {
    this.$sideScreen.lastChild.removeChild(this.$sideScreen.lastChild.children[id]);
    [...this.$sideScreen.lastChild.children].forEach(($elem, id) => {
      $elem.firstChild.innerText = id+1;
    });
  }
}