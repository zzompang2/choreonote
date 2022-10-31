import { $, createElemWithHtml } from "/js/constant.js";

const $profileContextMenu = $("#profile_contextMenu");

document.onclick = () => {
  [...$(".dropdown")].forEach(
    dropdown => dropdown.style.display = "none");
}

$("#profile_button").onclick = e => {
  e.stopPropagation();
  $profileContextMenu.style.display = "flex";
}