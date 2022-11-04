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
  const _body = body.replaceAll("\n", "<br>");
  const result = createElemWithHtml(`
  <div class="community__postContainer">
    <div class="community__topPart">
      <div class="community__post_nickName">${nick}</div>
      <div class="community__post_date">${createdAt}</div>
    </div>
    <div class="community__post_body">${_body}</div>
    <div class="community__bottomPart">
      <div class="community__post_like"></div>
      <div class="community__post_likeNumber">${likeNumber ?? 0}</div>
    </div>
    <div class="comment__container">
      <div class="comment__slider">
        <div class="comment__track"></div>
      </div>
      
      <div class="comment__inputContainer">
        <textarea class="comment__input" maxLength="200"></textarea>
        <button class="comment__submitButton">댓글 달기</button>
      </div>
    </div>
  </div>
  `);
  
  let commentBlock = false;
  result.querySelector(".comment__submitButton").onclick = () => {
    if (commentBlock) return;
    commentBlock = true;
    
    const body = result.querySelector(".comment__input").value.trim();
    
    if (body == "") {
      commentBlock = false;
      return;
    }
    
    axios.post("/community/comment", { cid: id, body })
  	.then(res => {
      const { comment } = res.data;
      result.querySelector(".comment__input").value = "";
      result.querySelector(".comment__track").append( createCommentElem(comment) );
       result.querySelector(".comment__slider").scrollTop =  result.querySelector(".comment__track").scrollHeight;
      
      commentBlock = false;
    })
    .catch(err => {
      console.error(err);
      commentBlock = false;
    });
  }
  
  let isCommentContainerShown = false;
  let isCommentLoad = false;
  result.onclick = () => {
    if (!isCommentLoad) {
      axios.get(`/community/comment?cid=${id}`)
      .then(res => {
        isCommentLoad = true;
        const { comments } = res.data;
        console.log(comments);
        comments.forEach(comment => {
          result.querySelector(".comment__track").append( createCommentElem(comment) );
        });
      })
      .catch(err => console.error(err));
    }
    
    if (isCommentContainerShown) {
      isCommentContainerShown = false;
    	result.querySelector(".comment__container").style.display = "none";
    }
    else {
      isCommentContainerShown = true;
      result.querySelector(".comment__container").style.display = "block";
    }
  }
  
  result.querySelector(".comment__container").onclick = e => e.stopPropagation();
  
  /* COMMUNITY LIKE */
  let block = false;
  const $likeButton = result.querySelector(".community__post_like");
  const $likeNumber = result.querySelector(".community__post_likeNumber");
  
  if (isLike) {
    $likeButton.classList.add("community__post_like--clicked");
  }
  
  $likeButton.onclick = e => {
    e.stopPropagation();
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

function createCommentElem({ commentId, nick, createdAt, body }) {
  const _body = body.replaceAll("\n", "<br>");
  const result = createElemWithHtml(`
  <div class="comment">
    <div class="comment__topPart">
      <div class="comment__nick">${nick}</div>
      <div class="comment__date">${createdAt}</div>
    </div>
    <div class="comment__body">${_body}</div>
  </div>
  `);

  return result;
}