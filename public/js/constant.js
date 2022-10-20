const STAGE_WIDTH = 600;
const STAGE_HEIGHT = 400;
const PIXEL_PER_SEC = 40;     // px / second
const TIMELINE_PADDING = 60;
const TIME_UNIT = 250;           // millisecond
const HANDLE_WIDTH = 12;
const COLOR_NUM = 4;

function $(tag, attrs = {}) {
  const type = tag[0];
  
  switch (type) {
    case "#":
      return document.getElementById(tag.slice(1));
      break;
    case ".":
      return document.getElementsByClassName(tag.slice(1));
      break;
    default:
      const tagName = tag.match(/^[^#.]+/i);
      const id = tag.match(/#[^.]+/i);
      const classList = tag.match(/\.[^#.]+/ig);
      const $elem = document.createElement(tagName[0]);
      if (id)
        $elem.id = id[0].slice(1);
      if (classList)
        classList.forEach(className => $elem.classList.add(className.slice(1)));
      Object.entries(attrs).forEach(([key, val]) => {
        if (key == "textNode")
          $elem.append( val );
        else if (key.search(/^data-/) != -1) {
          $elem.dataset[key.split("-").slice(1).reduce((pre, cur) => pre + cur.charAt(0).toUpperCase() + cur.slice(1))] = val;
        }
        else
          $elem[key] = val;
      });
      return $elem;
  }
}

function createElemWithHtml(htmlString, args = []) {
  const notParentTagNames = ["img", "input", "br"];
  let _htmlString = htmlString.replace(/[\n]/g, "");
  
  let argIdx=0;
  while (_htmlString.match("@{}")) {
    _htmlString = _htmlString.replace("@{}", args[argIdx]);
    argIdx++;
  }
  
  const components = _htmlString.match(/(<[^>]+)|(>[^<]+)/g).map(tag => tag.trim()).filter(tag => tag != "");
  
  let result;
  const parentElem = [];
  
  for (let i=0; i<components.length; i++) {
    const comp = components[i];
    
    switch(comp[0]) {
      case "<":
        // tagElem 만들기
        if (comp[1] != "/") {
          const tagName = comp.slice(1).match(/^[^\s]+/)[0];
          const options = (comp.match(/\s[^=]+="[^"]+"/g) ?? []).map(val => val.slice(1, -1).split("=\""));
        	const newElem = createElem(tagName, options);
          if (parentElem.length == 0)
            result = newElem;
          else
          	parentElem[parentElem.length - 1].append(newElem);
          
          if (notParentTagNames.indexOf(tagName) == -1)
          	parentElem.push(newElem);
        }
        // tagElem 닫기
        else {
          parentElem.pop();
        }
        break;
      case ">":
        // 뒤에 문자열 있으면 textNode로 넣기
        const textNode = comp.slice(1);
        if (textNode != "") {
        	parentElem[parentElem.length - 1].append(textNode);
        }
        break;
      default:
        console.error("유효하지 않은 값");
    }
  }
  // console.log("최종 결과물:", result);
  return result;
  
  function createElem(tagName, options) {
    let id = "";
    let classList = "";
    const otherOptions = {};
    
    options.forEach(option => {
      switch(option[0]) {
        case "id":
          id = `#${option[1]}`;
          break;
        case "class":
          classList = "." + option[1].split(" ").reduce((pre, val) => `${pre}.${val}`);
          break;
        default:
          otherOptions[option[0]] = option[1];
      }
    });
    
    const result = $(tagName+id+classList, otherOptions);
    // console.log("createElem:", tagName+id+classList, otherOptions);
    return result;
  }
}

const isMobile = () => /Mobile|Android/i.test(navigator.userAgent);

/**
 * SECOND => "XX:XX"
 * @param {Number} sec 
 * @returns {String}
 */
function musicDurationFormat (ms, includeMillisec = false) {
return `${Math.floor(ms / 60000)}:` +
      `${((ms/1000) % 60 < 10 ? '0' : '') + Math.floor((ms/1000) % 60)}` +
      (includeMillisec ? `.${ms % 1000 == 0 ? '000' : ms % 1000}` : "");
}

const floorTime = (ms) => Math.floor(ms / TIME_UNIT) * TIME_UNIT;
const roundTime = (ms) => Math.round(ms / TIME_UNIT) * TIME_UNIT;
const roundPos = (pos, gap) => Math.round(pos / gap) * gap;

export { STAGE_WIDTH, STAGE_HEIGHT, PIXEL_PER_SEC, TIMELINE_PADDING, TIME_UNIT,
  HANDLE_WIDTH, COLOR_NUM, musicDurationFormat, floorTime, roundTime, roundPos, $ };