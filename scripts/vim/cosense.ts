import type {
    CosenseWindow,
    EditingKey,
    KeyModifiers,
    MotionKey,
} from "./types";
import type { Position } from "./text-model";
import { graphemeLength, normalizeRange } from "./text-model";

const cosenseWindow = window as CosenseWindow;
const forwardedEvents = new WeakSet<KeyboardEvent>();

const keyCodeMap: Record<EditingKey, number> = {
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    Home: 36,
    End: 35,
    Backspace: 8,
    Delete: 46,
};

export function getCosenseWindow(): CosenseWindow {
    return cosenseWindow;
}

export function getTextInput(): HTMLTextAreaElement | null {
    return document.querySelector<HTMLTextAreaElement>("#text-input");
}

export function focusTextInput(): void {
    getTextInput()?.focus({ preventScroll: true });
}

export function activatePagePosition(target: Position): boolean {
    const textInput = getTextInput();
    if (!textInput) return false;

    textInput.focus({ preventScroll: true });

    const pageHasFocus =
        cosenseWindow.cosense?.Page?.cursor?.hasFocus === true &&
        document.activeElement === textInput;

    if (!getCursorPosition() || !pageHasFocus) {
        clickPagePosition(target);
    }

    if (
        !getCursorPosition() ||
        cosenseWindow.cosense?.Page?.cursor?.hasFocus !== true
    ) {
        return false;
    }
    moveToPosition(target);
    textInput.focus({ preventScroll: true });
    return document.activeElement === textInput;
}

export function getCursorPosition(): {
    line: number;
    char: number;
} | null {
    const cursor = cosenseWindow.scrapbox?.Page?.cursor;
    if (
        typeof cursor?.line !== "number" ||
        typeof cursor.char !== "number"
    ) {
        return null;
    }

    return {
        line: cursor.line,
        char: cursor.char,
    };
}

export function getPageLines(): string[] {
    return (
        cosenseWindow.cosense?.Page?.lines?.map((line) => line.text ?? "") ?? []
    );
}

export type PageLineSnapshot = {
    id: string;
    text: string;
};

export function getPageLineSnapshots(): PageLineSnapshot[] {
    return (
        cosenseWindow.cosense?.Page?.lines?.map((line, index) => ({
            id: line.id ?? `line:${index}`,
            text: line.text ?? "",
        })) ?? []
    );
}

export function getPageTitle(): string | null {
    return cosenseWindow.cosense?.Page?.title ?? null;
}

export async function waitForSave(): Promise<void> {
    await cosenseWindow.cosense?.Page?.waitForSave();
}

export async function showPage(title: string): Promise<void> {
    const show = cosenseWindow.cosense?.Page?.show;
    if (!show) throw new Error("cosense.Page.show is unavailable");
    await show(title);
}

export function goProjectHome(): void {
    const projectName = cosenseWindow.cosense?.Project?.name;
    if (!projectName) return;
    location.assign(`/${encodeURIComponent(projectName)}/`);
}

export function goBackOrHome(): void {
    if (history.length > 1) {
        history.back();
        return;
    }
    goProjectHome();
}

export function getSelectionRange(): {
    start: Position;
    end: Position;
} | null {
    const selection = cosenseWindow.cosense?.Page?.selection;
    if (!selection) return null;
    return {
        start: { ...selection.start },
        end: { ...selection.end },
    };
}

export function isForwardedEvent(event: KeyboardEvent): boolean {
    return forwardedEvents.has(event);
}

export function isAnotherEditableElement(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.id === "text-input") return false;

    return (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
    );
}

export function sendKey(
    key: EditingKey,
    selecting = false,
    modifiers: KeyModifiers = {},
): void {
    const textInput = getTextInput();
    if (!textInput) return;

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
        composed: true,
    });

    // Cosenseのキー判定はkeyCodeを参照するため，生成イベントにも明示する．
    Object.defineProperties(event, {
        keyCode: { value: keyCode },
        which: { value: keyCode },
    });

    forwardedEvents.add(event);
    textInput.dispatchEvent(event);
}

export function sendUndo(redo = false): void {
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
        composed: true,
    });
    Object.defineProperties(event, {
        keyCode: { value: keyCode },
        which: { value: keyCode },
    });
    forwardedEvents.add(event);
    getTextInput()?.dispatchEvent(event);
}

export function sendMotion(key: MotionKey, selecting = false): void {
    sendKey(key, selecting);
}

function clickPagePosition(target: Position): boolean {
    const textInput = getTextInput();
    const line = document.querySelectorAll<HTMLElement>(".editor .line")[
        target.line
    ];
    if (!textInput || !line) return false;

    const character = line.querySelector<HTMLElement>(
        `[data-char-index="${target.char}"]`,
    );
    const characters = line.querySelectorAll<HTMLElement>("[data-char-index]");
    const lastCharacter = characters[characters.length - 1];
    const targetElement = character ?? lastCharacter ?? line;
    const rect = targetElement.getBoundingClientRect();
    const clientX = character
        ? rect.left
        : lastCharacter
          ? rect.right + 1
          : rect.left + 1;
    const clientY = rect.top + Math.max(rect.height / 2, 1);

    for (const type of ["mousedown", "mouseup", "click"] as const) {
        targetElement.dispatchEvent(
            new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                composed: true,
                button: 0,
                clientX,
                clientY,
            }),
        );
    }

    textInput.focus({ preventScroll: true });
    return document.activeElement === textInput;
}

export function moveToPosition(
    target: Position,
    options: { selecting?: boolean } = {},
): void {
    let current = getCursorPosition();
    if (!current) return;

    const selecting = options.selecting ?? false;

    if (!selecting && current.line !== target.line) {
        moveVerticallyToLine(target.line);
        current = getCursorPosition() ?? current;
    }

    if (current.line === target.line) {
        const key =
            current.char <= target.char ? "ArrowRight" : "ArrowLeft";
        const distance = Math.abs(target.char - current.char);
        for (let index = 0; index < distance; index += 1) {
            sendMotion(key, selecting);
        }
        return;
    }

    const verticalDistance = Math.abs(target.line - current.line);

    if (current.line < target.line) {
        for (let index = 0; index < verticalDistance; index += 1) {
            // Endから右へ進むと，表示上の折り返しに影響されず次の論理行へ移る．
            sendMotion("End", selecting);
            sendMotion("ArrowRight", selecting);
        }
    } else {
        for (let index = 0; index < verticalDistance; index += 1) {
            // Homeから左へ進んで前の論理行へ戻り，その行の先頭へ移る．
            sendMotion("Home", selecting);
            sendMotion("ArrowLeft", selecting);
            sendMotion("Home", selecting);
        }
    }

    sendMotion("Home", selecting);
    for (let index = 0; index < target.char; index += 1) {
        sendMotion("ArrowRight", selecting);
    }
}

function moveVerticallyToLine(targetLine: number): void {
    let current = getCursorPosition();
    if (!current || current.line === targetLine) return;

    const key = current.line < targetLine ? "ArrowDown" : "ArrowUp";
    const maxAttempts = Math.abs(targetLine - current.line) * 20 + 20;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        sendMotion(key);
        current = getCursorPosition();
        if (!current || current.line === targetLine) return;

        if (
            (key === "ArrowDown" && current.line > targetLine) ||
            (key === "ArrowUp" && current.line < targetLine)
        ) {
            return;
        }
    }
}

export function updateLine(text: string, index: number): void {
    cosenseWindow.cosense?.Page?.updateLine(text, index);
}

export function insertLine(text: string, index: number): void {
    cosenseWindow.cosense?.Page?.insertLine(text, index);
}

export function deleteLines(startLine: number, count: number): void {
    const lines = getPageLines();
    if (lines.length === 0 || count < 1) return;

    const start = Math.min(Math.max(startLine, 0), lines.length - 1);
    const endExclusive = Math.min(start + count, lines.length);

    moveToPosition({ line: start, char: 0 });

    if (endExclusive < lines.length) {
        moveToPosition(
            { line: endExclusive, char: 0 },
            { selecting: true },
        );
        sendKey("Delete");
        return;
    }

    const lastLine = lines.length - 1;
    moveToPosition(
        {
            line: lastLine,
            char: graphemeLength(lines[lastLine] ?? ""),
        },
        { selecting: true },
    );
    sendKey("Delete");
    if (start > 0) sendKey("Backspace");
}

export function deleteTextRange(start: Position, end: Position): void {
    const range = normalizeRange({
        start,
        end,
        kind: "character",
    });
    moveToPosition(range.start);
    moveToPosition(range.end, { selecting: true });
    sendKey("Delete");
}

export function selectRange(start: Position, end: Position): void {
    moveToPosition(start);
    moveToPosition(end, { selecting: true });
}

export function clearSelection(position: Position): void {
    if (getSelectionRange()) {
        // Cosenseでは非Shiftの左移動で選択範囲の先頭へcollapseする．
        // collapse前のcursor位置を使って移動量を計算すると行を跨いでずれるため，
        // 先に選択を確実に解除してから目的位置へ移動する．
        sendMotion("ArrowLeft");
    }
    moveToPosition(position);
}

export function getCursorRect(): DOMRect | null {
    const char = getCursorPosition()?.char;

    if (typeof char === "number") {
        const cursorLine = document.querySelector<HTMLElement>(".line.cursor-line");
        const character = cursorLine?.querySelector<HTMLElement>(
            `[data-char-index="${char}"]`,
        );

        if (character) {
            return character.getBoundingClientRect();
        }

        const characters = cursorLine?.querySelectorAll<HTMLElement>(
            "[data-char-index]",
        );
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

export function addVimMenu(): void {
    cosenseWindow.cosense?.PageMenu?.addMenu({
        title: "Vim mode",
        icon: "fas fa-keyboard",
        onClick: () => cosenseWindow.__cosenseVimToggle?.(),
    });
}
