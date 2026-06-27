import {
    codeUnitOffsetAtGrapheme,
    graphemeIndexAtCodeUnit,
    getTextInRange,
    graphemeLength,
    normalizeRange,
    splitGraphemes,
    type Position,
    type TextRange,
} from "./text-model";
import type { VimMotion } from "./parser";
import type { VimOperator } from "./parser";

export function effectiveOperatorMotion(
    operator: VimOperator,
    motion: VimMotion,
    currentCharacter: string,
): VimMotion {
    if (
        operator === "c" &&
        !/^\s$/u.test(currentCharacter) &&
        (motion === "w" || motion === "W")
    ) {
        return motion === "w" ? "e" : "E";
    }

    return motion;
}

export function characterRange(
    lines: readonly string[],
    start: Position,
    count: number,
    backward = false,
): TextRange {
    const lineLength = graphemeLength(lines[start.line] ?? "");

    if (backward) {
        return {
            start: { line: start.line, char: Math.max(start.char - count, 0) },
            end: start,
            kind: "character",
        };
    }

    return {
        start,
        end: {
            line: start.line,
            char: Math.min(start.char + count, lineLength),
        },
        kind: "character",
    };
}

export function lineRange(
    lines: readonly string[],
    startLine: number,
    count: number,
): TextRange {
    return {
        start: { line: startLine, char: 0 },
        end: {
            line: Math.min(startLine + count - 1, lines.length - 1),
            char: 0,
        },
        kind: "line",
    };
}

export function rangeForMotion(
    lines: readonly string[],
    cursor: Position,
    target: Position,
    motion: VimMotion,
): TextRange {
    if (
        motion === "j" ||
        motion === "k" ||
        motion === "gg" ||
        motion === "G"
    ) {
        return {
            start: { line: cursor.line, char: 0 },
            end: { line: target.line, char: 0 },
            kind: "line",
        };
    }

    const forward =
        target.line > cursor.line ||
        (target.line === cursor.line && target.char >= cursor.char);
    const inclusive = new Set<VimMotion>([
        "e",
        "E",
        "$",
        "f",
        "F",
        "t",
        "T",
        "%",
        "ge",
        "gE",
    ]).has(motion);

    if (forward && !inclusive && target.line > cursor.line && target.char === 0) {
        const firstNonBlank = splitGraphemes(lines[cursor.line] ?? "").findIndex(
            (value) => !/^\s$/u.test(value),
        );
        const startsBeforeContent =
            cursor.char <= (firstNonBlank < 0 ? 0 : firstNonBlank);

        if (startsBeforeContent) {
            return {
                start: { line: cursor.line, char: 0 },
                end: { line: target.line - 1, char: 0 },
                kind: "line",
            };
        }

        return {
            start: cursor,
            end: {
                line: target.line - 1,
                char: graphemeLength(lines[target.line - 1] ?? ""),
            },
            kind: "character",
        };
    }

    const end =
        forward && inclusive
            ? {
                  line: target.line,
                  char: Math.min(
                      target.char + 1,
                      graphemeLength(lines[target.line] ?? ""),
                  ),
              }
            : target;

    return {
        start: cursor,
        end,
        kind: "character",
    };
}

export function deleteCharacterRange(
    lines: readonly string[],
    sourceRange: TextRange,
): {
    lines: string[];
    cursor: Position;
    deletedText: string;
} {
    const range = normalizeRange(sourceRange);
    const deletedText = getTextInRange(lines, range);
    const nextLines = [...lines];

    if (range.kind === "line") {
        nextLines.splice(
            range.start.line,
            range.end.line - range.start.line + 1,
        );
        if (nextLines.length === 0) nextLines.push("");
        return {
            lines: nextLines,
            cursor: {
                line: Math.min(range.start.line, nextLines.length - 1),
                char: 0,
            },
            deletedText,
        };
    }

    const startGraphemes = splitGraphemes(lines[range.start.line] ?? "");
    const endGraphemes = splitGraphemes(lines[range.end.line] ?? "");
    const merged = [
        ...startGraphemes.slice(0, range.start.char),
        ...endGraphemes.slice(range.end.char),
    ].join("");

    nextLines.splice(
        range.start.line,
        range.end.line - range.start.line + 1,
        merged,
    );

    return {
        lines: nextLines,
        cursor: range.start,
        deletedText,
    };
}

export function putCharacterwise(
    line: string,
    char: number,
    text: string,
    after: boolean,
): {
    text: string;
    cursorChar: number;
} {
    const graphemes = splitGraphemes(line);
    const insertAt = Math.min(
        Math.max(char + (after && graphemes.length > 0 ? 1 : 0), 0),
        graphemes.length,
    );
    const inserted = splitGraphemes(text);
    graphemes.splice(insertAt, 0, ...inserted);

    return {
        text: graphemes.join(""),
        cursorChar: Math.max(insertAt + inserted.length - 1, 0),
    };
}

export function putCharacterwiseLines(
    lines: readonly string[],
    position: Position,
    text: string,
    after: boolean,
): {
    lines: string[];
    cursor: Position;
} {
    const current = splitGraphemes(lines[position.line] ?? "");
    const insertAt = Math.min(
        Math.max(
            position.char + (after && current.length > 0 ? 1 : 0),
            0,
        ),
        current.length,
    );
    const before = current.slice(0, insertAt).join("");
    const afterText = current.slice(insertAt).join("");
    const parts = text.split("\n");

    if (parts.length === 1) {
        const result = putCharacterwise(
            lines[position.line] ?? "",
            position.char,
            text,
            after,
        );
        const nextLines = [...lines];
        nextLines[position.line] = result.text;
        return {
            lines: nextLines,
            cursor: { line: position.line, char: result.cursorChar },
        };
    }

    const insertedLines = [
        `${before}${parts[0] ?? ""}`,
        ...parts.slice(1, -1),
        `${parts.at(-1) ?? ""}${afterText}`,
    ];
    const nextLines = [...lines];
    nextLines.splice(position.line, 1, ...insertedLines);

    return {
        lines: nextLines,
        cursor: {
            line: position.line + insertedLines.length - 1,
            char: Math.max(
                graphemeLength(parts.at(-1) ?? "") - 1,
                0,
            ),
        },
    };
}

export function linewiseValues(text: string): string[] {
    const values = text.endsWith("\n")
        ? text.slice(0, -1).split("\n")
        : text.split("\n");
    return values.length === 0 ? [""] : values;
}

export function firstNonBlankChar(line: string): number {
    const graphemes = splitGraphemes(line);
    const index = graphemes.findIndex((value) => !/^\s$/u.test(value));
    return index < 0 ? 0 : index;
}

export function leadingWhitespace(line: string): string {
    return line.match(/^\s*/u)?.[0] ?? "";
}

export function joinLines(
    lines: readonly string[],
    startLine: number,
    count: number,
): {
    text: string;
    cursorChar: number;
    joinedLineCount: number;
} | null {
    if (startLine < 0 || startLine >= lines.length - 1) return null;

    const joinedLineCount = Math.min(
        Math.max(count, 2),
        lines.length - startLine,
    );
    let text = lines[startLine] ?? "";
    const cursorChar =
        splitGraphemes(text).findLastIndex((value) => !/^\s$/u.test(value)) +
        1;

    for (
        let line = startLine + 1;
        line < startLine + joinedLineCount;
        line += 1
    ) {
        const next = (lines[line] ?? "").replace(/^\s+/u, "");
        if (next === "") continue;

        const needsSpace =
            text !== "" &&
            !/\s$/u.test(text) &&
            !next.startsWith(")");
        text = `${text}${needsSpace ? " " : ""}${next}`;
    }

    return {
        text,
        cursorChar,
        joinedLineCount,
    };
}

export function shiftIndent(text: string, direction: 1 | -1): string {
    if (direction > 0) {
        return text === "" ? text : `\t${text}`;
    }

    return text.startsWith("\t")
        ? text.slice(1)
        : text.replace(/^ {1,4}/u, "");
}

export function changeNumberAtOrAfter(
    text: string,
    character: number,
    delta: number,
): {
    text: string;
    cursorChar: number;
} | null {
    const cursorOffset = codeUnitOffsetAtGrapheme(text, character);
    const match = Array.from(text.matchAll(/-?\d+/gu)).find((candidate) => {
        const start = candidate.index;
        return cursorOffset < start + candidate[0].length;
    });
    if (!match) return null;

    const source = match[0];
    const negative = source.startsWith("-");
    const digits = negative ? source.slice(1) : source;
    const value = BigInt(source) + BigInt(delta);
    const absolute = (value < 0n ? -value : value).toString();
    const padded =
        digits.length > 1 && digits.startsWith("0")
            ? absolute.padStart(digits.length, "0")
            : absolute;
    const replacement = `${value < 0n ? "-" : ""}${padded}`;
    const start = match.index;
    const nextText =
        text.slice(0, start) +
        replacement +
        text.slice(start + source.length);

    return {
        text: nextText,
        cursorChar: graphemeIndexAtCodeUnit(
            nextText,
            start + replacement.length - 1,
        ),
    };
}

export type CaseChange = "toggle" | "lower" | "upper";

export function changeCaseInRange(
    lines: readonly string[],
    sourceRange: TextRange,
    change: CaseChange,
): string[] {
    const range = normalizeRange(sourceRange);
    const nextLines = [...lines];

    for (
        let line = range.start.line;
        line <= range.end.line;
        line += 1
    ) {
        const graphemes = splitGraphemes(lines[line] ?? "");
        const start =
            range.kind === "line" || line > range.start.line
                ? 0
                : range.start.char;
        const end =
            range.kind === "line" || line < range.end.line
                ? graphemes.length
                : range.end.char;

        for (let index = start; index < end; index += 1) {
            const value = graphemes[index] ?? "";
            graphemes[index] =
                change === "lower"
                    ? value.toLowerCase()
                    : change === "upper"
                      ? value.toUpperCase()
                      : value === value.toUpperCase()
                        ? value.toLowerCase()
                        : value.toUpperCase();
        }
        nextLines[line] = graphemes.join("");
    }

    return nextLines;
}

export function visualRange(
    lines: readonly string[],
    anchor: Position,
    cursor: Position,
    kind: "character" | "line",
): TextRange {
    if (kind === "line") {
        return {
            start: { line: anchor.line, char: 0 },
            end: { line: cursor.line, char: 0 },
            kind: "line",
        };
    }

    const forward =
        cursor.line > anchor.line ||
        (cursor.line === anchor.line && cursor.char >= anchor.char);
    const end = forward
        ? {
              line: cursor.line,
              char: Math.min(
                  cursor.char + 1,
                  graphemeLength(lines[cursor.line] ?? ""),
              ),
          }
        : {
              line: anchor.line,
              char: Math.min(
                  anchor.char + 1,
                  graphemeLength(lines[anchor.line] ?? ""),
              ),
          };

    return forward
        ? { start: anchor, end, kind: "character" }
        : { start: cursor, end, kind: "character" };
}
