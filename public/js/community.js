import { $, createElemWithHtml } from "/js/constant.js";

window.onload = () => {
  axios.get("/community/post")
  .then(res => {
    const { posts } = res.data;
    console.log(posts);
    const fragment = document.createDocumentFragment();
    
    posts.forEach(post => fragment.append(createPostElem(post)));
    
    $("#post_section").append(fragment);
  })
  .catch(err => {
    console.error(err);
  });
}

const $communityForm = $("#community_form");
const $communityInput = $communityForm.querySelector("[name=body]");
$communityForm.querySelector("button").onclick = e => {
  axios.post("/community/post", {
    body: $communityInput.value
  })
  .then(res => {
    const { post } = res.data;
    $communityInput.value = "";
    
    if (post)
    	$("#post_section").prepend(createPostElem(post));
  })
  .catch(err => {
    console.error(err);
  });
}

function createPostElem({ id, nick, body, createdAt, likeNumber, isLike }) {
  const result = createElemWithHtml(`
  <div class="community__postContainer">
    <div class="community__topPart">
      <div class="community__post_nickName">${nick}</div>
      <div class="community__post_date">${createdAt}</div>
    </div>
    <div class="community__post_body">${body}</div>
    <div class="community__bottomPart">
      <div class="community__post_like"></div>
      <div class="community__post_likeNumber">${likeNumber ?? 0}</div>
    </div>
  </div>
  `);
  
  let block = false;
  const $likeButton = result.querySelector(".community__post_like");
  const $likeNumber = result.querySelector(".community__post_likeNumber");
  
  if (isLike) {
    $likeButton.classList.add("community__post_like--clicked");
  }
  
  $likeButton.onclick = () => {
    if (block) return;
    block = true;
    
    $likeButton.classList.toggle("community__post_like--clicked");
    const isLike = $likeButton.classList.contains("community__post_like--clicked");
    if (isLike) {
      $likeNumber.textContent = Number($likeNumber.textContent) + 1;
    }
    else {
      $likeNumber.textContent = Number($likeNumber.textContent) - 1;
    }
    
    axios.post("/community/post_like", { cid: id, isLike })
  	.then(res => {
      block = false;
    })
    .catch(err => {
      console.error(err);
      $likeButton.classList.toggle("community__post_like--clicked");
      if ($likeButton.classList.contains("community__post_like--clicked")) {
        $likeNumber.textContent = Number($likeNumber.textContent) + 1;
      }
      else {
        $likeNumber.textContent = Number($likeNumber.textContent) - 1;
      }
      block = false;
    });
  }
  
  return result;
}