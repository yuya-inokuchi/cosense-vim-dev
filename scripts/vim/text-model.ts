export type Position = {
    line: number;
    char: number;
};

export type SelectionKind = "character" | "line";
export type MotionInclusivity = "inclusive" | "exclusive";

export type TextRange = {
    start: Position;
    end: Position;
    kind: SelectionKind;
};

export type CharacterClass = "whitespace" | "keyword" | "punctuation";
export type WordClass = "whitespace" | "word";

const graphemeSegmenter =
    typeof Intl.Segmenter === "function"
        ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
        : null;

const whitespacePattern = /^\s+$/u;
const keywordPattern = /^[\p{L}\p{N}\p{M}_]+$/u;

export function splitGraphemes(text: string): string[] {
    if (!graphemeSegmenter) return Array.from(text);

    return Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);
}

export function graphemeLength(text: string): number {
    return splitGraphemes(text).length;
}

export function comparePositions(left: Position, right: Position): number {
    if (left.line !== right.line) return left.line - right.line;
    return left.char - right.char;
}

export function normalizeRange(range: TextRange): TextRange {
    if (comparePositions(range.start, range.end) <= 0) return range;

    return {
        ...range,
        start: range.end,
        end: range.start,
    };
}

export function clampPosition(
    lines: readonly string[],
    position: Position,
): Position {
    if (lines.length === 0) {
        return { line: 0, char: 0 };
    }

    const line = Math.min(Math.max(position.line, 0), lines.length - 1);
    const char = Math.min(
        Math.max(position.char, 0),
        graphemeLength(lines[line] ?? ""),
    );

    return { line, char };
}

export function normalizeAndClampRange(
    lines: readonly string[],
    range: TextRange,
): TextRange {
    return normalizeRange({
        ...range,
        start: clampPosition(lines, range.start),
        end: clampPosition(lines, range.end),
    });
}

export function getTextInRange(
    lines: readonly string[],
    sourceRange: TextRange,
): string {
    if (lines.length === 0) return "";

    const range = normalizeAndClampRange(lines, sourceRange);

    if (range.kind === "line") {
        return `${lines.slice(range.start.line, range.end.line + 1).join("\n")}\n`;
    }

    const startLine = splitGraphemes(lines[range.start.line] ?? "");
    const endLine = splitGraphemes(lines[range.end.line] ?? "");

    if (range.start.line === range.end.line) {
        return startLine.slice(range.start.char, range.end.char).join("");
    }

    const parts = [
        startLine.slice(range.start.char).join(""),
        ...lines.slice(range.start.line + 1, range.end.line),
        endLine.slice(0, range.end.char).join(""),
    ];
    return parts.join("\n");
}

export function classifyCharacter(grapheme: string): CharacterClass {
    if (whitespacePattern.test(grapheme)) return "whitespace";
    if (keywordPattern.test(grapheme)) return "keyword";
    return "punctuation";
}

export function classifyWord(grapheme: string): WordClass {
    return whitespacePattern.test(grapheme) ? "whitespace" : "word";
}

export function codeUnitOffsetAtGrapheme(
    text: string,
    graphemeIndex: number,
): number {
    return splitGraphemes(text)
        .slice(0, Math.max(graphemeIndex, 0))
        .join("").length;
}

export function graphemeIndexAtCodeUnit(
    text: string,
    codeUnitOffset: number,
): number {
    const target = Math.min(Math.max(codeUnitOffset, 0), text.length);
    let consumed = 0;
    let index = 0;

    for (const grapheme of splitGraphemes(text)) {
        if (consumed + grapheme.length > target) break;
        consumed += grapheme.length;
        index += 1;
    }

    return index;
}

export function positionBefore(
    lines: readonly string[],
    position: Position,
): Position {
    if (position.char > 0) {
        return { line: position.line, char: position.char - 1 };
    }
    if (position.line > 0) {
        return {
            line: position.line - 1,
            char: Math.max(graphemeLength(lines[position.line - 1] ?? "") - 1, 0),
        };
    }
    return { line: 0, char: 0 };
}
