const STAGE_WIDTH = 600;
const STAGE_HEIGHT = 400;
const PIXEL_PER_SEC = 40;     // px / second
const TIMELINE_PADDING = 60;
const TIME_UNIT = 250;           // millisecond
const HANDLE_WIDTH = 12;
const COLOR_NUM = 4;

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