import { $ } from "/js/constant.js";

window.onload = () => {
  $(".grid")[0].classList.add("grid--onload");
}

$("#create_note_btn").onclick = createNote;

/****************/
/*** FUNCTION ***/
/****************/

function createNote() {
  axios.get('/dashboard/create_note')
  .then(res => {
    const { noteId } = res.data;
    console.log("새로운 노트:", noteId );
    $("a", { href: `/note?id=${noteId}` }).click();
  })
  .catch(err => {
    console.error(err);
  });
}