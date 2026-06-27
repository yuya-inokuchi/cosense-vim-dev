import {
    activatePagePosition,
    addVimMenu,
    deleteLines,
    deleteTextRange,
    clearSelection,
    focusTextInput,
    getCosenseWindow,
    getCursorPosition,
    getCursorRect,
    getPageLineSnapshots,
    getPageLines,
    getPageTitle,
    getSelectionRange,
    insertLine,
    isAnotherEditableElement,
    isForwardedEvent,
    moveToPosition,
    goBackOrHome,
    goProjectHome,
    selectRange,
    sendMotion,
    sendUndo,
    showPage,
    updateLine,
    waitForSave,
} from "./cosense";
import {
    characterRange,
    changeCaseInRange,
    changeNumberAtOrAfter,
    deleteCharacterRange,
    effectiveOperatorMotion,
    firstNonBlankChar,
    joinLines,
    leadingWhitespace,
    lineRange,
    linewiseValues,
    putCharacterwise,
    putCharacterwiseLines,
    rangeForMotion,
    shiftIndent,
    visualRange,
} from "./editing";
import {
    getMotionTarget,
    type FindMotion,
} from "./motions";
import {
    createParserState,
    parseKey,
    type ParsedAction,
    type ParserState,
    type VimTextObject,
} from "./parser";
import { RegisterStore } from "./registers";
import { MarkStore } from "./marks";
import {
    findAllSearchMatches,
    findSearchMatch,
    searchWordUnderCursor,
    substituteText,
    type SearchDirection,
} from "./search";
import { parseExCommand, type ExCommand } from "./ex";
import {
    createRepeatAction,
    isRepeatableChange,
    type RepeatableChange,
} from "./repeat";
import {
    getTextInRange,
    graphemeLength,
    normalizeRange,
    positionBefore,
    splitGraphemes,
    type TextRange,
} from "./text-model";
import { getTextObjectRange } from "./text-objects";
import type { MotionKey, VimMode } from "./types";
import { createVimView, type SearchHighlight } from "./view";

const enabledStorageKey = "cosense-vim-enabled";

export type VimController = {
    destroy(): void;
};

export function createVimController(): VimController {
    const view = createVimView();
    const registers = new RegisterStore();
    const marks = new MarkStore();

    let mode: VimMode = "insert";
    let parserState: ParserState = createParserState();
    let enabled = localStorage.getItem(enabledStorageKey) !== "false";
    let lastFind: FindMotion | undefined;
    let preferredColumn: number | undefined;
    let visualAnchor: { line: number; char: number } | undefined;
    let visualCursor: { line: number; char: number } | undefined;
    let visualKind: "character" | "line" = "character";
    let visualTextObjectPrefix: "i" | "a" | undefined;
    let lastChange: RepeatableChange | undefined;
    let commandLineActive = false;
    let commandLinePrefix: ":" | "/" | "?" = ":";
    let lastSearch:
        | { query: string; direction: SearchDirection }
        | undefined;
    let activeSearch: { line: number; char: number } | undefined;

    function render(): void {
        view.render({
            enabled,
            mode,
            pendingKeys: `${parserState.keys}${visualTextObjectPrefix ?? ""}`,
            cursorRect: commandLineActive ? null : getCursorRect(),
            searchHighlights: currentSearchHighlights(),
        });
    }

    function currentSearchHighlights(): SearchHighlight[] {
        if (!lastSearch) return [];

        const snapshots = getPageLineSnapshots();
        return findAllSearchMatches(getPageLines(), lastSearch.query).map(
            (match) => ({
                ...match,
                lineId: snapshots[match.line]?.id,
                active:
                    activeSearch?.line === match.line &&
                    activeSearch.char === match.char,
            }),
        );
    }

    function clearSearchHighlight(): void {
        lastSearch = undefined;
        activeSearch = undefined;
        render();
    }

    function openCommandLine(prefix: ":" | "/" | "?"): void {
        commandLineActive = true;
        commandLinePrefix = prefix;
        parserState = createParserState();
        view.commandInput.hidden = false;
        view.commandInput.value = prefix;
        render();
        view.commandInput.focus({ preventScroll: true });
        view.commandInput.setSelectionRange(1, 1);
    }

    function closeCommandLine(): void {
        commandLineActive = false;
        view.commandInput.hidden = true;
        view.commandInput.value = "";
        render();
        focusTextInput();
    }

    async function executeExCommand(command: ExCommand): Promise<void> {
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
                if (lines.length === 0 || !cursor) return;

                const startLine =
                    command.range === "all" ? 0 : cursor.line;
                const endLine =
                    command.range === "all"
                        ? lines.length - 1
                        : cursor.line;
                const result = substituteText(lines, {
                    startLine,
                    endLine,
                    pattern: command.pattern,
                    replacement: command.replacement,
                    global: command.flags.global,
                });
                if (result.count === 0) {
                    throw new Error(
                        `E486: Pattern not found: ${command.pattern}`,
                    );
                }

                for (let line = startLine; line <= endLine; line += 1) {
                    if (result.lines[line] !== lines[line]) {
                        updateLine(result.lines[line] ?? "", line);
                    }
                }
                lastSearch = {
                    query: command.pattern,
                    direction: "forward",
                };
                activeSearch = result.firstMatch ?? undefined;
                if (result.firstMatch) moveAfterRender(result.firstMatch);
                scheduleRender();
                return;
            }
        }
    }

    function findSearchTarget(
        direction: SearchDirection,
        count = 1,
    ): { line: number; char: number } | null {
        if (!lastSearch) return null;
        const lines = getPageLines();
        const cursor = getCursorPosition();
        if (!cursor) return null;
        return findSearchMatch(
            lines,
            cursor,
            lastSearch.query,
            direction,
            count,
        );
    }

    function searchWordAtCursor(
        direction: SearchDirection,
        count: number,
    ): void {
        const lines = getPageLines();
        const cursor = getCursorPosition();
        if (!cursor || lines.length === 0) return;

        const query = searchWordUnderCursor(lines, cursor);
        if (!query) return;

        lastSearch = { query, direction };
        const target = findSearchTarget(direction, count);
        if (!target) return;

        activeSearch = target;
        activatePositionAfterNavigation(target);
    }

    function handleCommandLineKeydown(event: KeyboardEvent): void {
        if (!commandLineActive) return;

        if (event.key === "Escape") {
            consume(event);
            closeCommandLine();
            return;
        }
        if (
            event.key === "Backspace" &&
            view.commandInput.selectionStart === 1 &&
            view.commandInput.selectionEnd === 1
        ) {
            consume(event);
            closeCommandLine();
            return;
        }
        if (event.key !== "Enter") return;

        consume(event);
        if (commandLinePrefix === "/" || commandLinePrefix === "?") {
            const query = view.commandInput.value.slice(1);
            if (query === "") {
                closeCommandLine();
                return;
            }
            const direction =
                commandLinePrefix === "/" ? "forward" : "backward";
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

        void executeExCommand(result.command)
            .then(closeCommandLine)
            .catch((error: unknown) => {
                view.commandInput.value =
                    error instanceof Error ? error.message : String(error);
                view.commandInput.select();
            });
    }

    function scheduleRender(): void {
        view.scheduleCursorRender(render);
    }

    function schedulePointerRender(): void {
        scheduleRender();
        window.setTimeout(scheduleRender, 50);
        window.setTimeout(scheduleRender, 150);
    }

    function setMode(nextMode: VimMode): void {
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

    function setEnabled(nextEnabled: boolean): void {
        enabled = nextEnabled;
        localStorage.setItem(enabledStorageKey, String(enabled));
        setMode("insert");
        console.log(`[cosense-vim] ${enabled ? "enabled" : "disabled"}`);
    }

    function consume(event: KeyboardEvent): void {
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function move(key: MotionKey, selecting = false): void {
        sendMotion(key, selecting);
        scheduleRender();
    }

    function moveAfterRender(position: { line: number; char: number }): void {
        requestAnimationFrame(() => {
            moveToPosition(position);
            scheduleRender();
        });
    }

    function activatePositionAfterNavigation(
        position: { line: number; char: number },
    ): void {
        let attempts = 0;
        const retry = () => {
            attempts += 1;
            if (activatePagePosition(position)) {
                render();
                return;
            }
            if (attempts < 30) window.setTimeout(retry, 50);
        };
        requestAnimationFrame(retry);
    }

    function enterInsertAt(position: { line: number; char: number }): void {
        mode = "insert";
        parserState = createParserState();
        preferredColumn = undefined;
        requestAnimationFrame(() => {
            moveToPosition(position);
            render();
            focusTextInput();
        });
    }

    function enterVisual(kind: "character" | "line"): void {
        const cursor = getCursorPosition();
        const lines = getPageLines();
        if (!cursor || lines.length === 0) return;

        mode = "visual";
        visualKind = kind;
        visualAnchor = cursor;
        visualCursor = cursor;
        parserState = createParserState();
        preferredColumn = undefined;

        syncVisualSelection();
        render();
    }

    function currentVisualRange(): TextRange | null {
        const lines = getPageLines();
        if (!visualAnchor || !visualCursor || lines.length === 0) return null;
        return visualRange(lines, visualAnchor, visualCursor, visualKind);
    }

    function lineStartAfter(
        lines: readonly string[],
        line: number,
    ): { line: number; char: number } {
        return line + 1 < lines.length
            ? { line: line + 1, char: 0 }
            : {
                  line,
                  char: graphemeLength(lines[line] ?? ""),
              };
    }

    function syncVisualSelection(): void {
        const lines = getPageLines();
        if (!visualAnchor || !visualCursor || lines.length === 0) return;

        // Cosenseの選択同期後は実cursorが選択端へ移るため，
        // 毎回Vim側の論理cursor位置へ戻してから選択を作り直す．
        clearSelection(visualCursor);

        const forward =
            visualCursor.line > visualAnchor.line ||
            (visualCursor.line === visualAnchor.line &&
                visualCursor.char >= visualAnchor.char);

        if (visualKind === "line") {
            if (forward) {
                selectRange(
                    { line: visualAnchor.line, char: 0 },
                    lineStartAfter(lines, visualCursor.line),
                );
            } else {
                selectRange(
                    lineStartAfter(lines, visualAnchor.line),
                    { line: visualCursor.line, char: 0 },
                );
            }
            return;
        }

        if (forward) {
            selectRange(visualAnchor, {
                line: visualCursor.line,
                char: Math.min(
                    visualCursor.char + 1,
                    graphemeLength(lines[visualCursor.line] ?? ""),
                ),
            });
        } else {
            selectRange(
                {
                    line: visualAnchor.line,
                    char: Math.min(
                        visualAnchor.char + 1,
                        graphemeLength(lines[visualAnchor.line] ?? ""),
                    ),
                },
                visualCursor,
            );
        }
    }

    function selectVisualTextObject(textObject: VimTextObject): void {
        const lines = getPageLines();
        const cursor = visualCursor;
        if (!cursor || lines.length === 0) return;

        const range = getTextObjectRange(lines, cursor, textObject);
        if (!range) return;
        const normalized = normalizeRange(range);
        visualKind = normalized.kind;
        visualAnchor = normalized.start;
        visualCursor =
            normalized.kind === "line"
                ? { line: normalized.end.line, char: 0 }
                : positionBefore(lines, normalized.end);
        syncVisualSelection();
        render();
    }

    function motionRange(action: Extract<ParsedAction, { kind: "operator" }>): {
        lines: string[];
        range: TextRange;
    } | null {
        if (action.target.kind !== "motion") return null;

        const lines = getPageLines();
        const cursor = getCursorPosition();
        if (!cursor || lines.length === 0) return null;

        const current =
            splitGraphemes(lines[cursor.line] ?? "")[cursor.char] ?? "";
        const effectiveMotion = effectiveOperatorMotion(
            action.operator,
            action.target.motion,
            current,
        );

        const target = getMotionTarget(
            lines,
            cursor,
            effectiveMotion,
            action.count,
            true,
            {
                character: action.target.character,
                lastFind,
                preferredColumn,
            },
        );

        return {
            lines,
            range: rangeForMotion(
                lines,
                cursor,
                target,
                effectiveMotion,
            ),
        };
    }

    async function yankRange(
        lines: string[],
        range: TextRange,
        register?: string,
    ): Promise<void> {
        await registers.recordYank(
            {
                text: getTextInRange(lines, range),
                kind: range.kind,
            },
            register,
        );
    }

    async function deleteRange(
        lines: string[],
        range: TextRange,
        register?: string,
    ): Promise<void> {
        const result = deleteCharacterRange(lines, range);
        if (result.deletedText === "") return;
        await registers.recordDelete(
            {
                text: result.deletedText,
                kind: range.kind,
            },
            {
                register,
                forceNumbered: range.kind === "line",
            },
        );

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

    async function put(register: string | undefined, after: boolean, count: number): Promise<void> {
        const value = await registers.read(register);
        const lines = getPageLines();
        const cursor = getCursorPosition();
        if (!value || !cursor || lines.length === 0) return;

        if (value.kind === "line") {
            const values = linewiseValues(value.text);
            const index = cursor.line + (after ? 1 : 0);
            let offset = 0;
            for (let repetition = 0; repetition < count; repetition += 1) {
                for (const text of values) {
                    insertLine(text, index + offset);
                    offset += 1;
                }
            }
            moveAfterRender({ line: index, char: 0 });
            return;
        }

        const repeated = value.text.repeat(count);
        if (repeated.includes("\n")) {
            const result = putCharacterwiseLines(
                lines,
                cursor,
                repeated,
                after,
            );
            updateLine(result.lines[cursor.line] ?? "", cursor.line);
            for (
                let line = cursor.line + 1;
                line <= result.cursor.line;
                line += 1
            ) {
                insertLine(result.lines[line] ?? "", line);
            }
            moveAfterRender(result.cursor);
            return;
        }

        const result = putCharacterwise(
            lines[cursor.line] ?? "",
            cursor.char,
            repeated,
            after,
        );
        updateLine(result.text, cursor.line);
        moveAfterRender({ line: cursor.line, char: result.cursorChar });
    }

    async function executeCommand(
        action: Extract<ParsedAction, { kind: "command" }>,
    ): Promise<void> {
        const lines = getPageLines();
        const cursor = getCursorPosition();

        switch (action.command) {
            case "i":
                setMode("insert");
                return;
            case "a":
                if (!cursor || lines.length === 0) return;
                enterInsertAt({
                    line: cursor.line,
                    char: Math.min(
                        cursor.char + 1,
                        graphemeLength(lines[cursor.line] ?? ""),
                    ),
                });
                return;
            case "I":
                if (!cursor || lines.length === 0) return;
                enterInsertAt({
                    line: cursor.line,
                    char: firstNonBlankChar(lines[cursor.line] ?? ""),
                });
                return;
            case "A":
                if (!cursor || lines.length === 0) return;
                enterInsertAt({
                    line: cursor.line,
                    char: graphemeLength(lines[cursor.line] ?? ""),
                });
                return;
            case "o":
            case "O":
                if (!cursor || lines.length === 0) return;
                {
                    const index =
                        cursor.line + (action.command === "o" ? 1 : 0);
                    const indent = leadingWhitespace(lines[cursor.line] ?? "");
                    insertLine(indent, index);
                    enterInsertAt({
                        line: index,
                        char: graphemeLength(indent),
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
                if (!cursor || lines.length === 0) return;
                await deleteRange(
                    lines,
                    characterRange(
                        lines,
                        cursor,
                        action.count,
                        action.command === "X",
                    ),
                    action.register,
                );
                return;
            case "p":
            case "P":
                await put(
                    action.register,
                    action.command === "p",
                    action.count,
                );
                return;
            case "Y":
                if (!cursor || lines.length === 0) return;
                await yankRange(
                    lines,
                    lineRange(lines, cursor.line, action.count),
                    action.register,
                );
                return;
            case "J":
                if (!cursor || lines.length === 0) return;
                {
                    const result = joinLines(
                        lines,
                        cursor.line,
                        action.count,
                    );
                    if (!result) return;
                    updateLine(result.text, cursor.line);
                    deleteLines(
                        cursor.line + 1,
                        result.joinedLineCount - 1,
                    );
                    moveAfterRender({
                        line: cursor.line,
                        char: result.cursorChar,
                    });
                }
                return;
            case "m":
                if (!cursor || action.character === undefined) return;
                {
                    const pageTitle = getPageTitle();
                    if (pageTitle === null) return;
                    marks.set(
                        action.character,
                        pageTitle,
                        getPageLineSnapshots(),
                        cursor,
                    );
                }
                return;
            case "`":
            case "'":
                if (action.character === undefined) return;
                {
                    const pageTitle = getPageTitle();
                    if (pageTitle === null) return;
                    const mark = marks.get(
                        action.character,
                        pageTitle,
                        getPageLineSnapshots(),
                    );
                    if (!mark) return;
                    const target =
                        action.command === "'"
                            ? {
                                  line: mark.line,
                                  char: firstNonBlankChar(
                                      lines[mark.line] ?? "",
                                  ),
                              }
                            : mark;
                    moveToPosition(target);
                    scheduleRender();
                }
                return;
            case "ctrl-a":
            case "ctrl-x":
                if (!cursor || lines.length === 0) return;
                {
                    const result = changeNumberAtOrAfter(
                        lines[cursor.line] ?? "",
                        cursor.char,
                        action.command === "ctrl-a"
                            ? action.count
                            : -action.count,
                    );
                    if (!result) return;
                    updateLine(result.text, cursor.line);
                    moveAfterRender({
                        line: cursor.line,
                        char: result.cursorChar,
                    });
                }
                return;
            case "n":
            case "N":
                if (!lastSearch) return;
                {
                    const target = findSearchTarget(
                        action.command === "n"
                            ? lastSearch.direction
                            : lastSearch.direction === "forward"
                              ? "backward"
                              : "forward",
                        action.count,
                    );
                    if (target) {
                        activeSearch = target;
                        activatePositionAfterNavigation(target);
                    }
                }
                return;
            case "*":
            case "#":
                searchWordAtCursor(
                    action.command === "*" ? "forward" : "backward",
                    action.count,
                );
                return;
            case "D":
            case "C":
                if (!cursor || lines.length === 0) return;
                {
                    const endLine = Math.min(
                        cursor.line + action.count - 1,
                        lines.length - 1,
                    );
                await deleteRange(
                    lines,
                    {
                        start: cursor,
                        end: {
                            line: endLine,
                            char: graphemeLength(lines[endLine] ?? ""),
                        },
                        kind: "character",
                    },
                    action.register,
                );
                }
                if (action.command === "C") setMode("insert");
                return;
            case "s":
                if (!cursor || lines.length === 0) return;
                await deleteRange(
                    lines,
                    characterRange(lines, cursor, action.count),
                    action.register,
                );
                setMode("insert");
                return;
            case "S":
                if (!cursor || lines.length === 0) return;
                await deleteRange(
                    lines,
                    lineRange(lines, cursor.line, action.count),
                    action.register,
                );
                setMode("insert");
                return;
            case "r":
                if (
                    !cursor ||
                    lines.length === 0 ||
                    action.character === undefined
                ) {
                    return;
                }
                {
                    const graphemes = splitGraphemes(lines[cursor.line] ?? "");
                    const replaceCount = Math.min(
                        action.count,
                        graphemes.length - cursor.char,
                    );
                    if (replaceCount <= 0) return;
                    graphemes.splice(
                        cursor.char,
                        replaceCount,
                        ...Array.from(
                            { length: replaceCount },
                            () => action.character!,
                        ),
                    );
                    updateLine(graphemes.join(""), cursor.line);
                    moveAfterRender({
                        line: cursor.line,
                        char: cursor.char + replaceCount - 1,
                    });
                }
                return;
            case "~":
                if (!cursor || lines.length === 0) return;
                {
                    const graphemes = splitGraphemes(lines[cursor.line] ?? "");
                    const end = Math.min(
                        cursor.char + action.count,
                        graphemes.length,
                    );
                    for (let index = cursor.char; index < end; index += 1) {
                        const value = graphemes[index] ?? "";
                        graphemes[index] =
                            value === value.toUpperCase()
                                ? value.toLowerCase()
                                : value.toUpperCase();
                    }
                    updateLine(graphemes.join(""), cursor.line);
                    moveAfterRender({
                        line: cursor.line,
                        char: Math.min(end, graphemes.length - 1),
                    });
                }
                return;
            case "u":
                for (let index = 0; index < action.count; index += 1) {
                    sendUndo();
                }
                scheduleRender();
                return;
            case ".":
                if (!lastChange) return;
                await executeAction(createRepeatAction(lastChange, action.count), false);
                return;
            default:
                console.log(
                    `[cosense-vim] command ${action.command} is not implemented yet`,
                );
        }
    }

    async function executeOperator(
        action: Extract<ParsedAction, { kind: "operator" }>,
    ): Promise<void> {
        const lines = getPageLines();
        const cursor = getCursorPosition();
        if (!cursor || lines.length === 0) return;

        let range: TextRange | null = null;
        if (action.target.kind === "line") {
            range = lineRange(lines, cursor.line, action.count);
        } else if (action.target.kind === "motion") {
            range = motionRange(action)?.range ?? null;
        } else if (action.target.kind === "text-object") {
            range = getTextObjectRange(
                lines,
                cursor,
                action.target.textObject,
                action.count,
            );
        }

        if (!range) {
            console.log("[cosense-vim] no text object found", action);
            return;
        }

        if (action.operator === "y") {
            await yankRange(lines, range, action.register);
            moveAfterRender(cursor);
            return;
        }

        if (action.operator === ">" || action.operator === "<") {
            const normalized = normalizeRange(range);
            for (
                let line = normalized.start.line;
                line <= normalized.end.line;
                line += 1
            ) {
                updateLine(
                    shiftIndent(
                        lines[line] ?? "",
                        action.operator === ">" ? 1 : -1,
                    ),
                    line,
                );
            }
            moveAfterRender({
                line: normalized.start.line,
                char: firstNonBlankChar(
                    shiftIndent(
                        lines[normalized.start.line] ?? "",
                        action.operator === ">" ? 1 : -1,
                    ),
                ),
            });
            return;
        }

        if (
            action.operator === "g~" ||
            action.operator === "gu" ||
            action.operator === "gU"
        ) {
            const normalized = normalizeRange(range);
            const changed = changeCaseInRange(
                lines,
                normalized,
                action.operator === "g~"
                    ? "toggle"
                    : action.operator === "gu"
                      ? "lower"
                      : "upper",
            );
            for (
                let line = normalized.start.line;
                line <= normalized.end.line;
                line += 1
            ) {
                updateLine(changed[line] ?? "", line);
            }
            moveAfterRender(normalized.start);
            return;
        }

        await deleteRange(lines, range, action.register);
        if (action.operator === "c") setMode("insert");
    }

    async function executeAction(
        action: ParsedAction,
        recordChange = true,
    ): Promise<void> {
        if (action.kind === "motion") {
            const lines = getPageLines();
            const cursor = getCursorPosition();
            if (!cursor || lines.length === 0) return;

            const target = getMotionTarget(
                lines,
                cursor,
                action.motion,
                action.count,
                action.countSpecified,
                {
                    character: action.character,
                    lastFind,
                    preferredColumn,
                },
            );
            if (action.motion === "j" || action.motion === "k") {
                preferredColumn ??= cursor.char;
            } else {
                preferredColumn = undefined;
            }
            if (
                action.character &&
                ["f", "F", "t", "T"].includes(action.motion)
            ) {
                lastFind = {
                    character: action.character,
                    direction:
                        action.motion === "f" || action.motion === "t"
                            ? "forward"
                            : "backward",
                    till: action.motion === "t" || action.motion === "T",
                };
            }
            moveToPosition(target);
            scheduleRender();
            return;
        }

        if (action.kind === "command") {
            await executeCommand(action);
            if (recordChange && isRepeatableChange(action)) {
                lastChange = createRepeatAction(action, action.count);
            }
            return;
        }

        await executeOperator(action);
        if (recordChange && isRepeatableChange(action)) {
            lastChange = createRepeatAction(action, action.count);
        }
    }

    function handleInsertMode(event: KeyboardEvent): void {
        const leavesInsert =
            event.key === "Escape" || (event.ctrlKey && event.key === "[");
        if (!leavesInsert) return;

        consume(event);
        if ((getCursorPosition()?.char ?? 0) > 0) {
            move("ArrowLeft");
        }
        setMode("normal");
    }

    function handleNormalMode(event: KeyboardEvent): void {
        if (
            event.key === ":" ||
            event.key === "/" ||
            event.key === "?"
        ) {
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
            void executeAction(result.action).catch(console.error);
        }
    }

    function leaveVisualMode(): void {
        const position =
            currentVisualRange()?.start ??
            getSelectionRange()?.start ??
            getCursorPosition();
        if (position) clearSelection(position);
        setMode("normal");
    }

    async function operateVisual(
        operator: "d" | "y" | "c",
        register?: string,
    ): Promise<void> {
        const lines = getPageLines();
        const range = currentVisualRange();
        if (!range || lines.length === 0) return;

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

    async function putVisual(register?: string): Promise<void> {
        const lines = getPageLines();
        const range = currentVisualRange();
        if (!range || lines.length === 0) return;

        const replacement = await registers.read(register);
        if (!replacement) return;

        await registers.recordDelete({
            text: getTextInRange(lines, range),
            kind: range.kind,
        });
        const start = normalizeRange(range).start;
        if (range.kind === "line") {
            const count = Math.abs(range.end.line - range.start.line) + 1;
            deleteLines(start.line, count);
            requestAnimationFrame(() => {
                const values = linewiseValues(replacement.text);
                values.forEach((text, offset) =>
                    insertLine(text, start.line + offset),
                );
                moveAfterRender({ line: start.line, char: 0 });
            });
        } else {
            deleteTextRange(range.start, range.end);
            requestAnimationFrame(() => {
                const refreshed = getPageLines();
                const result = putCharacterwiseLines(
                    refreshed,
                    start,
                    replacement.text,
                    false,
                );
                updateLine(result.lines[start.line] ?? "", start.line);
                for (
                    let line = start.line + 1;
                    line <= result.cursor.line;
                    line += 1
                ) {
                    insertLine(result.lines[line] ?? "", line);
                }
                moveAfterRender(result.cursor);
            });
        }
        setMode("normal");
    }

    function swapVisualEnd(): void {
        if (!visualAnchor || !visualCursor) return;

        const oldAnchor = visualAnchor;
        visualAnchor = visualCursor;
        visualCursor = oldAnchor;
        syncVisualSelection();
        scheduleRender();
    }

    function toggleVisualCase(): void {
        const lines = getPageLines();
        const range = currentVisualRange();
        if (!range) return;
        const normalized = normalizeRange(range);
        const changed = changeCaseInRange(lines, normalized, "toggle");
        for (
            let line = normalized.start.line;
            line <= normalized.end.line;
            line += 1
        ) {
            updateLine(changed[line] ?? "", line);
        }
        clearSelection(normalized.start);
        setMode("normal");
    }

    function shiftVisualIndent(direction: 1 | -1): void {
        const lines = getPageLines();
        const range = currentVisualRange();
        if (!range) return;
        const normalized = normalizeRange(range);

        for (
            let line = normalized.start.line;
            line <= normalized.end.line;
            line += 1
        ) {
            const text = lines[line] ?? "";
            updateLine(shiftIndent(text, direction), line);
        }

        clearSelection(normalized.start);
        setMode("normal");
    }

    function handleVisualMode(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            consume(event);
            leaveVisualMode();
            return;
        }

        if (event.key === '"' || parserState.awaitingRegister) {
            consume(event);
            const result = parseKey(parserState, event.key);
            parserState = result.state;
            render();
            return;
        }

        if (visualTextObjectPrefix) {
            consume(event);
            const textObject =
                `${visualTextObjectPrefix}${event.key}` as VimTextObject;
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
            if (visualKind === "character") leaveVisualMode();
            else {
                visualKind = "character";
                syncVisualSelection();
                render();
            }
            return;
        }

        if (event.key === "V") {
            consume(event);
            if (visualKind === "line") leaveVisualMode();
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
            void operateVisual("d", register).catch(console.error);
            return;
        }

        if (event.key === "y") {
            consume(event);
            const register = parserState.register;
            parserState = createParserState();
            void operateVisual("y", register).catch(console.error);
            return;
        }

        if (event.key === "c" || event.key === "s") {
            consume(event);
            const register = parserState.register;
            parserState = createParserState();
            void operateVisual("c", register).catch(console.error);
            return;
        }

        if (event.key === "p" || event.key === "P") {
            consume(event);
            const register = parserState.register;
            parserState = createParserState();
            void putVisual(register).catch(console.error);
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
            if (!cursor || lines.length === 0) return;

            const target = getMotionTarget(
                lines,
                cursor,
                result.action.motion,
                result.action.count,
                result.action.countSpecified,
                {
                    character: result.action.character,
                    lastFind,
                    preferredColumn,
                },
            );
            if (
                result.action.motion === "j" ||
                result.action.motion === "k"
            ) {
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

    function handleKeydown(event: KeyboardEvent): void {
        if (!enabled) return;
        if (isForwardedEvent(event)) return;
        if (event.isComposing || event.keyCode === 229) return;
        if (
            event.key === "Shift" ||
            event.key === "Control" ||
            event.key === "Alt" ||
            event.key === "Meta"
        ) {
            return;
        }
        if (mode === "insert" && event.ctrlKey && event.key === "[") {
            handleInsertMode(event);
            return;
        }
        if (
            mode === "normal" &&
            event.ctrlKey &&
            event.key.toLowerCase() === "r"
        ) {
            consume(event);
            const count = parserState.count
                ? Number.parseInt(parserState.count, 10)
                : 1;
            parserState = createParserState();
            for (let index = 0; index < count; index += 1) {
                sendUndo(true);
            }
            render();
            scheduleRender();
            return;
        }
        if (
            mode === "normal" &&
            event.ctrlKey &&
            !isAnotherEditableElement(event.target) &&
            (event.key.toLowerCase() === "a" ||
                event.key.toLowerCase() === "x")
        ) {
            consume(event);
            const count = parserState.count
                ? Number.parseInt(parserState.count, 10)
                : 1;
            parserState = createParserState();
            void executeAction({
                kind: "command",
                command:
                    event.key.toLowerCase() === "a"
                        ? "ctrl-a"
                        : "ctrl-x",
                count,
            }).catch(console.error);
            render();
            return;
        }
        if (event.ctrlKey || event.altKey || event.metaKey) return;
        if (isAnotherEditableElement(event.target)) return;

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
        capture: true,
    });
    document.addEventListener("click", schedulePointerRender, {
        capture: true,
    });
    view.commandInput.addEventListener("keydown", handleCommandLineKeydown);
    document.addEventListener("selectionchange", scheduleRender);
    window.addEventListener("resize", scheduleRender);
    window.addEventListener("scroll", scheduleRender, { capture: true });

    const cosenseWindow = getCosenseWindow();
    const reconcileMarks = () => {
        const pageTitle = getPageTitle();
        if (pageTitle !== null) {
            marks.reconcile(pageTitle, getPageLineSnapshots());
        }
        scheduleRender();
    };
    cosenseWindow.cosense?.on?.("lines:changed", reconcileMarks);

    const restorePageEditing = () => {
        if (!enabled) return;
        commandLineActive = false;
        view.commandInput.hidden = true;
        view.commandInput.value = "";
        mode = "insert";
        parserState = createParserState();
        preferredColumn = undefined;
        activatePositionAfterNavigation({ line: 0, char: 0 });
    };
    cosenseWindow.cosense?.on?.("page:changed", restorePageEditing);
    cosenseWindow.cosense?.on?.("layout:changed", restorePageEditing);

    cosenseWindow.__cosenseVimToggle = () => setEnabled(!enabled);
    addVimMenu();
    setMode("insert");

    function destroy(): void {
        document.removeEventListener("keydown", handleKeydown, { capture: true });
        document.removeEventListener("keyup", scheduleRender, {
            capture: true,
        });
        document.removeEventListener("pointerup", schedulePointerRender, {
            capture: true,
        });
        document.removeEventListener("click", schedulePointerRender, {
            capture: true,
        });
        view.commandInput.removeEventListener(
            "keydown",
            handleCommandLineKeydown,
        );
        document.removeEventListener("selectionchange", scheduleRender);
        window.removeEventListener("resize", scheduleRender);
        window.removeEventListener("scroll", scheduleRender, { capture: true });
        cosenseWindow.cosense?.removeListener?.(
            "lines:changed",
            reconcileMarks,
        );
        cosenseWindow.cosense?.removeListener?.(
            "page:changed",
            restorePageEditing,
        );
        cosenseWindow.cosense?.removeListener?.(
            "layout:changed",
            restorePageEditing,
        );
        delete cosenseWindow.__cosenseVimToggle;
        view.destroy();
    }

    return { destroy };
}
