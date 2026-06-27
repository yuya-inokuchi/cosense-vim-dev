import type { VimMotion } from "./parser";
import {
    clampPosition,
    classifyCharacter,
    classifyWord,
    graphemeLength,
    splitGraphemes,
    type Position,
} from "./text-model";

type Unit = {
    value: string;
    position: Position;
    kind: "character" | "newline";
};

export type FindMotion = {
    character: string;
    direction: "forward" | "backward";
    till: boolean;
};

export type MotionContext = {
    character?: string;
    lastFind?: FindMotion;
    preferredColumn?: number;
};

function firstNonBlank(lines: readonly string[], line: number): Position {
    const graphemes = splitGraphemes(lines[line] ?? "");
    const char = graphemes.findIndex((value) => !/^\s$/u.test(value));
    return {
        line,
        char: char < 0 ? 0 : char,
    };
}

function firstBodyLine(lines: readonly string[]): number {
    return lines.length > 1 ? 1 : 0;
}

function lastCharacter(lines: readonly string[], line: number): Position {
    return {
        line,
        char: Math.max(graphemeLength(lines[line] ?? "") - 1, 0),
    };
}

function documentUnits(lines: readonly string[]): Unit[] {
    const units: Unit[] = [];

    lines.forEach((line, lineIndex) => {
        splitGraphemes(line).forEach((value, char) => {
            units.push({
                value,
                position: { line: lineIndex, char },
                kind: "character",
            });
        });

        if (lineIndex < lines.length - 1) {
            units.push({
                value: "\n",
                position: {
                    line: lineIndex,
                    char: graphemeLength(line),
                },
                kind: "newline",
            });
        }
    });

    return units;
}

function unitIndexAt(units: readonly Unit[], position: Position): number {
    const exact = units.findIndex(
        (unit) =>
            unit.position.line === position.line &&
            unit.position.char === position.char,
    );
    if (exact >= 0) return exact;

    for (let index = units.length - 1; index >= 0; index -= 1) {
        const unit = units[index];
        if (!unit) continue;
        if (
            unit.position.line < position.line ||
            (unit.position.line === position.line &&
                unit.position.char <= position.char)
        ) {
            return index;
        }
    }

    return 0;
}

function isWhitespace(unit: Unit): boolean {
    return unit.kind === "newline" || /^\s$/u.test(unit.value);
}

function classFor(unit: Unit, bigWord: boolean): string {
    if (unit.kind === "newline") return "whitespace";
    return bigWord
        ? classifyWord(unit.value)
        : classifyCharacter(unit.value);
}

function nearestCharacter(
    units: readonly Unit[],
    index: number,
    direction: 1 | -1,
): Position | null {
    for (
        let next = index;
        next >= 0 && next < units.length;
        next += direction
    ) {
        const unit = units[next];
        if (unit?.kind === "character") return unit.position;
    }
    return null;
}

function wordForward(
    lines: readonly string[],
    position: Position,
    count: number,
    bigWord: boolean,
): Position {
    const units = documentUnits(lines);
    if (units.length === 0) return { line: 0, char: 0 };

    let index = unitIndexAt(units, position);

    for (let repetition = 0; repetition < count; repetition += 1) {
        const current = units[index];
        if (!current) break;

        if (!isWhitespace(current)) {
            const currentClass = classFor(current, bigWord);
            while (
                index < units.length &&
                !isWhitespace(units[index]!) &&
                classFor(units[index]!, bigWord) === currentClass
            ) {
                index += 1;
            }
        }

        while (index < units.length && isWhitespace(units[index]!)) {
            index += 1;
        }
    }

    return (
        nearestCharacter(units, Math.min(index, units.length - 1), 1) ??
        nearestCharacter(units, units.length - 1, -1) ??
        position
    );
}

function wordBackward(
    lines: readonly string[],
    position: Position,
    count: number,
    bigWord: boolean,
): Position {
    const units = documentUnits(lines);
    if (units.length === 0) return { line: 0, char: 0 };

    let index = Math.max(unitIndexAt(units, position) - 1, 0);

    for (let repetition = 0; repetition < count; repetition += 1) {
        while (index > 0 && isWhitespace(units[index]!)) {
            index -= 1;
        }

        const currentClass = classFor(units[index]!, bigWord);
        while (
            index > 0 &&
            !isWhitespace(units[index - 1]!) &&
            classFor(units[index - 1]!, bigWord) === currentClass
        ) {
            index -= 1;
        }

        if (repetition < count - 1) index = Math.max(index - 1, 0);
    }

    return nearestCharacter(units, index, -1) ?? { line: 0, char: 0 };
}

function wordEndForward(
    lines: readonly string[],
    position: Position,
    count: number,
    bigWord: boolean,
): Position {
    const units = documentUnits(lines);
    if (units.length === 0) return { line: 0, char: 0 };

    let index = unitIndexAt(units, position);

    for (let repetition = 0; repetition < count; repetition += 1) {
        const current = units[index]!;
        const next = units[index + 1];
        const atCurrentClassEnd =
            !isWhitespace(current) &&
            (!next ||
                isWhitespace(next) ||
                classFor(next, bigWord) !== classFor(current, bigWord));

        if (repetition > 0 || isWhitespace(current) || atCurrentClassEnd) {
            index += 1;
            while (index < units.length && isWhitespace(units[index]!)) {
                index += 1;
            }
        }

        if (index >= units.length) {
            index = units.length - 1;
            break;
        }

        const currentClass = classFor(units[index]!, bigWord);
        while (
            index + 1 < units.length &&
            !isWhitespace(units[index + 1]!) &&
            classFor(units[index + 1]!, bigWord) === currentClass
        ) {
            index += 1;
        }
    }

    return nearestCharacter(units, index, -1) ?? position;
}

function wordEndBackward(
    lines: readonly string[],
    position: Position,
    count: number,
    bigWord: boolean,
): Position {
    const units = documentUnits(lines);
    if (units.length === 0) return { line: 0, char: 0 };

    const sourceIndex = unitIndexAt(units, position);
    let index = Math.max(sourceIndex - 1, 0);

    for (let repetition = 0; repetition < count; repetition += 1) {
        const source = units[Math.min(index + 1, units.length - 1)];
        if (
            source &&
            !isWhitespace(source) &&
            !isWhitespace(units[index]!) &&
            classFor(source, bigWord) === classFor(units[index]!, bigWord)
        ) {
            const currentClass = classFor(units[index]!, bigWord);
            while (
                index >= 0 &&
                !isWhitespace(units[index]!) &&
                classFor(units[index]!, bigWord) === currentClass
            ) {
                index -= 1;
            }
        }

        while (index > 0 && isWhitespace(units[index]!)) {
            index -= 1;
        }

        if (repetition < count - 1) {
            const currentClass = classFor(units[index]!, bigWord);
            while (
                index > 0 &&
                !isWhitespace(units[index - 1]!) &&
                classFor(units[index - 1]!, bigWord) === currentClass
            ) {
                index -= 1;
            }
            index = Math.max(index - 1, 0);
        }
    }

    return nearestCharacter(units, Math.max(index, 0), -1) ?? {
        line: 0,
        char: 0,
    };
}

function findCharacter(
    lines: readonly string[],
    position: Position,
    find: FindMotion,
    count: number,
): Position {
    const graphemes = splitGraphemes(lines[position.line] ?? "");
    const step = find.direction === "forward" ? 1 : -1;
    let index = position.char;
    let remaining = count;

    while (remaining > 0) {
        index += step;
        while (
            index >= 0 &&
            index < graphemes.length &&
            graphemes[index] !== find.character
        ) {
            index += step;
        }

        if (index < 0 || index >= graphemes.length) return position;
        remaining -= 1;
    }

    if (find.till) index -= step;
    return {
        line: position.line,
        char: Math.min(Math.max(index, 0), Math.max(graphemes.length - 1, 0)),
    };
}

function repeatFind(
    lines: readonly string[],
    position: Position,
    count: number,
    lastFind: FindMotion | undefined,
    reverse: boolean,
): Position {
    if (!lastFind) return position;

    return findCharacter(
        lines,
        position,
        {
            ...lastFind,
            direction: reverse
                ? lastFind.direction === "forward"
                    ? "backward"
                    : "forward"
                : lastFind.direction,
        },
        count,
    );
}

const openingBracket = new Map([
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
]);
const closingBracket = new Map([
    [")", "("],
    ["]", "["],
    ["}", "{"],
]);

function matchingBracket(
    lines: readonly string[],
    position: Position,
): Position {
    const units = documentUnits(lines);
    if (units.length === 0) return position;

    let index = unitIndexAt(units, position);
    let value = units[index]?.value;

    if (!openingBracket.has(value ?? "") && !closingBracket.has(value ?? "")) {
        while (
            index < units.length &&
            units[index]?.position.line === position.line &&
            !openingBracket.has(units[index]?.value ?? "") &&
            !closingBracket.has(units[index]?.value ?? "")
        ) {
            index += 1;
        }
        value = units[index]?.value;
    }

    if (!value) return position;

    const isOpening = openingBracket.has(value);
    const partner = isOpening
        ? openingBracket.get(value)
        : closingBracket.get(value);
    if (!partner) return position;

    const step = isOpening ? 1 : -1;
    let depth = 1;
    for (
        let next = index + step;
        next >= 0 && next < units.length;
        next += step
    ) {
        const candidate = units[next]?.value;
        if (candidate === value) depth += 1;
        if (candidate === partner) depth -= 1;
        if (depth === 0) return units[next]?.position ?? position;
    }

    return position;
}

function paragraphMotion(
    lines: readonly string[],
    position: Position,
    direction: 1 | -1,
    count: number,
): Position {
    let line = position.line;

    for (let repetition = 0; repetition < count; repetition += 1) {
        line += direction;
        while (
            line > 0 &&
            line < lines.length - 1 &&
            (lines[line] ?? "").trim() !== ""
        ) {
            line += direction;
        }
        line = Math.min(Math.max(line, 0), lines.length - 1);
    }

    return { line, char: 0 };
}

export function getMotionTarget(
    lines: readonly string[],
    source: Position,
    motion: VimMotion,
    count: number,
    countSpecified = false,
    context: MotionContext = {},
): Position {
    if (lines.length === 0) return { line: 0, char: 0 };

    const position = clampPosition(lines, source);
    const repetitions = Math.max(count, 1);

    switch (motion) {
        case "h":
            return { ...position, char: Math.max(position.char - repetitions, 0) };
        case "l":
            return {
                ...position,
                char: Math.min(
                    position.char + repetitions,
                    Math.max(graphemeLength(lines[position.line] ?? "") - 1, 0),
                ),
            };
        case "j": {
            const line = Math.min(position.line + repetitions, lines.length - 1);
            return {
                line,
                char: Math.min(
                    context.preferredColumn ?? position.char,
                    Math.max(graphemeLength(lines[line] ?? "") - 1, 0),
                ),
            };
        }
        case "k": {
            const line = Math.max(position.line - repetitions, 0);
            return {
                line,
                char: Math.min(
                    context.preferredColumn ?? position.char,
                    Math.max(graphemeLength(lines[line] ?? "") - 1, 0),
                ),
            };
        }
        case "0":
            return { line: position.line, char: 0 };
        case "^":
            return firstNonBlank(lines, position.line);
        case "$": {
            const line = Math.min(
                position.line + repetitions - 1,
                lines.length - 1,
            );
            return lastCharacter(lines, line);
        }
        case "|":
            return {
                line: position.line,
                char: Math.min(
                    repetitions - 1,
                    Math.max(graphemeLength(lines[position.line] ?? "") - 1, 0),
                ),
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
            const line = countSpecified
                ? Math.min(
                      Math.max(repetitions - 1, firstBodyLine(lines)),
                      lines.length - 1,
                  )
                : firstBodyLine(lines);
            return firstNonBlank(lines, line);
        }
        case "G": {
            const line = countSpecified
                ? Math.min(repetitions - 1, lines.length - 1)
                : lines.length - 1;
            return firstNonBlank(lines, line);
        }
        case "f":
        case "F":
        case "t":
        case "T":
            if (!context.character) return position;
            return findCharacter(
                lines,
                position,
                {
                    character: context.character,
                    direction:
                        motion === "f" || motion === "t"
                            ? "forward"
                            : "backward",
                    till: motion === "t" || motion === "T",
                },
                repetitions,
            );
        case ";":
            return repeatFind(
                lines,
                position,
                repetitions,
                context.lastFind,
                false,
            );
        case ",":
            return repeatFind(
                lines,
                position,
                repetitions,
                context.lastFind,
                true,
            );
        case "%":
            return matchingBracket(lines, position);
        case "{":
            return paragraphMotion(lines, position, -1, repetitions);
        case "}":
            return paragraphMotion(lines, position, 1, repetitions);
    }
}
