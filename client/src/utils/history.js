const MAX_HISTORY = 50;

let undoStack = [];
let redoStack = [];

export function pushState(snapshot) {
  undoStack.push(JSON.stringify(snapshot));
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
}

export function replaceState(snapshot) {
  if (undoStack.length > 0) {
    undoStack[undoStack.length - 1] = JSON.stringify(snapshot);
  } else {
    pushState(snapshot);
  }
}

export function undo() {
  if (undoStack.length === 0) return null;
  const current = undoStack.pop();
  redoStack.push(current);
  // Return the previous state (now top of undo stack)
  if (undoStack.length === 0) return null;
  return JSON.parse(undoStack[undoStack.length - 1]);
}

export function redo() {
  if (redoStack.length === 0) return null;
  const state = redoStack.pop();
  undoStack.push(state);
  return JSON.parse(state);
}

export function canUndo() {
  return undoStack.length > 1; // need at least initial + 1 change
}

export function canRedo() {
  return redoStack.length > 0;
}

export function clearHistory() {
  undoStack = [];
  redoStack = [];
}
