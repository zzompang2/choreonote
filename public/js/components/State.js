export default class State {
  #currentTime = 0;
  #isPlaying = false;
  #gap = 30;
  #selectedBox = -1;
  #selectedDancer = -1;
  #copiedFormation = [];
  
  constructor({ noteInfo, dancers, times, postions }) {
    this.noteInfo = noteInfo;
    this.dancers = [];
    dancers.forEach(dancer => this.dancers[dancer.id] = dancer);
    this.formations = times.map(time => ({
      ...time,
      positionsAtSameTime: []
    }));
    postions.forEach(position => {
      const index = this.formations.findIndex(elem => elem.id == position.tid);
      this.formations[index].positionsAtSameTime[position.did] = position;
    });
  }
  
  get currentTime() {
    return this.#currentTime;
  }
  
  set currentTime(val) {
    this.#currentTime = val;
  }
  
  get isPlaying() {
    return this.#isPlaying;
  }
  
  set isPlaying(val) {
    this.#isPlaying = val;
  }
  
  get selectedBox() {
    return this.#selectedBox;
  }
  
  set selectedBox(val) {
    this.#selectedBox = val;
  }
  
  get selectedDancer() {
    return this.#selectedDancer;
  }
  
  set selectedDancer(val) {
    this.#selectedDancer = val;
  }
  
  get gap() {
    return this.#gap;
  }
  
  set gap(val) {
    this.#gap = val;
  }
  
  get copiedFormation() {
    return this.#copiedFormation;
  }
  
  set copiedFormation(val) {
    this.#copiedFormation = val;
  }
}
