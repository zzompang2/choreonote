import { $, createElemWithHtml } from "/js/constant.js";
const TAG = "SideScreen.js/";

export default class SideScreen {
  constructor({
    noteInfo,
    dancerArray,
    addDancer,
    deleteDancer,
    changeDancerName,
    changeDancerColor,
    selectDancer,
    changeNoteTitle,
  }) {
    this.noteInfo = noteInfo;
    this.changeNoteTitle();
    
    $("#note_title_input").onchange = e => {
      changeNoteTitle(e.target.value);
    }
    
    this.setMusicName();
    
    this.dancerArray = dancerArray;
    this.changeDancerName = changeDancerName;
    this.deleteDancer = deleteDancer;
    this.changeDancerColor = changeDancerColor;
    this.selectDancer = selectDancer;
    this.screenIsShown = true;

    this.$sideScreen = $("#sidebar");

    this.$sideScreen.onclick = () => selectDancer(-1);
    $("#add_dancer_button").onclick = addDancer;
    
    this.editDancerListItem = createElemWithHtml(`
    <div id="edit_dancer" class="sidebar_item">
      <label class="sidebar_itemChild">
        <span class="sidebar_label">X</span>
        <input id="edit_dancer_posx" class="sidebar_input" type="number">
      </label>
      <label class="sidebar_itemChild">
        <span class="sidebar_label">Y</span>
        <input id="edit_dancer_posy" class="sidebar_input" type="number">
      </label>
    </div>
    `);
    
    this.createDancerButtonElem = function(dancer) {
      const $dancerButtonContainer = $("div.sidebar_container");
      const $dancerButton = $("div.sidebar_button");
      const $dancerIcon = $("label.sidebar_button__dancerIcon");
      const $dancerIndex = $(
        "div.dancer_index",
        { textNode: dancer.id }
      );
      $dancerIcon.style.backgroundColor = dancer.color;
      const $colorInput = $(
        "input.sidebar_button__colorInput",
        { type: "color", value: dancer.color });
      $dancerIcon.append($dancerIndex, $colorInput);

      $colorInput.onchange = e => {
        changeDancerColor(dancer.id, e.target.value);
        $dancerIcon.style.backgroundColor = e.target.value;
      }
      
      const $name = $(
        "input.sidebar_input",
        {
          type: "text", value: dancer.name,
          maxlength: 20, placeholder: "이름을 입력해주세요."
        });
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

      const $deleteButton = $("div.sidebar_button__deleteButton");
      $deleteButton.onclick = () => {
        if(window.confirm("정말 삭제하시겠습니까? 되돌릴 수 없어요!"))
        deleteDancer(dancer.id);
      }

      $dancerButton.append($dancerIcon, $name, $deleteButton);
      $dancerButtonContainer.append($dancerButton);
      
      $dancerButton.onclick = e => {
        e.stopPropagation();
        selectDancer(dancer.id);
      }
      
      return $dancerButtonContainer;
    }
    
    dancerArray.forEach(dancer => {
      this.$sideScreen.querySelector("#dancer_list").append(this.createDancerButtonElem(dancer));
    });

    // document.getElementById("main_section").appendChild(this.$sideScreen);

    const $rightToolbar = document.getElementById("right_toolbar");
    if(document.getElementById("dancer_btn"))
    document.getElementById("dancer_btn").onclick = () => {
      this.screenIsShown = !this.screenIsShown;
      this.$sideScreen.style.right = this.screenIsShown ? "0" : "-240px";
      $rightToolbar.style.width = this.screenIsShown ? "288px" : "48px";
    };

  }

  addDancer(id) {
    const dancer = this.dancerArray[id];
    this.$sideScreen.querySelector("#dancer_list").append(this.createDancerButtonElem(dancer));
  }

  removeDancer(did) {
    const dancerList = this.$sideScreen.querySelector("#dancer_list");
    dancerList.removeChild(dancerList.children[did-1]);
    [...dancerList.children].forEach(($elem, id) => {
      $elem.querySelector(".dancer_index").textContent = id+1;
    });
  }
  
  unselect(id) {
    $("#dancer_list").children[id-1].classList.remove("sidebar_button--selected");
  }
  
  select(id) {
    $("#dancer_list").children[id-1].classList.add("sidebar_button--selected");
    // $("#dancer_list").children[id].append(this.editDancerListItem);
  }
  
  setMusicName() {
  	console.log("setMusicName", this.noteInfo.musicname);
    $("#note_music").textContent = this.noteInfo.musicname ? this.noteInfo.musicname : "노래 없음";
  }
  
  changeNoteTitle() {
    $("#note_title_input").value = this.noteInfo.title;
  }
}