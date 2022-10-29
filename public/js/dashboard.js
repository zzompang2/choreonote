import { $, createElemWithHtml } from "/js/constant.js";

window.onload = () => {
  $(".grid")[0].classList.add("grid--onload");
}

$("#create_note_btn").onclick = createNote;

const $noteContextMenu = $("#note_contextMenu");

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

let selectedNote = null;

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
    
    
    $note.onclick = () => $("a", { href: `/note?id=${note.noteId}` }).click();
    $note.oncontextmenu = e => e.preventDefault();  // 브라우저 기본 이벤트 제거
    $note.onmousedown = e => {
      // 우클릭 한 경우
      if (e.button == 2 || e.which == 3) {
        e.stopPropagation();
        console.log(note);
        selectedNote = note.id;
        $noteContextMenu.style.display = "flex";
        $noteContextMenu.style.top = e.pageY + "px";
        $noteContextMenu.style.left = e.pageX + "px";
      }
    }
    fragment.append($note);
  });
  $("#note_container").append(fragment);
})
.catch(err => {
  console.error(err);
});

$("#delete_button").onclick = () => {
  console.log("삭제버튼", selectedNote);
  if (!selectedNote) return;
  
  deleteNote(selectedNote);
}

function deleteNote(id) {
  axios.post('/dashboard/delete_note', {
    id: id
  })
  .then(res => {
    console.log("삭제 완료");
		window.location.reload();
  })
  .catch(err => {
    console.error(err);
  });
}

document.onclick = () => {
  selectedNote = null;
  $noteContextMenu.style.display = "none";
}