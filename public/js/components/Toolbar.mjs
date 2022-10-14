const TAG = "Toolbar.mjs/";

export default class Toolbar {
  constructor({
    copyFormation,
    pasteFormation,
    deleteFormationBox
  }) {
    this.$toolSection = document.getElementById("tool_section");
    this.$toolSection.children[0].onclick = copyFormation;
    this.$toolSection.children[1].onclick = pasteFormation;
    this.$toolSection.children[2].onclick = deleteFormationBox;
  }

  update(selectedIdx) {
    [...this.$toolSection.children].forEach($btn => {
      if(selectedIdx == -1) {
        $btn.classList.remove("active");
      }
      else {
        $btn.classList.add("active");
      }
    });

  }
}