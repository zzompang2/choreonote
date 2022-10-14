const TAG = "Toast.mjs/";

export default class Toast {
  constructor(msg, type) {
    const $toast = document.createElement("div");
    $toast.id = "toast";
    $toast.className = type;
    $toast.innerText = msg;
    document.body.appendChild($toast);

    setTimeout(() => $toast.style.opacity = 1, 10);
    setTimeout(() => $toast.style.opacity = 0, 1500);
    setTimeout(() => document.body.removeChild($toast), 3000);
  }
}