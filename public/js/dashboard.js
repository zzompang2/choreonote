import { $, createElemWithHtml } from "/js/constant.js";

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

axios.get('/dashboard/get_notes')
.then(res => {
  const { notes } = res.data;
  
  const fragment = document.createDocumentFragment();
  notes.forEach(note => {
    const $note = createElemWithHtml(`
    <div tabindex="0" class="note__container">
      <div class="note__body">
        <div class="note__thumbnail"></div>
        <div class="note__titlePart">
          <div class="text__title">${note.title}</div>
          <div class="text__sub">${note.createdAt}</div>
        </div>
      </div>
    </div>
    `);
    
    $note.onclick = () => $("a", { href: `/note?id=${note.id}` }).click();
    fragment.append($note);
  });
  $("#note_container").append(fragment);
})
.catch(err => {
  console.error(err);
});

