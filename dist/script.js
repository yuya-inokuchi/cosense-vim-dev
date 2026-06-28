// scripts/vim/text-model.ts
var graphemeSegmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
var whitespacePattern = /^\s+$/u;
var keywordPattern = /^[\p{L}\p{N}\p{M}_]+$/u;
function splitGraphemes(text) {
  if (!graphemeSegmenter)
    return Array.from(text);
  return Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);
}
function graphemeLength(text) {
  return splitGraphemes(text).length;
}
function comparePositions(left, right) {
  if (left.line !== right.line)
    return left.line - right.line;
  return left.char - right.char;
}
function normalizeRange(range) {
  if (comparePositions(range.start, range.end) <= 0)
    return range;
  return {
    ...range,
    start: range.end,
    end: range.start
  };
}
function clampPosition(lines, position) {
  if (lines.length === 0) {
    return { line: 0, char: 0 };
  }
  const line = Math.min(Math.max(position.line, 0), lines.length - 1);
  const char = Math.min(Math.max(position.char, 0), graphemeLength(lines[line] ?? ""));
  return { line, char };
}
function normalizeAndClampRange(lines, range) {
  return normalizeRange({
    ...range,
    start: clampPosition(lines, range.start),
    end: clampPosition(lines, range.end)
  });
}
function getTextInRange(lines, sourceRange) {
  if (lines.length === 0)
    return "";
  const range = normalizeAndClampRange(lines, sourceRange);
  if (range.kind === "line") {
    return `${lines.slice(range.start.line, range.end.line + 1).join(`
`)}
`;
  }
  const startLine = splitGraphemes(lines[range.start.line] ?? "");
  const endLine = splitGraphemes(lines[range.end.line] ?? "");
  if (range.start.line === range.end.line) {
    return startLine.slice(range.start.char, range.end.char).join("");
  }
  const parts = [
    startLine.slice(range.start.char).join(""),
    ...lines.slice(range.start.line + 1, range.end.line),
    endLine.slice(0, range.end.char).join("")
  ];
  return parts.join(`
`);
}
function classifyCharacter(grapheme) {
  if (whitespacePattern.test(grapheme))
    return "whitespace";
  if (keywordPattern.test(grapheme))
    return "keyword";
  return "punctuation";
}
function classifyWord(grapheme) {
  return whitespacePattern.test(grapheme) ? "whitespace" : "word";
}
function codeUnitOffsetAtGrapheme(text, graphemeIndex) {
  return splitGraphemes(text).slice(0, Math.max(graphemeIndex, 0)).join("").length;
}
function graphemeIndexAtCodeUnit(text, codeUnitOffset) {
  const target = Math.min(Math.max(codeUnitOffset, 0), text.length);
  let consumed = 0;
  let index = 0;
  for (const grapheme of splitGraphemes(text)) {
    if (consumed + grapheme.length > target)
      break;
    consumed += grapheme.length;
    index += 1;
  }
  return index;
}
function positionBefore(lines, position) {
  if (position.char > 0) {
    return { line: position.line, char: position.char - 1 };
  }
  if (position.line > 0) {
    return {
      line: position.line - 1,
      char: Math.max(graphemeLength(lines[position.line - 1] ?? "") - 1, 0)
    };
  }
  return { line: 0, char: 0 };
}

// scripts/vim/cosense.ts
var cosenseWindow = window;
var forwardedEvents = new WeakSet;
var keyCodeMap = {
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Home: 36,
  End: 35,
  Backspace: 8,
  Delete: 46
};
function getCosenseWindow() {
  return cosenseWindow;
}
function getTextInput() {
  return document.querySelector("#text-input");
}
function focusTextInput() {
  getTextInput()?.focus({ preventScroll: true });
}
function activatePagePosition(target) {
  const textInput = getTextInput();
  if (!textInput)
    return false;
  textInput.focus({ preventScroll: true });
  const pageHasFocus = cosenseWindow.cosense?.Page?.cursor?.hasFocus === true && document.activeElement === textInput;
  if (!getCursorPosition() || !pageHasFocus) {
    clickPagePosition(target);
  }
  if (!getCursorPosition() || cosenseWindow.cosense?.Page?.cursor?.hasFocus !== true) {
    return false;
  }
  moveToPosition(target);
  textInput.focus({ preventScroll: true });
  return document.activeElement === textInput;
}
function getCursorPosition() {
  const cursor = cosenseWindow.scrapbox?.Page?.cursor;
  if (typeof cursor?.line !== "number" || typeof cursor.char !== "number") {
    return null;
  }
  return {
    line: cursor.line,
    char: cursor.char
  };
}
function getPageLines() {
  return cosenseWindow.cosense?.Page?.lines?.map((line) => line.text ?? "") ?? [];
}
function getPageLineSnapshots() {
  return cosenseWindow.cosense?.Page?.lines?.map((line, index) => ({
    id: line.id ?? `line:${index}`,
    text: line.text ?? ""
  })) ?? [];
}
function getPageTitle() {
  return cosenseWindow.cosense?.Page?.title ?? null;
}
async function waitForSave() {
  await cosenseWindow.cosense?.Page?.waitForSave();
}
async function showPage(title) {
  const show = cosenseWindow.cosense?.Page?.show;
  if (!show)
    throw new Error("cosense.Page.show is unavailable");
  await show(title);
}
function goProjectHome() {
  const projectName = cosenseWindow.cosense?.Project?.name;
  if (!projectName)
    return;
  location.assign(`/${encodeURIComponent(projectName)}/`);
}
function goBackOrHome() {
  if (history.length > 1) {
    history.back();
    return;
  }
  goProjectHome();
}
function getSelectionRange() {
  const selection = cosenseWindow.cosense?.Page?.selection;
  if (!selection)
    return null;
  return {
    start: { ...selection.start },
    end: { ...selection.end }
  };
}
function isForwardedEvent(event) {
  return forwardedEvents.has(event);
}
function isAnotherEditableElement(target) {
  if (!(target instanceof HTMLElement))
    return false;
  if (target.id === "text-input")
    return false;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
}
function sendKey(key, selecting = false, modifiers = {}) {
  const textInput = getTextInput();
  if (!textInput)
    return;
  const keyCode = keyCodeMap[key];
  const event = new KeyboardEvent("keydown", {
    key,
    code: key,
    keyCode,
    which: keyCode,
    shiftKey: selecting || modifiers.shiftKey,
    ctrlKey: modifiers.ctrlKey,
    altKey: modifiers.altKey,
    metaKey: modifiers.metaKey,
    bubbles: true,
    cancelable: true,
    composed: true
  });
  Object.defineProperties(event, {
    keyCode: { value: keyCode },
    which: { value: keyCode }
  });
  forwardedEvents.add(event);
  textInput.dispatchEvent(event);
}
function sendUndo(redo = false) {
  const isMac = /Mac|iPhone|iPad|iPod/u.test(navigator.platform);
  const keyCode = 90;
  const event = new KeyboardEvent("keydown", {
    key: redo ? "Z" : "z",
    code: "KeyZ",
    keyCode,
    which: keyCode,
    ctrlKey: !isMac,
    metaKey: isMac,
    shiftKey: redo,
    bubbles: true,
    cancelable: true,
    composed: true
  });
  Object.defineProperties(event, {
    keyCode: { value: keyCode },
    which: { value: keyCode }
  });
  forwardedEvents.add(event);
  getTextInput()?.dispatchEvent(event);
}
function sendMotion(key, selecting = false) {
  sendKey(key, selecting);
}
function clickPagePosition(target) {
  const textInput = getTextInput();
  const line = document.querySelectorAll(".editor .line")[target.line];
  if (!textInput || !line)
    return false;
  const character = line.querySelector(`[data-char-index="${target.char}"]`);
  const characters = line.querySelectorAll("[data-char-index]");
  const lastCharacter = characters[characters.length - 1];
  const targetElement = character ?? lastCharacter ?? line;
  const rect = targetElement.getBoundingClientRect();
  const clientX = character ? rect.left : lastCharacter ? rect.right + 1 : rect.left + 1;
  const clientY = rect.top + Math.max(rect.height / 2, 1);
  for (const type of ["mousedown", "mouseup", "click"]) {
    targetElement.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      clientX,
      clientY
    }));
  }
  textInput.focus({ preventScroll: true });
  return document.activeElement === textInput;
}
function moveToPosition(target, options = {}) {
  let current = getCursorPosition();
  if (!current)
    return;
  const selecting = options.selecting ?? false;
  if (!selecting && current.line !== target.line) {
    moveVerticallyToLine(target.line);
    current = getCursorPosition() ?? current;
  }
  if (current.line === target.line) {
    const key = current.char <= target.char ? "ArrowRight" : "ArrowLeft";
    const distance = Math.abs(target.char - current.char);
    for (let index = 0;index < distance; index += 1) {
      sendMotion(key, selecting);
    }
    return;
  }
  const verticalDistance = Math.abs(target.line - current.line);
  if (current.line < target.line) {
    for (let index = 0;index < verticalDistance; index += 1) {
      sendMotion("End", selecting);
      sendMotion("ArrowRight", selecting);
    }
  } else {
    for (let index = 0;index < verticalDistance; index += 1) {
      sendMotion("Home", selecting);
      sendMotion("ArrowLeft", selecting);
      sendMotion("Home", selecting);
    }
  }
  sendMotion("Home", selecting);
  for (let index = 0;index < target.char; index += 1) {
    sendMotion("ArrowRight", selecting);
  }
}
function moveVerticallyToLine(targetLine) {
  let current = getCursorPosition();
  if (!current || current.line === targetLine)
    return;
  const key = current.line < targetLine ? "ArrowDown" : "ArrowUp";
  const maxAttempts = Math.abs(targetLine - current.line) * 20 + 20;
  for (let attempt = 0;attempt < maxAttempts; attempt += 1) {
    sendMotion(key);
    current = getCursorPosition();
    if (!current || current.line === targetLine)
      return;
    if (key === "ArrowDown" && current.line > targetLine || key === "ArrowUp" && current.line < targetLine) {
      return;
    }
  }
}
function updateLine(text, index) {
  cosenseWindow.cosense?.Page?.updateLine(text, index);
}
function insertLine(text, index) {
  cosenseWindow.cosense?.Page?.insertLine(text, index);
}
function deleteLines(startLine, count) {
  const lines = getPageLines();
  if (lines.length === 0 || count < 1)
    return;
  const start = Math.min(Math.max(startLine, 0), lines.length - 1);
  const endExclusive = Math.min(start + count, lines.length);
  moveToPosition({ line: start, char: 0 });
  if (endExclusive < lines.length) {
    moveToPosition({ line: endExclusive, char: 0 }, { selecting: true });
    sendKey("Delete");
    return;
  }
  const lastLine = lines.length - 1;
  moveToPosition({
    line: lastLine,
    char: graphemeLength(lines[lastLine] ?? "")
  }, { selecting: true });
  sendKey("Delete");
  if (start > 0)
    sendKey("Backspace");
}
function deleteTextRange(start, end) {
  const range = normalizeRange({
    start,
    end,
    kind: "character"
  });
  moveToPosition(range.start);
  moveToPosition(range.end, { selecting: true });
  sendKey("Delete");
}
function selectRange(start, end) {
  moveToPosition(start);
  moveToPosition(end, { selecting: true });
}
function clearSelection(position) {
  if (getSelectionRange()) {
    sendMotion("ArrowLeft");
  }
  moveToPosition(position);
}
function getCursorRect() {
  const char = getCursorPosition()?.char;
  if (typeof char === "number") {
    const cursorLine = document.querySelector(".line.cursor-line");
    const character = cursorLine?.querySelector(`[data-char-index="${char}"]`);
    if (character) {
      return character.getBoundingClientRect();
    }
    const characters = cursorLine?.querySelectorAll("[data-char-index]");
    const lastCharacter = characters?.[characters.length - 1];
    if (cursorLine && lastCharacter) {
      const rect = lastCharacter.getBoundingClientRect();
      return new DOMRect(rect.right, rect.top, 2, rect.height);
    }
    if (cursorLine) {
      const rect = cursorLine.getBoundingClientRect();
      return new DOMRect(rect.left, rect.top, 2, rect.height);
    }
  }
  return getTextInput()?.getBoundingClientRect() ?? null;
}
function addVimMenu() {
  cosenseWindow.cosense?.PageMenu?.addMenu({
    title: "Vim mode",
    icon: "fas fa-keyboard",
    onClick: () => cosenseWindow.__cosenseVimToggle?.()
  });
}

// scripts/vim/editing.ts
function effectiveOperatorMotion(operator, motion, currentCharacter) {
  if (operator === "c" && !/^\s$/u.test(currentCharacter) && (motion === "w" || motion === "W")) {
    return motion === "w" ? "e" : "E";
  }
  return motion;
}
function characterRange(lines, start, count, backward = false) {
  const lineLength = graphemeLength(lines[start.line] ?? "");
  if (backward) {
    return {
      start: { line: start.line, char: Math.max(start.char - count, 0) },
      end: start,
      kind: "character"
    };
  }
  return {
    start,
    end: {
      line: start.line,
      char: Math.min(start.char + count, lineLength)
    },
    kind: "character"
  };
}
function lineRange(lines, startLine, count) {
  return {
    start: { line: startLine, char: 0 },
    end: {
      line: Math.min(startLine + count - 1, lines.length - 1),
      char: 0
    },
    kind: "line"
  };
}
function rangeForMotion(lines, cursor, target, motion) {
  if (motion === "j" || motion === "k" || motion === "gg" || motion === "G") {
    return {
      start: { line: cursor.line, char: 0 },
      end: { line: target.line, char: 0 },
      kind: "line"
    };
  }
  const forward = target.line > cursor.line || target.line === cursor.line && target.char >= cursor.char;
  const inclusive = new Set([
    "e",
    "E",
    "$",
    "f",
    "F",
    "t",
    "T",
    "%",
    "ge",
    "gE"
  ]).has(motion);
  if (forward && !inclusive && target.line > cursor.line && target.char === 0) {
    const firstNonBlank = splitGraphemes(lines[cursor.line] ?? "").findIndex((value) => !/^\s$/u.test(value));
    const startsBeforeContent = cursor.char <= (firstNonBlank < 0 ? 0 : firstNonBlank);
    if (startsBeforeContent) {
      return {
        start: { line: cursor.line, char: 0 },
        end: { line: target.line - 1, char: 0 },
        kind: "line"
      };
    }
    return {
      start: cursor,
      end: {
        line: target.line - 1,
        char: graphemeLength(lines[target.line - 1] ?? "")
      },
      kind: "character"
    };
  }
  const end = forward && inclusive ? {
    line: target.line,
    char: Math.min(target.char + 1, graphemeLength(lines[target.line] ?? ""))
  } : target;
  return {
    start: cursor,
    end,
    kind: "character"
  };
}
function deleteCharacterRange(lines, sourceRange) {
  const range = normalizeRange(sourceRange);
  const deletedText = getTextInRange(lines, range);
  const nextLines = [...lines];
  if (range.kind === "line") {
    nextLines.splice(range.start.line, range.end.line - range.start.line + 1);
    if (nextLines.length === 0)
      nextLines.push("");
    return {
      lines: nextLines,
      cursor: {
        line: Math.min(range.start.line, nextLines.length - 1),
        char: 0
      },
      deletedText
    };
  }
  const startGraphemes = splitGraphemes(lines[range.start.line] ?? "");
  const endGraphemes = splitGraphemes(lines[range.end.line] ?? "");
  const merged = [
    ...startGraphemes.slice(0, range.start.char),
    ...endGraphemes.slice(range.end.char)
  ].join("");
  nextLines.splice(range.start.line, range.end.line - range.start.line + 1, merged);
  return {
    lines: nextLines,
    cursor: range.start,
    deletedText
  };
}
function putCharacterwise(line, char, text, after) {
  const graphemes = splitGraphemes(line);
  const insertAt = Math.min(Math.max(char + (after && graphemes.length > 0 ? 1 : 0), 0), graphemes.length);
  const inserted = splitGraphemes(text);
  graphemes.splice(insertAt, 0, ...inserted);
  return {
    text: graphemes.join(""),
    cursorChar: Math.max(insertAt + inserted.length - 1, 0)
  };
}
function putCharacterwiseLines(lines, position, text, after) {
  const current = splitGraphemes(lines[position.line] ?? "");
  const insertAt = Math.min(Math.max(position.char + (after && current.length > 0 ? 1 : 0), 0), current.length);
  const before = current.slice(0, insertAt).join("");
  const afterText = current.slice(insertAt).join("");
  const parts = text.split(`
`);
  if (parts.length === 1) {
    const result = putCharacterwise(lines[position.line] ?? "", position.char, text, after);
    const nextLines2 = [...lines];
    nextLines2[position.line] = result.text;
    return {
      lines: nextLines2,
      cursor: { line: position.line, char: result.cursorChar }
    };
  }
  const insertedLines = [
    `${before}${parts[0] ?? ""}`,
    ...parts.slice(1, -1),
    `${parts.at(-1) ?? ""}${afterText}`
  ];
  const nextLines = [...lines];
  nextLines.splice(position.line, 1, ...insertedLines);
  return {
    lines: nextLines,
    cursor: {
      line: position.line + insertedLines.length - 1,
      char: Math.max(graphemeLength(parts.at(-1) ?? "") - 1, 0)
    }
  };
}
function linewiseValues(text) {
  const values = text.endsWith(`
`) ? text.slice(0, -1).split(`
`) : text.split(`
`);
  return values.length === 0 ? [""] : values;
}
function firstNonBlankChar(line) {
  const graphemes = splitGraphemes(line);
  const index = graphemes.findIndex((value) => !/^\s$/u.test(value));
  return index < 0 ? 0 : index;
}
function leadingWhitespace(line) {
  return line.match(/^\s*/u)?.[0] ?? "";
}
function joinLines(lines, startLine, count) {
  if (startLine < 0 || startLine >= lines.length - 1)
    return null;
  const joinedLineCount = Math.min(Math.max(count, 2), lines.length - startLine);
  let text = lines[startLine] ?? "";
  const cursorChar = splitGraphemes(text).findLastIndex((value) => !/^\s$/u.test(value)) + 1;
  for (let line = startLine + 1;line < startLine + joinedLineCount; line += 1) {
    const next = (lines[line] ?? "").replace(/^\s+/u, "");
    if (next === "")
      continue;
    const needsSpace = text !== "" && !/\s$/u.test(text) && !next.startsWith(")");
    text = `${text}${needsSpace ? " " : ""}${next}`;
  }
  return {
    text,
    cursorChar,
    joinedLineCount
  };
}
function shiftIndent(text, direction) {
  if (direction > 0) {
    return text === "" ? text : `	${text}`;
  }
  return text.startsWith("\t") ? text.slice(1) : text.replace(/^ {1,4}/u, "");
}
function changeNumberAtOrAfter(text, character, delta) {
  const cursorOffset = codeUnitOffsetAtGrapheme(text, character);
  const match = Array.from(text.matchAll(/-?\d+/gu)).find((candidate) => {
    const start2 = candidate.index;
    return cursorOffset < start2 + candidate[0].length;
  });
  if (!match)
    return null;
  const source = match[0];
  const negative = source.startsWith("-");
  const digits = negative ? source.slice(1) : source;
  const value = BigInt(source) + BigInt(delta);
  const absolute = (value < 0n ? -value : value).toString();
  const padded = digits.length > 1 && digits.startsWith("0") ? absolute.padStart(digits.length, "0") : absolute;
  const replacement = `${value < 0n ? "-" : ""}${padded}`;
  const start = match.index;
  const nextText = text.slice(0, start) + replacement + text.slice(start + source.length);
  return {
    text: nextText,
    cursorChar: graphemeIndexAtCodeUnit(nextText, start + replacement.length - 1)
  };
}
function changeCaseInRange(lines, sourceRange, change) {
  const range = normalizeRange(sourceRange);
  const nextLines = [...lines];
  for (let line = range.start.line;line <= range.end.line; line += 1) {
    const graphemes = splitGraphemes(lines[line] ?? "");
    const start = range.kind === "line" || line > range.start.line ? 0 : range.start.char;
    const end = range.kind === "line" || line < range.end.line ? graphemes.length : range.end.char;
    for (let index = start;index < end; index += 1) {
      const value = graphemes[index] ?? "";
      graphemes[index] = change === "lower" ? value.toLowerCase() : change === "upper" ? value.toUpperCase() : value === value.toUpperCase() ? value.toLowerCase() : value.toUpperCase();
    }
    nextLines[line] = graphemes.join("");
  }
  return nextLines;
}
function visualRange(lines, anchor, cursor, kind) {
  if (kind === "line") {
    return {
      start: { line: anchor.line, char: 0 },
      end: { line: cursor.line, char: 0 },
      kind: "line"
    };
  }
  const forward = cursor.line > anchor.line || cursor.line === anchor.line && cursor.char >= anchor.char;
  const end = forward ? {
    line: cursor.line,
    char: Math.min(cursor.char + 1, graphemeLength(lines[cursor.line] ?? ""))
  } : {
    line: anchor.line,
    char: Math.min(anchor.char + 1, graphemeLength(lines[anchor.line] ?? ""))
  };
  return forward ? { start: anchor, end, kind: "character" } : { start: cursor, end, kind: "character" };
}

// scripts/vim/motions.ts
function firstNonBlank(lines, line) {
  const graphemes = splitGraphemes(lines[line] ?? "");
  const char = graphemes.findIndex((value) => !/^\s$/u.test(value));
  return {
    line,
    char: char < 0 ? 0 : char
  };
}
function firstBodyLine(lines) {
  return lines.length > 1 ? 1 : 0;
}
function lastCharacter(lines, line) {
  return {
    line,
    char: Math.max(graphemeLength(lines[line] ?? "") - 1, 0)
  };
}
function documentUnits(lines) {
  const units = [];
  lines.forEach((line, lineIndex) => {
    splitGraphemes(line).forEach((value, char) => {
      units.push({
        value,
        position: { line: lineIndex, char },
        kind: "character"
      });
    });
    if (lineIndex < lines.length - 1) {
      units.push({
        value: `
`,
        position: {
          line: lineIndex,
          char: graphemeLength(line)
        },
        kind: "newline"
      });
    }
  });
  return units;
}
function unitIndexAt(units, position) {
  const exact = units.findIndex((unit) => unit.position.line === position.line && unit.position.char === position.char);
  if (exact >= 0)
    return exact;
  for (let index = units.length - 1;index >= 0; index -= 1) {
    const unit = units[index];
    if (!unit)
      continue;
    if (unit.position.line < position.line || unit.position.line === position.line && unit.position.char <= position.char) {
      return index;
    }
  }
  return 0;
}
function isWhitespace(unit) {
  return unit.kind === "newline" || /^\s$/u.test(unit.value);
}
function classFor(unit, bigWord) {
  if (unit.kind === "newline")
    return "whitespace";
  return bigWord ? classifyWord(unit.value) : classifyCharacter(unit.value);
}
function nearestCharacter(units, index, direction) {
  for (let next = index;next >= 0 && next < units.length; next += direction) {
    const unit = units[next];
    if (unit?.kind === "character")
      return unit.position;
  }
  return null;
}
function wordForward(lines, position, count, bigWord) {
  const units = documentUnits(lines);
  if (units.length === 0)
    return { line: 0, char: 0 };
  let index = unitIndexAt(units, position);
  for (let repetition = 0;repetition < count; repetition += 1) {
    const current = units[index];
    if (!current)
      break;
    if (!isWhitespace(current)) {
      const currentClass = classFor(current, bigWord);
      while (index < units.length && !isWhitespace(units[index]) && classFor(units[index], bigWord) === currentClass) {
        index += 1;
      }
    }
    while (index < units.length && isWhitespace(units[index])) {
      index += 1;
    }
  }
  return nearestCharacter(units, Math.min(index, units.length - 1), 1) ?? nearestCharacter(units, units.length - 1, -1) ?? position;
}
function wordBackward(lines, position, count, bigWord) {
  const units = documentUnits(lines);
  if (units.length === 0)
    return { line: 0, char: 0 };
  let index = Math.max(unitIndexAt(units, position) - 1, 0);
  for (let repetition = 0;repetition < count; repetition += 1) {
    while (index > 0 && isWhitespace(units[index])) {
      index -= 1;
    }
    const currentClass = classFor(units[index], bigWord);
    while (index > 0 && !isWhitespace(units[index - 1]) && classFor(units[index - 1], bigWord) === currentClass) {
      index -= 1;
    }
    if (repetition < count - 1)
      index = Math.max(index - 1, 0);
  }
  return nearestCharacter(units, index, -1) ?? { line: 0, char: 0 };
}
function wordEndForward(lines, position, count, bigWord) {
  const units = documentUnits(lines);
  if (units.length === 0)
    return { line: 0, char: 0 };
  let index = unitIndexAt(units, position);
  for (let repetition = 0;repetition < count; repetition += 1) {
    const current = units[index];
    const next = units[index + 1];
    const atCurrentClassEnd = !isWhitespace(current) && (!next || isWhitespace(next) || classFor(next, bigWord) !== classFor(current, bigWord));
    if (repetition > 0 || isWhitespace(current) || atCurrentClassEnd) {
      index += 1;
      while (index < units.length && isWhitespace(units[index])) {
        index += 1;
      }
    }
    if (index >= units.length) {
      index = units.length - 1;
      break;
    }
    const currentClass = classFor(units[index], bigWord);
    while (index + 1 < units.length && !isWhitespace(units[index + 1]) && classFor(units[index + 1], bigWord) === currentClass) {
      index += 1;
    }
  }
  return nearestCharacter(units, index, -1) ?? position;
}
function wordEndBackward(lines, position, count, bigWord) {
  const units = documentUnits(lines);
  if (units.length === 0)
    return { line: 0, char: 0 };
  const sourceIndex = unitIndexAt(units, position);
  let index = Math.max(sourceIndex - 1, 0);
  for (let repetition = 0;repetition < count; repetition += 1) {
    const source = units[Math.min(index + 1, units.length - 1)];
    if (source && !isWhitespace(source) && !isWhitespace(units[index]) && classFor(source, bigWord) === classFor(units[index], bigWord)) {
      const currentClass = classFor(units[index], bigWord);
      while (index >= 0 && !isWhitespace(units[index]) && classFor(units[index], bigWord) === currentClass) {
        index -= 1;
      }
    }
    while (index > 0 && isWhitespace(units[index])) {
      index -= 1;
    }
    if (repetition < count - 1) {
      const currentClass = classFor(units[index], bigWord);
      while (index > 0 && !isWhitespace(units[index - 1]) && classFor(units[index - 1], bigWord) === currentClass) {
        index -= 1;
      }
      index = Math.max(index - 1, 0);
    }
  }
  return nearestCharacter(units, Math.max(index, 0), -1) ?? {
    line: 0,
    char: 0
  };
}
function findCharacter(lines, position, find, count) {
  const graphemes = splitGraphemes(lines[position.line] ?? "");
  const step = find.direction === "forward" ? 1 : -1;
  let index = position.char;
  let remaining = count;
  while (remaining > 0) {
    index += step;
    while (index >= 0 && index < graphemes.length && graphemes[index] !== find.character) {
      index += step;
    }
    if (index < 0 || index >= graphemes.length)
      return position;
    remaining -= 1;
  }
  if (find.till)
    index -= step;
  return {
    line: position.line,
    char: Math.min(Math.max(index, 0), Math.max(graphemes.length - 1, 0))
  };
}
function repeatFind(lines, position, count, lastFind, reverse) {
  if (!lastFind)
    return position;
  return findCharacter(lines, position, {
    ...lastFind,
    direction: reverse ? lastFind.direction === "forward" ? "backward" : "forward" : lastFind.direction
  }, count);
}
var openingBracket = new Map([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"]
]);
var closingBracket = new Map([
  [")", "("],
  ["]", "["],
  ["}", "{"]
]);
function matchingBracket(lines, position) {
  const units = documentUnits(lines);
  if (units.length === 0)
    return position;
  let index = unitIndexAt(units, position);
  let value = units[index]?.value;
  if (!openingBracket.has(value ?? "") && !closingBracket.has(value ?? "")) {
    while (index < units.length && units[index]?.position.line === position.line && !openingBracket.has(units[index]?.value ?? "") && !closingBracket.has(units[index]?.value ?? "")) {
      index += 1;
    }
    value = units[index]?.value;
  }
  if (!value)
    return position;
  const isOpening = openingBracket.has(value);
  const partner = isOpening ? openingBracket.get(value) : closingBracket.get(value);
  if (!partner)
    return position;
  const step = isOpening ? 1 : -1;
  let depth = 1;
  for (let next = index + step;next >= 0 && next < units.length; next += step) {
    const candidate = units[next]?.value;
    if (candidate === value)
      depth += 1;
    if (candidate === partner)
      depth -= 1;
    if (depth === 0)
      return units[next]?.position ?? position;
  }
  return position;
}
function paragraphMotion(lines, position, direction, count) {
  let line = position.line;
  for (let repetition = 0;repetition < count; repetition += 1) {
    line += direction;
    while (line > 0 && line < lines.length - 1 && (lines[line] ?? "").trim() !== "") {
      line += direction;
    }
    line = Math.min(Math.max(line, 0), lines.length - 1);
  }
  return { line, char: 0 };
}
function getMotionTarget(lines, source, motion, count, countSpecified = false, context = {}) {
  if (lines.length === 0)
    return { line: 0, char: 0 };
  const position = clampPosition(lines, source);
  const repetitions = Math.max(count, 1);
  switch (motion) {
    case "h":
      return { ...position, char: Math.max(position.char - repetitions, 0) };
    case "l":
      return {
        ...position,
        char: Math.min(position.char + repetitions, Math.max(graphemeLength(lines[position.line] ?? "") - 1, 0))
      };
    case "j": {
      const line = Math.min(position.line + repetitions, lines.length - 1);
      return {
        line,
        char: Math.min(context.preferredColumn ?? position.char, Math.max(graphemeLength(lines[line] ?? "") - 1, 0))
      };
    }
    case "k": {
      const line = Math.max(position.line - repetitions, 0);
      return {
        line,
        char: Math.min(context.preferredColumn ?? position.char, Math.max(graphemeLength(lines[line] ?? "") - 1, 0))
      };
    }
    case "0":
      return { line: position.line, char: 0 };
    case "^":
      return firstNonBlank(lines, position.line);
    case "$": {
      const line = Math.min(position.line + repetitions - 1, lines.length - 1);
      return lastCharacter(lines, line);
    }
    case "|":
      return {
        line: position.line,
        char: Math.min(repetitions - 1, Math.max(graphemeLength(lines[position.line] ?? "") - 1, 0))
      };
    case "w":
      return wordForward(lines, position, repetitions, false);
    case "W":
      return wordForward(lines, position, repetitions, true);
    case "b":
      return wordBackward(lines, position, repetitions, false);
    case "B":
      return wordBackward(lines, position, repetitions, true);
    case "e":
      return wordEndForward(lines, position, repetitions, false);
    case "E":
      return wordEndForward(lines, position, repetitions, true);
    case "ge":
      return wordEndBackward(lines, position, repetitions, false);
    case "gE":
      return wordEndBackward(lines, position, repetitions, true);
    case "gg": {
      const line = countSpecified ? Math.min(Math.max(repetitions - 1, firstBodyLine(lines)), lines.length - 1) : firstBodyLine(lines);
      return firstNonBlank(lines, line);
    }
    case "G": {
      const line = countSpecified ? Math.min(repetitions - 1, lines.length - 1) : lines.length - 1;
      return firstNonBlank(lines, line);
    }
    case "f":
    case "F":
    case "t":
    case "T":
      if (!context.character)
        return position;
      return findCharacter(lines, position, {
        character: context.character,
        direction: motion === "f" || motion === "t" ? "forward" : "backward",
        till: motion === "t" || motion === "T"
      }, repetitions);
    case ";":
      return repeatFind(lines, position, repetitions, context.lastFind, false);
    case ",":
      return repeatFind(lines, position, repetitions, context.lastFind, true);
    case "%":
      return matchingBracket(lines, position);
    case "{":
      return paragraphMotion(lines, position, -1, repetitions);
    case "}":
      return paragraphMotion(lines, position, 1, repetitions);
  }
}

// scripts/vim/parser.ts
var operators = new Set(["c", "d", "y", ">", "<"]);
var motions = new Set([
  "h",
  "j",
  "k",
  "l",
  "0",
  "^",
  "$",
  "|",
  "w",
  "b",
  "e",
  "W",
  "B",
  "E",
  "G",
  ";",
  ",",
  "%",
  "{",
  "}"
]);
var prefixedMotions = new Set(["ge", "gE", "gg"]);
var commands = new Set([
  "i",
  "a",
  "v",
  "V",
  "x",
  "X",
  "p",
  "P",
  "u",
  "A",
  "I",
  "o",
  "O",
  "D",
  "C",
  "s",
  "S",
  "Y",
  "J",
  "n",
  "N",
  "*",
  "#",
  ".",
  "r",
  "~"
]);
var textObjects = new Set([
  "iw",
  "aw",
  "iW",
  "aW",
  'i"',
  'a"',
  "i'",
  "a'",
  "i`",
  "a`",
  "i(",
  "a(",
  "i)",
  "a)",
  "ib",
  "ab",
  "i[",
  "a[",
  "i]",
  "a]",
  "i{",
  "a{",
  "i}",
  "a}",
  "iB",
  "aB",
  "ip",
  "ap"
]);
var writableRegisters = /^[a-zA-Z0-9"_+*-]$/;
function createParserState() {
  return {
    keys: "",
    count: "",
    operatorCount: "",
    awaitingRegister: false
  };
}
function withKey(state, key) {
  return {
    ...state,
    keys: `${state.keys}${key}`
  };
}
function parseCount(value) {
  return value === "" ? 1 : Number.parseInt(value, 10);
}
function totalCount(state) {
  return parseCount(state.count) * parseCount(state.operatorCount);
}
function action(action2) {
  return {
    status: "action",
    state: createParserState(),
    action: action2
  };
}
function invalid() {
  return {
    status: "invalid",
    state: createParserState()
  };
}
function isCountDigit(key, currentCount) {
  return /^[1-9]$/.test(key) || key === "0" && currentCount !== "";
}
function parseKey(state, key) {
  if (key === "Escape") {
    return {
      status: "cancelled",
      state: createParserState()
    };
  }
  const next = withKey(state, key);
  if (state.awaitingRegister) {
    if (!writableRegisters.test(key))
      return invalid();
    return {
      status: "pending",
      state: {
        ...next,
        register: key,
        awaitingRegister: false
      }
    };
  }
  if (state.awaitingMotionCharacter) {
    if (state.operator) {
      return action({
        kind: "operator",
        operator: state.operator,
        count: totalCount(state),
        register: state.register,
        target: {
          kind: "motion",
          motion: state.awaitingMotionCharacter,
          character: key
        }
      });
    }
    return action({
      kind: "motion",
      motion: state.awaitingMotionCharacter,
      count: parseCount(state.count),
      countSpecified: state.count !== "",
      character: key
    });
  }
  if (state.awaitingCommandCharacter) {
    if (state.awaitingCommandCharacter !== "r" && !/^[a-z]$/u.test(key)) {
      return invalid();
    }
    return action({
      kind: "command",
      command: state.awaitingCommandCharacter,
      count: parseCount(state.count),
      register: state.register,
      character: key
    });
  }
  if (key === '"' && state.keys === "" && state.count === "" && state.operator === undefined) {
    return {
      status: "pending",
      state: {
        ...next,
        awaitingRegister: true
      }
    };
  }
  if (state.textObjectPrefix) {
    const textObject = `${state.textObjectPrefix}${key}`;
    if (!state.operator || !textObjects.has(textObject))
      return invalid();
    return action({
      kind: "operator",
      operator: state.operator,
      count: totalCount(state),
      register: state.register,
      target: {
        kind: "text-object",
        textObject
      }
    });
  }
  if (state.prefix === "g") {
    const prefixedOperator = `g${key}`;
    if (!state.operator && (prefixedOperator === "g~" || prefixedOperator === "gu" || prefixedOperator === "gU")) {
      return {
        status: "pending",
        state: {
          ...next,
          prefix: undefined,
          operator: prefixedOperator
        }
      };
    }
    if (state.operator && prefixedOperator === state.operator) {
      return action({
        kind: "operator",
        operator: state.operator,
        count: totalCount(state),
        register: state.register,
        target: { kind: "line" }
      });
    }
    const motion = `g${key}`;
    if (!prefixedMotions.has(motion))
      return invalid();
    if (state.operator) {
      return action({
        kind: "operator",
        operator: state.operator,
        count: totalCount(state),
        register: state.register,
        target: { kind: "motion", motion }
      });
    }
    return action({
      kind: "motion",
      motion,
      count: parseCount(state.count),
      countSpecified: state.count !== ""
    });
  }
  if (state.operator) {
    if (isCountDigit(key, state.operatorCount)) {
      return {
        status: "pending",
        state: {
          ...next,
          operatorCount: `${state.operatorCount}${key}`
        }
      };
    }
    const doubledOperatorKey = state.operator.startsWith("g") ? state.operator.slice(1) : state.operator;
    if (key === doubledOperatorKey) {
      return action({
        kind: "operator",
        operator: state.operator,
        count: totalCount(state),
        register: state.register,
        target: { kind: "line" }
      });
    }
    if (key === "i" || key === "a") {
      return {
        status: "pending",
        state: {
          ...next,
          textObjectPrefix: key
        }
      };
    }
    if (key === "g") {
      return {
        status: "pending",
        state: {
          ...next,
          prefix: "g"
        }
      };
    }
    if (key === "f" || key === "F" || key === "t" || key === "T") {
      return {
        status: "pending",
        state: {
          ...next,
          awaitingMotionCharacter: key
        }
      };
    }
    if (motions.has(key)) {
      return action({
        kind: "operator",
        operator: state.operator,
        count: totalCount(state),
        register: state.register,
        target: {
          kind: "motion",
          motion: key
        }
      });
    }
    return invalid();
  }
  if (isCountDigit(key, state.count)) {
    return {
      status: "pending",
      state: {
        ...next,
        count: `${state.count}${key}`
      }
    };
  }
  if (operators.has(key)) {
    return {
      status: "pending",
      state: {
        ...next,
        operator: key
      }
    };
  }
  if (key === "f" || key === "F" || key === "t" || key === "T") {
    return {
      status: "pending",
      state: {
        ...next,
        awaitingMotionCharacter: key
      }
    };
  }
  if (key === "r" || key === "m" || key === "`" || key === "'") {
    return {
      status: "pending",
      state: {
        ...next,
        awaitingCommandCharacter: key
      }
    };
  }
  if (key === "g") {
    return {
      status: "pending",
      state: {
        ...next,
        prefix: "g"
      }
    };
  }
  if (motions.has(key)) {
    return action({
      kind: "motion",
      motion: key,
      count: parseCount(state.count),
      countSpecified: state.count !== ""
    });
  }
  if (commands.has(key)) {
    return action({
      kind: "command",
      command: key,
      count: parseCount(state.count),
      register: state.register
    });
  }
  return invalid();
}

// scripts/vim/registers.ts
var unnamedRegister = '"';
var yankRegister = "0";
var smallDeleteRegister = "-";
var blackHoleRegister = "_";
var clipboardRegisters = new Set(["+", "*"]);
var namedRegisterPattern = /^[a-zA-Z]$/;
var numberedRegisterPattern = /^[0-9]$/;
function createBrowserClipboard() {
  return {
    readText: () => navigator.clipboard.readText(),
    writeText: (text) => navigator.clipboard.writeText(text)
  };
}
function copyValue(value) {
  return { ...value };
}
function normalizeValue(value) {
  if (value.kind === "line" && !value.text.endsWith(`
`)) {
    return {
      ...value,
      text: `${value.text}
`
    };
  }
  return copyValue(value);
}
function appendValues(previous, next) {
  if (!previous)
    return normalizeValue(next);
  const left = normalizeValue(previous);
  const right = normalizeValue(next);
  return {
    text: `${left.text}${right.text}`,
    kind: left.kind === "line" || right.kind === "line" ? "line" : "character"
  };
}
function clipboardValue(text) {
  return {
    text,
    kind: text.endsWith(`
`) ? "line" : "character"
  };
}

class RegisterStore {
  #values = new Map;
  #clipboard;
  constructor(clipboard = createBrowserClipboard()) {
    this.#clipboard = clipboard;
  }
  async read(register = unnamedRegister) {
    if (register === blackHoleRegister)
      return;
    if (clipboardRegisters.has(register)) {
      return clipboardValue(await this.#clipboard.readText());
    }
    const normalized = register.toLowerCase();
    const value = this.#values.get(normalized);
    return value ? copyValue(value) : undefined;
  }
  async recordYank(value, register) {
    const normalizedValue = normalizeValue(value);
    if (register === blackHoleRegister)
      return;
    if (register) {
      const written = await this.#writeExplicit(register, normalizedValue);
      this.#values.set(unnamedRegister, copyValue(written));
      return;
    }
    this.#values.set(yankRegister, copyValue(normalizedValue));
    this.#values.set(unnamedRegister, copyValue(normalizedValue));
  }
  async recordDelete(value, options = {}) {
    const normalizedValue = normalizeValue(value);
    const { register, forceNumbered = false } = options;
    if (register === blackHoleRegister)
      return;
    let written = normalizedValue;
    if (register) {
      written = await this.#writeExplicit(register, normalizedValue);
    }
    const isSmallDelete = normalizedValue.kind === "character" && !normalizedValue.text.includes(`
`) && !forceNumbered;
    if (!register && isSmallDelete) {
      this.#values.set(smallDeleteRegister, copyValue(normalizedValue));
    } else if (!isSmallDelete || forceNumbered) {
      this.#rotateDeleteRegisters(normalizedValue);
    }
    this.#values.set(unnamedRegister, copyValue(written));
  }
  snapshot() {
    return new Map(Array.from(this.#values, ([name, value]) => [
      name,
      copyValue(value)
    ]));
  }
  async#writeExplicit(register, value) {
    if (clipboardRegisters.has(register)) {
      await this.#clipboard.writeText(value.text);
      return copyValue(value);
    }
    if (register === unnamedRegister) {
      this.#values.set(yankRegister, copyValue(value));
      return copyValue(value);
    }
    if (numberedRegisterPattern.test(register)) {
      this.#values.set(register, copyValue(value));
      return copyValue(value);
    }
    if (!namedRegisterPattern.test(register)) {
      throw new Error(`Unsupported register: ${register}`);
    }
    const normalized = register.toLowerCase();
    const written = register === register.toUpperCase() ? appendValues(this.#values.get(normalized), value) : copyValue(value);
    this.#values.set(normalized, copyValue(written));
    return written;
  }
  #rotateDeleteRegisters(value) {
    for (let index = 9;index >= 2; index -= 1) {
      const previous = this.#values.get(String(index - 1));
      if (previous) {
        this.#values.set(String(index), copyValue(previous));
      } else {
        this.#values.delete(String(index));
      }
    }
    this.#values.set("1", copyValue(value));
  }
}

// scripts/vim/marks.ts
function adjustedCharacter(oldText, newText, character) {
  const oldGraphemes = splitGraphemes(oldText);
  const newGraphemes = splitGraphemes(newText);
  let prefix = 0;
  while (prefix < oldGraphemes.length && prefix < newGraphemes.length && oldGraphemes[prefix] === newGraphemes[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (suffix < oldGraphemes.length - prefix && suffix < newGraphemes.length - prefix && oldGraphemes[oldGraphemes.length - suffix - 1] === newGraphemes[newGraphemes.length - suffix - 1]) {
    suffix += 1;
  }
  const oldChangeEnd = oldGraphemes.length - suffix;
  const newChangeEnd = newGraphemes.length - suffix;
  if (character < prefix)
    return character;
  if (character >= oldChangeEnd) {
    return Math.max(character + newChangeEnd - oldChangeEnd, 0);
  }
  return Math.min(prefix + (character - prefix), newChangeEnd);
}

class MarkStore {
  marks = new Map;
  set(name, pageTitle, lines, position) {
    const line = lines[position.line];
    if (!line)
      return;
    this.marks.set(`${pageTitle}
${name}`, {
      pageTitle,
      lineId: line.id,
      char: position.char,
      lineText: line.text
    });
  }
  reconcile(pageTitle, lines) {
    const linesById = new Map(lines.map((line) => [line.id, line]));
    for (const [key, mark] of this.marks) {
      if (mark.pageTitle !== pageTitle)
        continue;
      const line = linesById.get(mark.lineId);
      if (!line) {
        this.marks.delete(key);
        continue;
      }
      mark.char = adjustedCharacter(mark.lineText, line.text, mark.char);
      mark.lineText = line.text;
    }
  }
  get(name, pageTitle, lines) {
    this.reconcile(pageTitle, lines);
    const mark = this.marks.get(`${pageTitle}
${name}`);
    if (!mark)
      return null;
    const line = lines.findIndex(({ id }) => id === mark.lineId);
    return line < 0 ? null : { line, char: mark.char };
  }
}

// scripts/vim/search.ts
function findAllSearchMatches(lines, query) {
  if (lines.length === 0 || query === "")
    return [];
  const length = graphemeLength(query);
  const matches = [];
  for (let line = 0;line < lines.length; line += 1) {
    const text = lines[line] ?? "";
    let offset = 0;
    while (offset <= text.length - query.length) {
      const found = text.indexOf(query, offset);
      if (found < 0)
        break;
      matches.push({
        line,
        char: graphemeIndexAtCodeUnit(text, found),
        length
      });
      offset = found + query.length;
    }
  }
  return matches;
}
function findSearchMatch(lines, cursor, query, direction, count = 1) {
  if (lines.length === 0 || query === "")
    return null;
  const matches = findAllSearchMatches(lines, query);
  if (matches.length === 0)
    return null;
  const cursorOffset = codeUnitOffsetAtGrapheme(lines[cursor.line] ?? "", cursor.char);
  const ordered = direction === "forward" ? [
    ...matches.filter((match2) => match2.line > cursor.line || match2.line === cursor.line && codeUnitOffsetAtGrapheme(lines[match2.line] ?? "", match2.char) > cursorOffset),
    ...matches.filter((match2) => match2.line < cursor.line || match2.line === cursor.line && codeUnitOffsetAtGrapheme(lines[match2.line] ?? "", match2.char) <= cursorOffset)
  ] : [
    ...matches.filter((match2) => match2.line < cursor.line || match2.line === cursor.line && codeUnitOffsetAtGrapheme(lines[match2.line] ?? "", match2.char) < cursorOffset).reverse(),
    ...matches.filter((match2) => match2.line > cursor.line || match2.line === cursor.line && codeUnitOffsetAtGrapheme(lines[match2.line] ?? "", match2.char) >= cursorOffset).reverse()
  ];
  const match = ordered[(Math.max(count, 1) - 1) % ordered.length];
  return match ? { line: match.line, char: match.char } : null;
}
function searchWordUnderCursor(lines, cursor) {
  const graphemes = splitGraphemes(lines[cursor.line] ?? "");
  if (graphemes.length === 0)
    return null;
  let index = Math.min(cursor.char, graphemes.length - 1);
  while (index < graphemes.length && classifyCharacter(graphemes[index] ?? "") !== "keyword") {
    index += 1;
  }
  if (index >= graphemes.length)
    return null;
  let start = index;
  let end = index + 1;
  while (start > 0 && classifyCharacter(graphemes[start - 1] ?? "") === "keyword") {
    start -= 1;
  }
  while (end < graphemes.length && classifyCharacter(graphemes[end] ?? "") === "keyword") {
    end += 1;
  }
  return graphemes.slice(start, end).join("");
}
function substituteText(lines, options) {
  const nextLines = [...lines];
  if (lines.length === 0 || options.pattern === "") {
    return { lines: nextLines, count: 0, firstMatch: null };
  }
  const startLine = Math.min(Math.max(options.startLine, 0), lines.length - 1);
  const endLine = Math.min(Math.max(options.endLine, startLine), lines.length - 1);
  let count = 0;
  let firstMatch = null;
  for (let line = startLine;line <= endLine; line += 1) {
    const text = lines[line] ?? "";
    const result = substituteLine(text, options.pattern, options.replacement, options.global);
    if (result.count === 0)
      continue;
    nextLines[line] = result.text;
    count += result.count;
    firstMatch ??= {
      line,
      char: graphemeIndexAtCodeUnit(text, result.firstOffset)
    };
  }
  return { lines: nextLines, count, firstMatch };
}
function substituteLine(text, pattern, replacement, global) {
  let offset = 0;
  let count = 0;
  let firstOffset = -1;
  let result = "";
  while (offset <= text.length - pattern.length) {
    const found = text.indexOf(pattern, offset);
    if (found < 0)
      break;
    result += text.slice(offset, found);
    result += replacement;
    firstOffset = firstOffset < 0 ? found : firstOffset;
    count += 1;
    offset = found + pattern.length;
    if (!global)
      break;
  }
  if (count === 0)
    return { text, count, firstOffset: 0 };
  result += text.slice(offset);
  return { text: result, count, firstOffset };
}

// scripts/vim/ex.ts
function parseExCommand(source) {
  const input = source.replace(/^:/u, "").trim();
  if (input === "")
    return { status: "empty" };
  const substitute = parseSubstituteCommand(input);
  if (substitute)
    return substitute;
  const [name = "", ...arguments_] = input.split(/\s+/u);
  switch (name) {
    case "w":
    case "write":
      return arguments_.length === 0 ? { status: "command", command: { kind: "write" } } : { status: "invalid", message: "E488: Trailing characters" };
    case "q":
    case "quit":
      return arguments_.length === 0 ? { status: "command", command: { kind: "quit" } } : { status: "invalid", message: "E488: Trailing characters" };
    case "wq":
    case "x":
      return arguments_.length === 0 ? { status: "command", command: { kind: "write-quit" } } : { status: "invalid", message: "E488: Trailing characters" };
    case "home":
    case "qa":
      return arguments_.length === 0 ? { status: "command", command: { kind: "home" } } : { status: "invalid", message: "E488: Trailing characters" };
    case "e":
    case "edit": {
      const pageTitle = arguments_.join(" ").trim();
      return pageTitle === "" ? { status: "invalid", message: "E471: Argument required" } : {
        status: "command",
        command: { kind: "edit", pageTitle }
      };
    }
    default:
      return {
        status: "invalid",
        message: `E492: Not an editor command: ${name}`
      };
  }
}
function parseSubstituteCommand(input) {
  const prefixes = [
    { prefix: "%substitute", range: "all" },
    { prefix: "%s", range: "all" },
    { prefix: "substitute", range: "current" },
    { prefix: "s", range: "current" }
  ];
  const match = prefixes.find(({ prefix }) => input.startsWith(prefix));
  if (!match)
    return null;
  const delimiter = input[match.prefix.length];
  if (!delimiter || /[\s\p{L}\p{N}_]/u.test(delimiter))
    return null;
  const pattern = readSubstitutePart(input, match.prefix.length + 1, delimiter);
  if (!pattern) {
    return {
      status: "invalid",
      message: "E488: Trailing characters"
    };
  }
  if (pattern.value === "") {
    return {
      status: "invalid",
      message: "E476: Invalid command"
    };
  }
  const replacement = readSubstitutePart(input, pattern.next, delimiter, true);
  if (!replacement) {
    return {
      status: "invalid",
      message: "E488: Trailing characters"
    };
  }
  const flags = input.slice(replacement.next).trim();
  if (!/^[g]*$/u.test(flags)) {
    return {
      status: "invalid",
      message: `E488: Trailing characters: ${flags}`
    };
  }
  return {
    status: "command",
    command: {
      kind: "substitute",
      range: match.range,
      pattern: pattern.value,
      replacement: replacement.value,
      flags: {
        global: flags.includes("g")
      }
    }
  };
}
function readSubstitutePart(input, start, delimiter, allowEnd = false) {
  let value = "";
  for (let index = start;index < input.length; index += 1) {
    const character = input[index];
    if (character === delimiter) {
      return { value, next: index + 1 };
    }
    if (character === "\\" && index + 1 < input.length) {
      const next = input[index + 1];
      if (next === delimiter || next === "\\") {
        value += next;
        index += 1;
        continue;
      }
    }
    value += character;
  }
  return allowEnd ? { value, next: input.length } : null;
}

// scripts/vim/repeat.ts
function isRepeatableChange(action2) {
  if (action2.kind === "operator") {
    return action2.operator === "d" || action2.operator === ">" || action2.operator === "<" || action2.operator === "g~" || action2.operator === "gu" || action2.operator === "gU";
  }
  if (action2.kind !== "command")
    return false;
  return new Set([
    "x",
    "X",
    "p",
    "P",
    "D",
    "J",
    "ctrl-a",
    "ctrl-x",
    "r",
    "~"
  ]).has(action2.command);
}
function createRepeatAction(change, count) {
  return {
    ...structuredClone(change),
    count
  };
}

// scripts/vim/text-objects.ts
function isWhitespace2(value) {
  return /^\s$/u.test(value);
}
function characterClass(value, bigWord) {
  return bigWord ? classifyWord(value) : classifyCharacter(value);
}
function wordObject(lines, cursor, around, bigWord, count) {
  const graphemes = splitGraphemes(lines[cursor.line] ?? "");
  if (graphemes.length === 0)
    return null;
  let index = Math.min(cursor.char, graphemes.length - 1);
  let start = index;
  let end = index + 1;
  if (isWhitespace2(graphemes[index] ?? "")) {
    while (start > 0 && isWhitespace2(graphemes[start - 1] ?? ""))
      start -= 1;
    while (end < graphemes.length && isWhitespace2(graphemes[end] ?? "")) {
      end += 1;
    }
    if (around && end < graphemes.length) {
      const nextClass = characterClass(graphemes[end] ?? "", bigWord);
      while (end < graphemes.length && !isWhitespace2(graphemes[end] ?? "") && characterClass(graphemes[end] ?? "", bigWord) === nextClass) {
        end += 1;
      }
    }
  } else {
    const currentClass = characterClass(graphemes[index] ?? "", bigWord);
    while (start > 0 && !isWhitespace2(graphemes[start - 1] ?? "") && characterClass(graphemes[start - 1] ?? "", bigWord) === currentClass) {
      start -= 1;
    }
    while (end < graphemes.length && !isWhitespace2(graphemes[end] ?? "") && characterClass(graphemes[end] ?? "", bigWord) === currentClass) {
      end += 1;
    }
  }
  for (let repetition = 1;repetition < count; repetition += 1) {
    while (end < graphemes.length && isWhitespace2(graphemes[end] ?? "")) {
      end += 1;
    }
    if (end >= graphemes.length)
      break;
    const nextClass = characterClass(graphemes[end] ?? "", bigWord);
    while (end < graphemes.length && !isWhitespace2(graphemes[end] ?? "") && characterClass(graphemes[end] ?? "", bigWord) === nextClass) {
      end += 1;
    }
  }
  if (around && !isWhitespace2(graphemes[index] ?? "")) {
    const contentEnd = end;
    while (end < graphemes.length && isWhitespace2(graphemes[end] ?? "")) {
      end += 1;
    }
    if (end === contentEnd) {
      while (start > 0 && isWhitespace2(graphemes[start - 1] ?? "")) {
        start -= 1;
      }
    }
  }
  return {
    start: { line: cursor.line, char: start },
    end: { line: cursor.line, char: end },
    kind: "character"
  };
}
function quoteObject(lines, cursor, quote, around) {
  const graphemes = splitGraphemes(lines[cursor.line] ?? "");
  const quotes = [];
  for (let index = 0;index < graphemes.length; index += 1) {
    let backslashes = 0;
    for (let previous = index - 1;previous >= 0 && graphemes[previous] === "\\"; previous -= 1) {
      backslashes += 1;
    }
    if (graphemes[index] === quote && backslashes % 2 === 0) {
      quotes.push(index);
    }
  }
  for (let index = 0;index + 1 < quotes.length; index += 2) {
    const open = quotes[index];
    const close = quotes[index + 1];
    if (cursor.char < open || cursor.char > close)
      continue;
    let start = around ? open : open + 1;
    let end = around ? close + 1 : close;
    if (start === end)
      return null;
    if (around) {
      const contentEnd = end;
      while (end < graphemes.length && isWhitespace2(graphemes[end] ?? "")) {
        end += 1;
      }
      if (end === contentEnd) {
        while (start > 0 && isWhitespace2(graphemes[start - 1] ?? "")) {
          start -= 1;
        }
      }
    }
    return {
      start: { line: cursor.line, char: start },
      end: { line: cursor.line, char: end },
      kind: "character"
    };
  }
  return null;
}
function flatten(lines) {
  const units = [];
  lines.forEach((line, lineIndex) => {
    splitGraphemes(line).forEach((value, char) => {
      units.push({ value, position: { line: lineIndex, char } });
    });
  });
  return units;
}
function positionIndex(units, cursor) {
  const exact = units.findIndex(({ position }) => position.line === cursor.line && position.char === cursor.char);
  return exact >= 0 ? exact : 0;
}
function bracketObject(lines, cursor, open, close, around, count) {
  const units = flatten(lines);
  if (units.length === 0)
    return null;
  const cursorIndex = positionIndex(units, cursor);
  const candidates = [];
  const stack = [];
  units.forEach((unit, index) => {
    if (unit.value === open)
      stack.push(index);
    if (unit.value !== close)
      return;
    const opening = stack.pop();
    if (opening !== undefined && opening <= cursorIndex && cursorIndex <= index) {
      candidates.push({ open: opening, close: index });
    }
  });
  candidates.sort((left, right) => left.close - left.open - (right.close - right.open));
  const candidate = candidates[Math.min(count - 1, candidates.length - 1)];
  if (!candidate)
    return null;
  const startUnit = units[candidate.open];
  const endUnit = units[candidate.close];
  const startChar = startUnit.position.char + (around ? 0 : 1);
  const endChar = endUnit.position.char + (around ? 1 : 0);
  if (startUnit.position.line === endUnit.position.line && startChar === endChar) {
    return null;
  }
  return {
    start: { line: startUnit.position.line, char: startChar },
    end: { line: endUnit.position.line, char: endChar },
    kind: "character"
  };
}
function paragraphObject(lines, cursor, around, count) {
  if (lines.length === 0)
    return null;
  const blank = (line) => (lines[line] ?? "").trim() === "";
  let start = cursor.line;
  let end = cursor.line;
  if (blank(cursor.line)) {
    while (start > 0 && blank(start - 1))
      start -= 1;
    while (end + 1 < lines.length && blank(end + 1))
      end += 1;
  } else {
    while (start > 0 && !blank(start - 1))
      start -= 1;
    while (end + 1 < lines.length && !blank(end + 1))
      end += 1;
  }
  for (let repetition = 1;repetition < count; repetition += 1) {
    while (end + 1 < lines.length && blank(end + 1))
      end += 1;
    while (end + 1 < lines.length && !blank(end + 1))
      end += 1;
  }
  if (around && !blank(cursor.line)) {
    const contentEnd = end;
    while (end + 1 < lines.length && blank(end + 1))
      end += 1;
    if (end === contentEnd) {
      while (start > 0 && blank(start - 1))
        start -= 1;
    }
  }
  return {
    start: { line: start, char: 0 },
    end: { line: end, char: 0 },
    kind: "line"
  };
}
var bracketAliases = {
  "i(": { open: "(", close: ")", around: false },
  "i)": { open: "(", close: ")", around: false },
  ib: { open: "(", close: ")", around: false },
  "a(": { open: "(", close: ")", around: true },
  "a)": { open: "(", close: ")", around: true },
  ab: { open: "(", close: ")", around: true },
  "i[": { open: "[", close: "]", around: false },
  "i]": { open: "[", close: "]", around: false },
  "a[": { open: "[", close: "]", around: true },
  "a]": { open: "[", close: "]", around: true },
  "i{": { open: "{", close: "}", around: false },
  "i}": { open: "{", close: "}", around: false },
  iB: { open: "{", close: "}", around: false },
  "a{": { open: "{", close: "}", around: true },
  "a}": { open: "{", close: "}", around: true },
  aB: { open: "{", close: "}", around: true }
};
function getTextObjectRange(lines, cursor, textObject, count = 1) {
  switch (textObject) {
    case "iw":
      return wordObject(lines, cursor, false, false, count);
    case "aw":
      return wordObject(lines, cursor, true, false, count);
    case "iW":
      return wordObject(lines, cursor, false, true, count);
    case "aW":
      return wordObject(lines, cursor, true, true, count);
    case 'i"':
    case "i'":
    case "i`":
      return quoteObject(lines, cursor, textObject[1], false);
    case 'a"':
    case "a'":
    case "a`":
      return quoteObject(lines, cursor, textObject[1], true);
    case "ip":
      return paragraphObject(lines, cursor, false, count);
    case "ap":
      return paragraphObject(lines, cursor, true, count);
    default: {
      const bracket = bracketAliases[textObject];
      return bracket ? bracketObject(lines, cursor, bracket.open, bracket.close, bracket.around, count) : null;
    }
  }
}

// scripts/vim/view.ts
var bodyClasses = [
  "vim-disabled",
  "vim-normal",
  "vim-insert",
  "vim-visual"
];
var cssText = [
  "body.vim-insert #cosense-vim-block-cursor{display:none!important}",
  "body.vim-visual #cosense-vim-block-cursor{display:none!important}",
  "body.vim-disabled #cosense-vim-block-cursor{display:none!important}",
  "#cosense-vim-status{position:fixed;left:12px;right:12px;bottom:20px;z-index:99999;display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:black;color:white;font-size:12px;font-family:monospace;border-radius:4px;pointer-events:none}",
  "body.vim-disabled #cosense-vim-status{background:#555;opacity:.75}",
  "#cosense-vim-pending{min-width:1.5em;text-align:right}",
  "#cosense-vim-command{flex:1;min-width:0;margin:0 8px;padding:0;border:0;outline:0;background:transparent;color:inherit;font:inherit;pointer-events:auto}",
  "#cosense-vim-command[hidden]{display:none}",
  "#cosense-vim-pending[hidden]{display:none}",
  "#cosense-vim-block-cursor{position:fixed;z-index:99998;background:white;pointer-events:none;display:none;mix-blend-mode:difference}",
  "#cosense-vim-search-highlights{position:fixed;inset:0;z-index:99997;pointer-events:none}",
  ".cosense-vim-search-highlight{position:fixed;background:rgba(255,230,0,.42);border-radius:2px;pointer-events:none}",
  ".cosense-vim-search-highlight-active{background:rgba(255,150,0,.62)}"
].join("");
function replaceElement(selector, create) {
  document.querySelector(selector)?.remove();
  const element = create();
  document.body.appendChild(element);
  return element;
}
function createVimView() {
  document.querySelector("#cosense-vim-style")?.remove();
  const style = document.createElement("style");
  style.id = "cosense-vim-style";
  style.textContent = cssText;
  document.head.appendChild(style);
  const statusBar = replaceElement("#cosense-vim-status", () => {
    const element = document.createElement("div");
    element.id = "cosense-vim-status";
    return element;
  });
  const modeIndicator = document.createElement("span");
  modeIndicator.id = "cosense-vim-mode";
  const pendingIndicator = document.createElement("span");
  pendingIndicator.id = "cosense-vim-pending";
  pendingIndicator.hidden = true;
  const commandInput = document.createElement("input");
  commandInput.id = "cosense-vim-command";
  commandInput.type = "text";
  commandInput.hidden = true;
  commandInput.autocomplete = "off";
  commandInput.spellcheck = false;
  statusBar.append(modeIndicator, commandInput, pendingIndicator);
  const blockCursor = replaceElement("#cosense-vim-block-cursor", () => {
    const element = document.createElement("div");
    element.id = "cosense-vim-block-cursor";
    return element;
  });
  const searchLayer = replaceElement("#cosense-vim-search-highlights", () => {
    const element = document.createElement("div");
    element.id = "cosense-vim-search-highlights";
    return element;
  });
  let cursorFrame = 0;
  let cursorFollowupFrame = 0;
  function render({
    enabled,
    mode,
    pendingKeys,
    cursorRect,
    searchHighlights
  }) {
    document.body.classList.remove(...bodyClasses);
    document.body.classList.add(enabled ? `vim-${mode}` : "vim-disabled");
    modeIndicator.textContent = enabled ? `-- ${mode.toUpperCase()} --` : "-- VIM OFF --";
    pendingIndicator.textContent = pendingKeys;
    pendingIndicator.hidden = !enabled || pendingKeys === "";
    renderSearchHighlights(enabled ? searchHighlights : []);
    if (!enabled || mode !== "normal" || !cursorRect || cursorRect.height === 0) {
      blockCursor.style.display = "none";
      return;
    }
    blockCursor.style.display = "block";
    blockCursor.style.left = `${cursorRect.left}px`;
    blockCursor.style.top = `${cursorRect.top}px`;
    blockCursor.style.width = `${Math.max(cursorRect.width, 2)}px`;
    blockCursor.style.height = `${cursorRect.height}px`;
  }
  function renderSearchHighlights(highlights) {
    searchLayer.replaceChildren();
    if (highlights.length === 0)
      return;
    const lines = document.querySelectorAll(".editor .line");
    const fragment = document.createDocumentFragment();
    for (const highlight of highlights) {
      const line = findLineElement(highlight, lines);
      if (!line)
        continue;
      for (let char = highlight.char;char < highlight.char + highlight.length; char += 1) {
        const character = line.querySelector(`[data-char-index="${char}"]`);
        if (!character)
          continue;
        const rect = character.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0)
          continue;
        const element = document.createElement("div");
        element.className = [
          "cosense-vim-search-highlight",
          highlight.active ? "cosense-vim-search-highlight-active" : ""
        ].filter(Boolean).join(" ");
        element.style.left = `${rect.left}px`;
        element.style.top = `${rect.top}px`;
        element.style.width = `${rect.width}px`;
        element.style.height = `${rect.height}px`;
        fragment.appendChild(element);
      }
    }
    searchLayer.appendChild(fragment);
  }
  function findLineElement(highlight, lines) {
    if (highlight.lineId && !highlight.lineId.startsWith("line:")) {
      const line = document.getElementById(`L${highlight.lineId}`);
      if (line instanceof HTMLElement && line.matches(".line")) {
        return line;
      }
    }
    return lines[highlight.line] ?? null;
  }
  function scheduleCursorRender(renderCursor) {
    cancelAnimationFrame(cursorFrame);
    cancelAnimationFrame(cursorFollowupFrame);
    cursorFrame = requestAnimationFrame(() => {
      renderCursor();
      cursorFollowupFrame = requestAnimationFrame(renderCursor);
    });
  }
  function destroy() {
    cancelAnimationFrame(cursorFrame);
    cancelAnimationFrame(cursorFollowupFrame);
    style.remove();
    statusBar.remove();
    blockCursor.remove();
    searchLayer.remove();
    document.body.classList.remove(...bodyClasses);
  }
  return {
    commandInput,
    render,
    scheduleCursorRender,
    destroy
  };
}

// scripts/vim/controller.ts
var enabledStorageKey = "cosense-vim-enabled";
function createVimController() {
  const view = createVimView();
  const registers = new RegisterStore;
  const marks = new MarkStore;
  let mode = "insert";
  let parserState = createParserState();
  let enabled = localStorage.getItem(enabledStorageKey) !== "false";
  let lastFind;
  let preferredColumn;
  let visualAnchor;
  let visualCursor;
  let visualKind = "character";
  let visualTextObjectPrefix;
  let lastChange;
  let commandLineActive = false;
  let commandLinePrefix = ":";
  let lastSearch;
  let activeSearch;
  function render() {
    view.render({
      enabled,
      mode,
      pendingKeys: `${parserState.keys}${visualTextObjectPrefix ?? ""}`,
      cursorRect: commandLineActive ? null : getCursorRect(),
      searchHighlights: currentSearchHighlights()
    });
  }
  function currentSearchHighlights() {
    if (!lastSearch)
      return [];
    const snapshots = getPageLineSnapshots();
    return findAllSearchMatches(getPageLines(), lastSearch.query).map((match) => ({
      ...match,
      lineId: snapshots[match.line]?.id,
      active: activeSearch?.line === match.line && activeSearch.char === match.char
    }));
  }
  function clearSearchHighlight() {
    lastSearch = undefined;
    activeSearch = undefined;
    render();
  }
  function openCommandLine(prefix) {
    commandLineActive = true;
    commandLinePrefix = prefix;
    parserState = createParserState();
    view.commandInput.hidden = false;
    view.commandInput.value = prefix;
    render();
    view.commandInput.focus({ preventScroll: true });
    view.commandInput.setSelectionRange(1, 1);
  }
  function closeCommandLine() {
    commandLineActive = false;
    view.commandInput.hidden = true;
    view.commandInput.value = "";
    render();
    focusTextInput();
  }
  async function executeExCommand(command) {
    switch (command.kind) {
      case "write":
        await waitForSave();
        return;
      case "quit":
        goBackOrHome();
        return;
      case "write-quit":
        await waitForSave();
        goBackOrHome();
        return;
      case "home":
        goProjectHome();
        return;
      case "edit":
        await showPage(command.pageTitle);
        mode = "insert";
        parserState = createParserState();
        preferredColumn = undefined;
        activatePositionAfterNavigation({ line: 0, char: 0 });
        return;
      case "substitute": {
        const lines = getPageLines();
        const cursor = getCursorPosition();
        if (lines.length === 0 || !cursor)
          return;
        const startLine = command.range === "all" ? 0 : cursor.line;
        const endLine = command.range === "all" ? lines.length - 1 : cursor.line;
        const result = substituteText(lines, {
          startLine,
          endLine,
          pattern: command.pattern,
          replacement: command.replacement,
          global: command.flags.global
        });
        if (result.count === 0) {
          throw new Error(`E486: Pattern not found: ${command.pattern}`);
        }
        for (let line = startLine;line <= endLine; line += 1) {
          if (result.lines[line] !== lines[line]) {
            updateLine(result.lines[line] ?? "", line);
          }
        }
        lastSearch = {
          query: command.pattern,
          direction: "forward"
        };
        activeSearch = result.firstMatch ?? undefined;
        if (result.firstMatch)
          moveAfterRender(result.firstMatch);
        scheduleRender();
        return;
      }
    }
  }
  function findSearchTarget(direction, count = 1) {
    if (!lastSearch)
      return null;
    const lines = getPageLines();
    const cursor = getCursorPosition();
    if (!cursor)
      return null;
    return findSearchMatch(lines, cursor, lastSearch.query, direction, count);
  }
  function searchWordAtCursor(direction, count) {
    const lines = getPageLines();
    const cursor = getCursorPosition();
    if (!cursor || lines.length === 0)
      return;
    const query = searchWordUnderCursor(lines, cursor);
    if (!query)
      return;
    lastSearch = { query, direction };
    const target = findSearchTarget(direction, count);
    if (!target)
      return;
    activeSearch = target;
    activatePositionAfterNavigation(target);
  }
  function handleCommandLineKeydown(event) {
    if (!commandLineActive)
      return;
    if (event.key === "Escape") {
      consume(event);
      closeCommandLine();
      return;
    }
    if (event.key === "Backspace" && view.commandInput.selectionStart === 1 && view.commandInput.selectionEnd === 1) {
      consume(event);
      closeCommandLine();
      return;
    }
    if (event.key !== "Enter")
      return;
    consume(event);
    if (commandLinePrefix === "/" || commandLinePrefix === "?") {
      const query = view.commandInput.value.slice(1);
      if (query === "") {
        closeCommandLine();
        return;
      }
      const direction = commandLinePrefix === "/" ? "forward" : "backward";
      lastSearch = { query, direction };
      const target = findSearchTarget(direction);
      if (!target) {
        view.commandInput.value = `E486: Pattern not found: ${query}`;
        view.commandInput.select();
        return;
      }
      activeSearch = target;
      closeCommandLine();
      activatePositionAfterNavigation(target);
      return;
    }
    const result = parseExCommand(view.commandInput.value);
    if (result.status === "empty") {
      closeCommandLine();
      return;
    }
    if (result.status === "invalid") {
      view.commandInput.value = result.message;
      view.commandInput.select();
      return;
    }
    executeExCommand(result.command).then(closeCommandLine).catch((error) => {
      view.commandInput.value = error instanceof Error ? error.message : String(error);
      view.commandInput.select();
    });
  }
  function scheduleRender() {
    view.scheduleCursorRender(render);
  }
  function schedulePointerRender() {
    scheduleRender();
    window.setTimeout(scheduleRender, 50);
    window.setTimeout(scheduleRender, 150);
  }
  function setMode(nextMode) {
    mode = nextMode;
    parserState = createParserState();
    preferredColumn = undefined;
    if (nextMode !== "visual") {
      visualAnchor = undefined;
      visualCursor = undefined;
      visualTextObjectPrefix = undefined;
    }
    render();
    focusTextInput();
  }
  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    localStorage.setItem(enabledStorageKey, String(enabled));
    setMode("insert");
    console.log(`[cosense-vim] ${enabled ? "enabled" : "disabled"}`);
  }
  function consume(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function move(key, selecting = false) {
    sendMotion(key, selecting);
    scheduleRender();
  }
  function moveAfterRender(position) {
    requestAnimationFrame(() => {
      moveToPosition(position);
      scheduleRender();
    });
  }
  function activatePositionAfterNavigation(position) {
    let attempts = 0;
    const retry = () => {
      attempts += 1;
      if (activatePagePosition(position)) {
        render();
        return;
      }
      if (attempts < 30)
        window.setTimeout(retry, 50);
    };
    requestAnimationFrame(retry);
  }
  function enterInsertAt(position) {
    mode = "insert";
    parserState = createParserState();
    preferredColumn = undefined;
    requestAnimationFrame(() => {
      moveToPosition(position);
      render();
      focusTextInput();
    });
  }
  function enterVisual(kind) {
    const cursor = getCursorPosition();
    const lines = getPageLines();
    if (!cursor || lines.length === 0)
      return;
    mode = "visual";
    visualKind = kind;
    visualAnchor = cursor;
    visualCursor = cursor;
    parserState = createParserState();
    preferredColumn = undefined;
    syncVisualSelection();
    render();
  }
  function currentVisualRange() {
    const lines = getPageLines();
    if (!visualAnchor || !visualCursor || lines.length === 0)
      return null;
    return visualRange(lines, visualAnchor, visualCursor, visualKind);
  }
  function lineStartAfter(lines, line) {
    return line + 1 < lines.length ? { line: line + 1, char: 0 } : {
      line,
      char: graphemeLength(lines[line] ?? "")
    };
  }
  function syncVisualSelection() {
    const lines = getPageLines();
    if (!visualAnchor || !visualCursor || lines.length === 0)
      return;
    clearSelection(visualCursor);
    const forward = visualCursor.line > visualAnchor.line || visualCursor.line === visualAnchor.line && visualCursor.char >= visualAnchor.char;
    if (visualKind === "line") {
      if (forward) {
        selectRange({ line: visualAnchor.line, char: 0 }, lineStartAfter(lines, visualCursor.line));
      } else {
        selectRange(lineStartAfter(lines, visualAnchor.line), { line: visualCursor.line, char: 0 });
      }
      return;
    }
    if (forward) {
      selectRange(visualAnchor, {
        line: visualCursor.line,
        char: Math.min(visualCursor.char + 1, graphemeLength(lines[visualCursor.line] ?? ""))
      });
    } else {
      selectRange({
        line: visualAnchor.line,
        char: Math.min(visualAnchor.char + 1, graphemeLength(lines[visualAnchor.line] ?? ""))
      }, visualCursor);
    }
  }
  function selectVisualTextObject(textObject) {
    const lines = getPageLines();
    const cursor = visualCursor;
    if (!cursor || lines.length === 0)
      return;
    const range = getTextObjectRange(lines, cursor, textObject);
    if (!range)
      return;
    const normalized = normalizeRange(range);
    visualKind = normalized.kind;
    visualAnchor = normalized.start;
    visualCursor = normalized.kind === "line" ? { line: normalized.end.line, char: 0 } : positionBefore(lines, normalized.end);
    syncVisualSelection();
    render();
  }
  function motionRange(action2) {
    if (action2.target.kind !== "motion")
      return null;
    const lines = getPageLines();
    const cursor = getCursorPosition();
    if (!cursor || lines.length === 0)
      return null;
    const current = splitGraphemes(lines[cursor.line] ?? "")[cursor.char] ?? "";
    const effectiveMotion = effectiveOperatorMotion(action2.operator, action2.target.motion, current);
    const target = getMotionTarget(lines, cursor, effectiveMotion, action2.count, true, {
      character: action2.target.character,
      lastFind,
      preferredColumn
    });
    return {
      lines,
      range: rangeForMotion(lines, cursor, target, effectiveMotion)
    };
  }
  async function yankRange(lines, range, register) {
    await registers.recordYank({
      text: getTextInRange(lines, range),
      kind: range.kind
    }, register);
  }
  async function deleteRange(lines, range, register) {
    const result = deleteCharacterRange(lines, range);
    if (result.deletedText === "")
      return;
    await registers.recordDelete({
      text: result.deletedText,
      kind: range.kind
    }, {
      register,
      forceNumbered: range.kind === "line"
    });
    if (range.kind === "line") {
      const start = Math.min(range.start.line, range.end.line);
      const count = Math.abs(range.end.line - range.start.line) + 1;
      deleteLines(start, count);
      scheduleRender();
      return;
    }
    deleteTextRange(range.start, range.end);
    scheduleRender();
  }
  async function put(register, after, count) {
    const value = await registers.read(register);
    const lines = getPageLines();
    const cursor = getCursorPosition();
    if (!value || !cursor || lines.length === 0)
      return;
    if (value.kind === "line") {
      const values = linewiseValues(value.text);
      const index = cursor.line + (after ? 1 : 0);
      let offset = 0;
      for (let repetition = 0;repetition < count; repetition += 1) {
        for (const text of values) {
          insertLine(text, index + offset);
          offset += 1;
        }
      }
      moveAfterRender({ line: index, char: 0 });
      return;
    }
    const repeated = value.text.repeat(count);
    if (repeated.includes(`
`)) {
      const result2 = putCharacterwiseLines(lines, cursor, repeated, after);
      updateLine(result2.lines[cursor.line] ?? "", cursor.line);
      for (let line = cursor.line + 1;line <= result2.cursor.line; line += 1) {
        insertLine(result2.lines[line] ?? "", line);
      }
      moveAfterRender(result2.cursor);
      return;
    }
    const result = putCharacterwise(lines[cursor.line] ?? "", cursor.char, repeated, after);
    updateLine(result.text, cursor.line);
    moveAfterRender({ line: cursor.line, char: result.cursorChar });
  }
  async function executeCommand(action2) {
    const lines = getPageLines();
    const cursor = getCursorPosition();
    switch (action2.command) {
      case "i":
        setMode("insert");
        return;
      case "a":
        if (!cursor || lines.length === 0)
          return;
        enterInsertAt({
          line: cursor.line,
          char: Math.min(cursor.char + 1, graphemeLength(lines[cursor.line] ?? ""))
        });
        return;
      case "I":
        if (!cursor || lines.length === 0)
          return;
        enterInsertAt({
          line: cursor.line,
          char: firstNonBlankChar(lines[cursor.line] ?? "")
        });
        return;
      case "A":
        if (!cursor || lines.length === 0)
          return;
        enterInsertAt({
          line: cursor.line,
          char: graphemeLength(lines[cursor.line] ?? "")
        });
        return;
      case "o":
      case "O":
        if (!cursor || lines.length === 0)
          return;
        {
          const index = cursor.line + (action2.command === "o" ? 1 : 0);
          const indent = leadingWhitespace(lines[cursor.line] ?? "");
          insertLine(indent, index);
          enterInsertAt({
            line: index,
            char: graphemeLength(indent)
          });
        }
        return;
      case "v":
        enterVisual("character");
        return;
      case "V":
        enterVisual("line");
        return;
      case "x":
      case "X":
        if (!cursor || lines.length === 0)
          return;
        await deleteRange(lines, characterRange(lines, cursor, action2.count, action2.command === "X"), action2.register);
        return;
      case "p":
      case "P":
        await put(action2.register, action2.command === "p", action2.count);
        return;
      case "Y":
        if (!cursor || lines.length === 0)
          return;
        await yankRange(lines, lineRange(lines, cursor.line, action2.count), action2.register);
        return;
      case "J":
        if (!cursor || lines.length === 0)
          return;
        {
          const result = joinLines(lines, cursor.line, action2.count);
          if (!result)
            return;
          updateLine(result.text, cursor.line);
          deleteLines(cursor.line + 1, result.joinedLineCount - 1);
          moveAfterRender({
            line: cursor.line,
            char: result.cursorChar
          });
        }
        return;
      case "m":
        if (!cursor || action2.character === undefined)
          return;
        {
          const pageTitle = getPageTitle();
          if (pageTitle === null)
            return;
          marks.set(action2.character, pageTitle, getPageLineSnapshots(), cursor);
        }
        return;
      case "`":
      case "'":
        if (action2.character === undefined)
          return;
        {
          const pageTitle = getPageTitle();
          if (pageTitle === null)
            return;
          const mark = marks.get(action2.character, pageTitle, getPageLineSnapshots());
          if (!mark)
            return;
          const target = action2.command === "'" ? {
            line: mark.line,
            char: firstNonBlankChar(lines[mark.line] ?? "")
          } : mark;
          moveToPosition(target);
          scheduleRender();
        }
        return;
      case "ctrl-a":
      case "ctrl-x":
        if (!cursor || lines.length === 0)
          return;
        {
          const result = changeNumberAtOrAfter(lines[cursor.line] ?? "", cursor.char, action2.command === "ctrl-a" ? action2.count : -action2.count);
          if (!result)
            return;
          updateLine(result.text, cursor.line);
          moveAfterRender({
            line: cursor.line,
            char: result.cursorChar
          });
        }
        return;
      case "n":
      case "N":
        if (!lastSearch)
          return;
        {
          const target = findSearchTarget(action2.command === "n" ? lastSearch.direction : lastSearch.direction === "forward" ? "backward" : "forward", action2.count);
          if (target) {
            activeSearch = target;
            activatePositionAfterNavigation(target);
          }
        }
        return;
      case "*":
      case "#":
        searchWordAtCursor(action2.command === "*" ? "forward" : "backward", action2.count);
        return;
      case "D":
      case "C":
        if (!cursor || lines.length === 0)
          return;
        {
          const endLine = Math.min(cursor.line + action2.count - 1, lines.length - 1);
          await deleteRange(lines, {
            start: cursor,
            end: {
              line: endLine,
              char: graphemeLength(lines[endLine] ?? "")
            },
            kind: "character"
          }, action2.register);
        }
        if (action2.command === "C")
          setMode("insert");
        return;
      case "s":
        if (!cursor || lines.length === 0)
          return;
        await deleteRange(lines, characterRange(lines, cursor, action2.count), action2.register);
        setMode("insert");
        return;
      case "S":
        if (!cursor || lines.length === 0)
          return;
        await deleteRange(lines, lineRange(lines, cursor.line, action2.count), action2.register);
        setMode("insert");
        return;
      case "r":
        if (!cursor || lines.length === 0 || action2.character === undefined) {
          return;
        }
        {
          const graphemes = splitGraphemes(lines[cursor.line] ?? "");
          const replaceCount = Math.min(action2.count, graphemes.length - cursor.char);
          if (replaceCount <= 0)
            return;
          graphemes.splice(cursor.char, replaceCount, ...Array.from({ length: replaceCount }, () => action2.character));
          updateLine(graphemes.join(""), cursor.line);
          moveAfterRender({
            line: cursor.line,
            char: cursor.char + replaceCount - 1
          });
        }
        return;
      case "~":
        if (!cursor || lines.length === 0)
          return;
        {
          const graphemes = splitGraphemes(lines[cursor.line] ?? "");
          const end = Math.min(cursor.char + action2.count, graphemes.length);
          for (let index = cursor.char;index < end; index += 1) {
            const value = graphemes[index] ?? "";
            graphemes[index] = value === value.toUpperCase() ? value.toLowerCase() : value.toUpperCase();
          }
          updateLine(graphemes.join(""), cursor.line);
          moveAfterRender({
            line: cursor.line,
            char: Math.min(end, graphemes.length - 1)
          });
        }
        return;
      case "u":
        for (let index = 0;index < action2.count; index += 1) {
          sendUndo();
        }
        scheduleRender();
        return;
      case ".":
        if (!lastChange)
          return;
        await executeAction(createRepeatAction(lastChange, action2.count), false);
        return;
      default:
        console.log(`[cosense-vim] command ${action2.command} is not implemented yet`);
    }
  }
  async function executeOperator(action2) {
    const lines = getPageLines();
    const cursor = getCursorPosition();
    if (!cursor || lines.length === 0)
      return;
    let range = null;
    if (action2.target.kind === "line") {
      range = lineRange(lines, cursor.line, action2.count);
    } else if (action2.target.kind === "motion") {
      range = motionRange(action2)?.range ?? null;
    } else if (action2.target.kind === "text-object") {
      range = getTextObjectRange(lines, cursor, action2.target.textObject, action2.count);
    }
    if (!range) {
      console.log("[cosense-vim] no text object found", action2);
      return;
    }
    if (action2.operator === "y") {
      await yankRange(lines, range, action2.register);
      moveAfterRender(cursor);
      return;
    }
    if (action2.operator === ">" || action2.operator === "<") {
      const normalized = normalizeRange(range);
      for (let line = normalized.start.line;line <= normalized.end.line; line += 1) {
        updateLine(shiftIndent(lines[line] ?? "", action2.operator === ">" ? 1 : -1), line);
      }
      moveAfterRender({
        line: normalized.start.line,
        char: firstNonBlankChar(shiftIndent(lines[normalized.start.line] ?? "", action2.operator === ">" ? 1 : -1))
      });
      return;
    }
    if (action2.operator === "g~" || action2.operator === "gu" || action2.operator === "gU") {
      const normalized = normalizeRange(range);
      const changed = changeCaseInRange(lines, normalized, action2.operator === "g~" ? "toggle" : action2.operator === "gu" ? "lower" : "upper");
      for (let line = normalized.start.line;line <= normalized.end.line; line += 1) {
        updateLine(changed[line] ?? "", line);
      }
      moveAfterRender(normalized.start);
      return;
    }
    await deleteRange(lines, range, action2.register);
    if (action2.operator === "c")
      setMode("insert");
  }
  async function executeAction(action2, recordChange = true) {
    if (action2.kind === "motion") {
      const lines = getPageLines();
      const cursor = getCursorPosition();
      if (!cursor || lines.length === 0)
        return;
      const target = getMotionTarget(lines, cursor, action2.motion, action2.count, action2.countSpecified, {
        character: action2.character,
        lastFind,
        preferredColumn
      });
      if (action2.motion === "j" || action2.motion === "k") {
        preferredColumn ??= cursor.char;
      } else {
        preferredColumn = undefined;
      }
      if (action2.character && ["f", "F", "t", "T"].includes(action2.motion)) {
        lastFind = {
          character: action2.character,
          direction: action2.motion === "f" || action2.motion === "t" ? "forward" : "backward",
          till: action2.motion === "t" || action2.motion === "T"
        };
      }
      moveToPosition(target);
      scheduleRender();
      return;
    }
    if (action2.kind === "command") {
      await executeCommand(action2);
      if (recordChange && isRepeatableChange(action2)) {
        lastChange = createRepeatAction(action2, action2.count);
      }
      return;
    }
    await executeOperator(action2);
    if (recordChange && isRepeatableChange(action2)) {
      lastChange = createRepeatAction(action2, action2.count);
    }
  }
  function handleInsertMode(event) {
    const leavesInsert = event.key === "Escape" || event.ctrlKey && event.key === "[";
    if (!leavesInsert)
      return;
    consume(event);
    if ((getCursorPosition()?.char ?? 0) > 0) {
      move("ArrowLeft");
    }
    setMode("normal");
  }
  function handleNormalMode(event) {
    if (event.key === ":" || event.key === "/" || event.key === "?") {
      consume(event);
      openCommandLine(event.key);
      return;
    }
    if (event.key === "Escape") {
      consume(event);
      parserState = createParserState();
      clearSearchHighlight();
      return;
    }
    consume(event);
    const result = parseKey(parserState, event.key);
    parserState = result.state;
    render();
    if (result.status === "action") {
      executeAction(result.action).catch(console.error);
    }
  }
  function leaveVisualMode() {
    const position = currentVisualRange()?.start ?? getSelectionRange()?.start ?? getCursorPosition();
    if (position)
      clearSelection(position);
    setMode("normal");
  }
  async function operateVisual(operator, register) {
    const lines = getPageLines();
    const range = currentVisualRange();
    if (!range || lines.length === 0)
      return;
    if (operator === "y") {
      await yankRange(lines, range, register);
      const start = normalizeRange(range).start;
      clearSelection(start);
      setMode("normal");
      return;
    }
    await deleteRange(lines, range, register);
    visualAnchor = undefined;
    if (operator === "c") {
      mode = "insert";
      parserState = createParserState();
      render();
      focusTextInput();
    } else {
      setMode("normal");
    }
  }
  async function putVisual(register) {
    const lines = getPageLines();
    const range = currentVisualRange();
    if (!range || lines.length === 0)
      return;
    const replacement = await registers.read(register);
    if (!replacement)
      return;
    await registers.recordDelete({
      text: getTextInRange(lines, range),
      kind: range.kind
    });
    const start = normalizeRange(range).start;
    if (range.kind === "line") {
      const count = Math.abs(range.end.line - range.start.line) + 1;
      deleteLines(start.line, count);
      requestAnimationFrame(() => {
        const values = linewiseValues(replacement.text);
        values.forEach((text, offset) => insertLine(text, start.line + offset));
        moveAfterRender({ line: start.line, char: 0 });
      });
    } else {
      deleteTextRange(range.start, range.end);
      requestAnimationFrame(() => {
        const refreshed = getPageLines();
        const result = putCharacterwiseLines(refreshed, start, replacement.text, false);
        updateLine(result.lines[start.line] ?? "", start.line);
        for (let line = start.line + 1;line <= result.cursor.line; line += 1) {
          insertLine(result.lines[line] ?? "", line);
        }
        moveAfterRender(result.cursor);
      });
    }
    setMode("normal");
  }
  function swapVisualEnd() {
    if (!visualAnchor || !visualCursor)
      return;
    const oldAnchor = visualAnchor;
    visualAnchor = visualCursor;
    visualCursor = oldAnchor;
    syncVisualSelection();
    scheduleRender();
  }
  function toggleVisualCase() {
    const lines = getPageLines();
    const range = currentVisualRange();
    if (!range)
      return;
    const normalized = normalizeRange(range);
    const changed = changeCaseInRange(lines, normalized, "toggle");
    for (let line = normalized.start.line;line <= normalized.end.line; line += 1) {
      updateLine(changed[line] ?? "", line);
    }
    clearSelection(normalized.start);
    setMode("normal");
  }
  function shiftVisualIndent(direction) {
    const lines = getPageLines();
    const range = currentVisualRange();
    if (!range)
      return;
    const normalized = normalizeRange(range);
    for (let line = normalized.start.line;line <= normalized.end.line; line += 1) {
      const text = lines[line] ?? "";
      updateLine(shiftIndent(text, direction), line);
    }
    clearSelection(normalized.start);
    setMode("normal");
  }
  function handleVisualMode(event) {
    if (event.key === "Escape") {
      consume(event);
      leaveVisualMode();
      return;
    }
    if (event.key === '"' || parserState.awaitingRegister) {
      consume(event);
      const result2 = parseKey(parserState, event.key);
      parserState = result2.state;
      render();
      return;
    }
    if (visualTextObjectPrefix) {
      consume(event);
      const textObject = `${visualTextObjectPrefix}${event.key}`;
      visualTextObjectPrefix = undefined;
      selectVisualTextObject(textObject);
      return;
    }
    if (event.key === "i" || event.key === "a") {
      consume(event);
      visualTextObjectPrefix = event.key;
      render();
      return;
    }
    if (event.key === "v") {
      consume(event);
      if (visualKind === "character")
        leaveVisualMode();
      else {
        visualKind = "character";
        syncVisualSelection();
        render();
      }
      return;
    }
    if (event.key === "V") {
      consume(event);
      if (visualKind === "line")
        leaveVisualMode();
      else {
        visualKind = "line";
        syncVisualSelection();
        render();
      }
      return;
    }
    if (event.key === "o") {
      consume(event);
      swapVisualEnd();
      return;
    }
    if (event.key === "d" || event.key === "x") {
      consume(event);
      const register = parserState.register;
      parserState = createParserState();
      operateVisual("d", register).catch(console.error);
      return;
    }
    if (event.key === "y") {
      consume(event);
      const register = parserState.register;
      parserState = createParserState();
      operateVisual("y", register).catch(console.error);
      return;
    }
    if (event.key === "c" || event.key === "s") {
      consume(event);
      const register = parserState.register;
      parserState = createParserState();
      operateVisual("c", register).catch(console.error);
      return;
    }
    if (event.key === "p" || event.key === "P") {
      consume(event);
      const register = parserState.register;
      parserState = createParserState();
      putVisual(register).catch(console.error);
      return;
    }
    if (event.key === "~") {
      consume(event);
      toggleVisualCase();
      return;
    }
    if (event.key === "<" || event.key === ">") {
      consume(event);
      shiftVisualIndent(event.key === ">" ? 1 : -1);
      return;
    }
    const result = parseKey(parserState, event.key);
    parserState = result.state;
    render();
    if (result.status === "action" && result.action.kind === "motion") {
      consume(event);
      const lines = getPageLines();
      const cursor = visualCursor;
      if (!cursor || lines.length === 0)
        return;
      const target = getMotionTarget(lines, cursor, result.action.motion, result.action.count, result.action.countSpecified, {
        character: result.action.character,
        lastFind,
        preferredColumn
      });
      if (result.action.motion === "j" || result.action.motion === "k") {
        preferredColumn ??= cursor.char;
      } else {
        preferredColumn = undefined;
      }
      visualCursor = target;
      syncVisualSelection();
      scheduleRender();
      return;
    }
    consume(event);
  }
  function handleKeydown(event) {
    if (!enabled)
      return;
    if (isForwardedEvent(event))
      return;
    if (event.isComposing || event.keyCode === 229)
      return;
    if (event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta") {
      return;
    }
    if (mode === "insert" && event.ctrlKey && event.key === "[") {
      handleInsertMode(event);
      return;
    }
    if (mode === "normal" && event.ctrlKey && event.key.toLowerCase() === "r") {
      consume(event);
      const count = parserState.count ? Number.parseInt(parserState.count, 10) : 1;
      parserState = createParserState();
      for (let index = 0;index < count; index += 1) {
        sendUndo(true);
      }
      render();
      scheduleRender();
      return;
    }
    if (mode === "normal" && event.ctrlKey && !isAnotherEditableElement(event.target) && (event.key.toLowerCase() === "a" || event.key.toLowerCase() === "x")) {
      consume(event);
      const count = parserState.count ? Number.parseInt(parserState.count, 10) : 1;
      parserState = createParserState();
      executeAction({
        kind: "command",
        command: event.key.toLowerCase() === "a" ? "ctrl-a" : "ctrl-x",
        count
      }).catch(console.error);
      render();
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey)
      return;
    if (isAnotherEditableElement(event.target))
      return;
    switch (mode) {
      case "insert":
        handleInsertMode(event);
        break;
      case "normal":
        handleNormalMode(event);
        break;
      case "visual":
        handleVisualMode(event);
        break;
    }
  }
  document.addEventListener("keydown", handleKeydown, { capture: true });
  document.addEventListener("keyup", scheduleRender, { capture: true });
  document.addEventListener("pointerup", schedulePointerRender, {
    capture: true
  });
  document.addEventListener("click", schedulePointerRender, {
    capture: true
  });
  view.commandInput.addEventListener("keydown", handleCommandLineKeydown);
  document.addEventListener("selectionchange", scheduleRender);
  window.addEventListener("resize", scheduleRender);
  window.addEventListener("scroll", scheduleRender, { capture: true });
  const cosenseWindow2 = getCosenseWindow();
  const reconcileMarks = () => {
    const pageTitle = getPageTitle();
    if (pageTitle !== null) {
      marks.reconcile(pageTitle, getPageLineSnapshots());
    }
    scheduleRender();
  };
  cosenseWindow2.cosense?.on?.("lines:changed", reconcileMarks);
  const restorePageEditing = () => {
    if (!enabled)
      return;
    commandLineActive = false;
    view.commandInput.hidden = true;
    view.commandInput.value = "";
    mode = "insert";
    parserState = createParserState();
    preferredColumn = undefined;
    activatePositionAfterNavigation({ line: 0, char: 0 });
  };
  cosenseWindow2.cosense?.on?.("page:changed", restorePageEditing);
  cosenseWindow2.cosense?.on?.("layout:changed", restorePageEditing);
  cosenseWindow2.__cosenseVimToggle = () => setEnabled(!enabled);
  addVimMenu();
  setMode("insert");
  function destroy() {
    document.removeEventListener("keydown", handleKeydown, { capture: true });
    document.removeEventListener("keyup", scheduleRender, {
      capture: true
    });
    document.removeEventListener("pointerup", schedulePointerRender, {
      capture: true
    });
    document.removeEventListener("click", schedulePointerRender, {
      capture: true
    });
    view.commandInput.removeEventListener("keydown", handleCommandLineKeydown);
    document.removeEventListener("selectionchange", scheduleRender);
    window.removeEventListener("resize", scheduleRender);
    window.removeEventListener("scroll", scheduleRender, { capture: true });
    cosenseWindow2.cosense?.removeListener?.("lines:changed", reconcileMarks);
    cosenseWindow2.cosense?.removeListener?.("page:changed", restorePageEditing);
    cosenseWindow2.cosense?.removeListener?.("layout:changed", restorePageEditing);
    delete cosenseWindow2.__cosenseVimToggle;
    view.destroy();
  }
  return { destroy };
}

// scripts/script.ts
var cosenseWindow2 = getCosenseWindow();
cosenseWindow2.__cosenseVimCleanup?.();
var controller = createVimController();
cosenseWindow2.__cosenseVimCleanup = () => {
  controller.destroy();
  delete cosenseWindow2.__cosenseVimCleanup;
};
console.log("[cosense-vim] loaded");
