import { $, createElemWithHtml } from "/js/constant.js";
import Toast from "./components/Toast.js";

let nick, email, service;

axios.get(`/auth/user`)
.then(res => {
  nick = res.data.nick;
  email = res.data.email;
  service = res.data.service;
  
  console.log(nick, email, service);
  
  let serviceName = "";
  
  switch(service) {
    case "cn":
      serviceName = "코레오노트";
      break;
    case "gg":
      serviceName = "구글";
      break;
    case "kk":
      serviceName = "카카오";
      break;
    default:
      console.error("유효하지 않은 서비스이름입니다.");
  }
  
  $("#profile_nickname").value = nick;
  $("#profile_email").textContent = email;
  $("#profile_service").textContent = serviceName;
  
  if (service == "cn") {
    $("#edit_password").style.display = "block";
  }
})
.catch(err => {
  console.error(err);
});

$("#edit_nickname").onclick = () => {
  $("#profile_nickname").disabled = false;
  $("#profile_nickname").focus();
  $("#profile_nickname_container").classList.add("profile__inputContainer--focus");
  
  $("#edit_nickname").style.display = "none";
  $("#complete_nickname").style.display = "block";
}

let completeNicknameBlock = false;
$("#complete_nickname").onclick = () => {
  if (completeNicknameBlock) return;
  completeNicknameBlock = true;
  
  const newNickname = $("#profile_nickname").value;
  const reg = /^[0-9a-zA-Z|가-힣]{1,10}$/;
  
  if (!reg.test(newNickname)) {
    new Toast("숫자, 영문, 한글 조합으로 1~10자 입력해 주세요.", "warning");
    completeNicknameBlock = false;
  	return;
  }
  
  axios.post("/profile/change_nickname", {
    newNickname
  })
  .then(res => {
    if (res.data.success) {
      new Toast("닉네임이 정상적으로 변경되었습니다.", "success");
      
      $("#profile_nickname").disabled = true;
      $("#profile_nickname_container").classList.remove("profile__inputContainer--focus");

      $("#complete_nickname").style.display = "none";
      $("#edit_nickname").style.display = "block";
    }
    else {
      new Toast(res.data.message, "warning");
    }
    completeNicknameBlock = false;
  })
  .catch(err => {
    completeNicknameBlock = false;
    console.error(err);
  });
  
  
}

$("#edit_password").onclick = () => {
  $("#password_input").value = "";
  $("#new_password_input").value = "";
  $("#new_password_check_input").value = "";
  $("#password_input").disabled = false;
  $("#password_input").focus();
  
  $("#new_password_input_container").style.display = "flex";
  $("#new_password_check_input_container").style.display = "flex";
  
  $("#edit_password").style.display = "none";
  $("#complete_password").style.display = "block";
}

let completePasswordBlock = false;
$("#complete_password").onclick = () => {
  if (completePasswordBlock) return;
  completePasswordBlock = true;
  
  const oldPassword = $("#password_input").value;
  const newPassword = $("#new_password_input").value;
  const newPasswordCheck = $("#new_password_check_input").value;
  
  if (oldPassword === "") {
    alert("현재 비밀번호를 입력해 주세요.");
    completePasswordBlock = false;
    return;
  }
  if (newPassword === "") {
    alert("새로운 비밀번호를 입력해 주세요.");
    completePasswordBlock = false;
    return;
  }
  if (newPasswordCheck === "") {
    alert("새로운 비밀번호를 다시 입력해 주세요.");
    completePasswordBlock = false;
    return;
  }
  const reg = /^[0-9a-zA-Z]{4,16}$/;
  if (!reg.test(newPassword)) {
    alert("비밀번호는 숫자, 영문의 조합으로 4~16자리 입력해 주세요.");
    completePasswordBlock = false;
    return;
  }
  if (newPassword !== newPasswordCheck) {
    alert("새로운 비밀번호와 비밀번호 확인이 다릅니다.");
    completePasswordBlock = false;
    return;
  }
  if (newPassword === oldPassword) {
    alert("기존 비밀번호와 똑같습니다.");
    completePasswordBlock = false;
    return;
  }
  
  axios.post("/profile/change_password", {
    oldPassword, newPassword
  })
  .then(res => {
    if (res.data.success) {
      new Toast("비밀번호가 정상적으로 변경되었습니다.", "success");
      
      $("#password_input").value = "****";
      $("#password_input").disabled = true;

      $("#new_password_input_container").style.display = "none";
      $("#new_password_check_input_container").style.display = "none";

      $("#edit_password").style.display = "block";
      $("#complete_password").style.display = "none";
    }
    else {
      alert(res.data.message);
    }
    completePasswordBlock = false;
  })
  .catch(err => {
    completePasswordBlock = false;
    console.error(err);
  });
}