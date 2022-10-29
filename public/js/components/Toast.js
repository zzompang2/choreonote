import { $ } from "/js/constant.js";

const TAG = "Toast.js/";

export default class Toast {
  constructor(msg, type) {
    const $toast = $("div#toast.toast");
    $toast.classList.add("toast--" + type);
    $toast.innerText = msg;
    $(".body")[0].append($toast);

    setTimeout(() => $toast.style.opacity = 1, 10);
    setTimeout(() => $toast.style.opacity = 0, 1500);
    setTimeout(() => $toast.remove(), 3000);
  }
}