import type { VimTextObject } from "./parser";
import {
    classifyCharacter,
    classifyWord,
    graphemeLength,
    splitGraphemes,
    type Position,
    type TextRange,
} from "./text-model";

type FlatUnit = {
    value: string;
    position: Position;
};

function isWhitespace(value: string): boolean {
    return /^\s$/u.test(value);
}

function characterClass(value: string, bigWord: boolean): string {
    return bigWord ? classifyWord(value) : classifyCharacter(value);
}

function wordObject(
    lines: readonly string[],
    cursor: Position,
    around: boolean,
    bigWord: boolean,
    count: number,
): TextRange | null {
    const graphemes = splitGraphemes(lines[cursor.line] ?? "");
    if (graphemes.length === 0) return null;

    let index = Math.min(cursor.char, graphemes.length - 1);
    let start = index;
    let end = index + 1;

    if (isWhitespace(graphemes[index] ?? "")) {
        while (start > 0 && isWhitespace(graphemes[start - 1] ?? "")) start -= 1;
        while (end < graphemes.length && isWhitespace(graphemes[end] ?? "")) {
            end += 1;
        }

        if (around && end < graphemes.length) {
            const nextClass = characterClass(graphemes[end] ?? "", bigWord);
            while (
                end < graphemes.length &&
                !isWhitespace(graphemes[end] ?? "") &&
                characterClass(graphemes[end] ?? "", bigWord) === nextClass
            ) {
                end += 1;
            }
        }
    } else {
        const currentClass = characterClass(graphemes[index] ?? "", bigWord);
        while (
            start > 0 &&
            !isWhitespace(graphemes[start - 1] ?? "") &&
            characterClass(graphemes[start - 1] ?? "", bigWord) === currentClass
        ) {
            start -= 1;
        }
        while (
            end < graphemes.length &&
            !isWhitespace(graphemes[end] ?? "") &&
            characterClass(graphemes[end] ?? "", bigWord) === currentClass
        ) {
            end += 1;
        }
    }

    for (let repetition = 1; repetition < count; repetition += 1) {
        while (end < graphemes.length && isWhitespace(graphemes[end] ?? "")) {
            end += 1;
        }
        if (end >= graphemes.length) break;

        const nextClass = characterClass(graphemes[end] ?? "", bigWord);
        while (
            end < graphemes.length &&
            !isWhitespace(graphemes[end] ?? "") &&
            characterClass(graphemes[end] ?? "", bigWord) === nextClass
        ) {
            end += 1;
        }
    }

    if (around && !isWhitespace(graphemes[index] ?? "")) {
        const contentEnd = end;
        while (end < graphemes.length && isWhitespace(graphemes[end] ?? "")) {
            end += 1;
        }
        if (end === contentEnd) {
            while (start > 0 && isWhitespace(graphemes[start - 1] ?? "")) {
                start -= 1;
            }
        }
    }

    return {
        start: { line: cursor.line, char: start },
        end: { line: cursor.line, char: end },
        kind: "character",
    };
}

function quoteObject(
    lines: readonly string[],
    cursor: Position,
    quote: string,
    around: boolean,
): TextRange | null {
    const graphemes = splitGraphemes(lines[cursor.line] ?? "");
    const quotes: number[] = [];

    for (let index = 0; index < graphemes.length; index += 1) {
        let backslashes = 0;
        for (
            let previous = index - 1;
            previous >= 0 && graphemes[previous] === "\\";
            previous -= 1
        ) {
            backslashes += 1;
        }

        if (graphemes[index] === quote && backslashes % 2 === 0) {
            quotes.push(index);
        }
    }

    for (let index = 0; index + 1 < quotes.length; index += 2) {
        const open = quotes[index]!;
        const close = quotes[index + 1]!;
        if (cursor.char < open || cursor.char > close) continue;

        let start = around ? open : open + 1;
        let end = around ? close + 1 : close;
        if (start === end) return null;

        if (around) {
            const contentEnd = end;
            while (end < graphemes.length && isWhitespace(graphemes[end] ?? "")) {
                end += 1;
            }
            if (end === contentEnd) {
                while (start > 0 && isWhitespace(graphemes[start - 1] ?? "")) {
                    start -= 1;
                }
            }
        }

        return {
            start: { line: cursor.line, char: start },
            end: { line: cursor.line, char: end },
            kind: "character",
        };
    }

    return null;
}

function flatten(lines: readonly string[]): FlatUnit[] {
    const units: FlatUnit[] = [];
    lines.forEach((line, lineIndex) => {
        splitGraphemes(line).forEach((value, char) => {
            units.push({ value, position: { line: lineIndex, char } });
        });
    });
    return units;
}

function positionIndex(units: readonly FlatUnit[], cursor: Position): number {
    const exact = units.findIndex(
        ({ position }) =>
            position.line === cursor.line && position.char === cursor.char,
    );
    return exact >= 0 ? exact : 0;
}

function bracketObject(
    lines: readonly string[],
    cursor: Position,
    open: string,
    close: string,
    around: boolean,
    count: number,
): TextRange | null {
    const units = flatten(lines);
    if (units.length === 0) return null;

    const cursorIndex = positionIndex(units, cursor);
    const candidates: Array<{ open: number; close: number }> = [];
    const stack: number[] = [];

    units.forEach((unit, index) => {
        if (unit.value === open) stack.push(index);
        if (unit.value !== close) return;
        const opening = stack.pop();
        if (
            opening !== undefined &&
            opening <= cursorIndex &&
            cursorIndex <= index
        ) {
            candidates.push({ open: opening, close: index });
        }
    });

    candidates.sort(
        (left, right) =>
            left.close - left.open - (right.close - right.open),
    );
    const candidate = candidates[Math.min(count - 1, candidates.length - 1)];
    if (!candidate) return null;

    const startUnit = units[candidate.open]!;
    const endUnit = units[candidate.close]!;
    const startChar = startUnit.position.char + (around ? 0 : 1);
    const endChar = endUnit.position.char + (around ? 1 : 0);
    if (
        startUnit.position.line === endUnit.position.line &&
        startChar === endChar
    ) {
        return null;
    }

    return {
        start: { line: startUnit.position.line, char: startChar },
        end: { line: endUnit.position.line, char: endChar },
        kind: "character",
    };
}

function paragraphObject(
    lines: readonly string[],
    cursor: Position,
    around: boolean,
    count: number,
): TextRange | null {
    if (lines.length === 0) return null;
    const blank = (line: number) => (lines[line] ?? "").trim() === "";

    let start = cursor.line;
    let end = cursor.line;

    if (blank(cursor.line)) {
        while (start > 0 && blank(start - 1)) start -= 1;
        while (end + 1 < lines.length && blank(end + 1)) end += 1;
    } else {
        while (start > 0 && !blank(start - 1)) start -= 1;
        while (end + 1 < lines.length && !blank(end + 1)) end += 1;
    }

    for (let repetition = 1; repetition < count; repetition += 1) {
        while (end + 1 < lines.length && blank(end + 1)) end += 1;
        while (end + 1 < lines.length && !blank(end + 1)) end += 1;
    }

    if (around && !blank(cursor.line)) {
        const contentEnd = end;
        while (end + 1 < lines.length && blank(end + 1)) end += 1;
        if (end === contentEnd) {
            while (start > 0 && blank(start - 1)) start -= 1;
        }
    }

    return {
        start: { line: start, char: 0 },
        end: { line: end, char: 0 },
        kind: "line",
    };
}

const bracketAliases: Partial<
    Record<VimTextObject, { open: string; close: string; around: boolean }>
> = {
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
    aB: { open: "{", close: "}", around: true },
};

export function getTextObjectRange(
    lines: readonly string[],
    cursor: Position,
    textObject: VimTextObject,
    count = 1,
): TextRange | null {
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
            return quoteObject(lines, cursor, textObject[1]!, false);
        case 'a"':
        case "a'":
        case "a`":
            return quoteObject(lines, cursor, textObject[1]!, true);
        case "ip":
            return paragraphObject(lines, cursor, false, count);
        case "ap":
            return paragraphObject(lines, cursor, true, count);
        default: {
            const bracket = bracketAliases[textObject];
            return bracket
                ? bracketObject(
                      lines,
                      cursor,
                      bracket.open,
                      bracket.close,
                      bracket.around,
                      count,
                  )
                : null;
        }
    }
}
