import {
    classifyCharacter,
    codeUnitOffsetAtGrapheme,
    graphemeLength,
    graphemeIndexAtCodeUnit,
    splitGraphemes,
    type Position,
} from "./text-model";

export type SearchDirection = "forward" | "backward";

export type SearchMatch = {
    line: number;
    char: number;
    length: number;
};

export function findAllSearchMatches(
    lines: readonly string[],
    query: string,
): SearchMatch[] {
    if (lines.length === 0 || query === "") return [];

    const length = graphemeLength(query);
    const matches: SearchMatch[] = [];
    for (let line = 0; line < lines.length; line += 1) {
        const text = lines[line] ?? "";
        let offset = 0;
        while (offset <= text.length - query.length) {
            const found = text.indexOf(query, offset);
            if (found < 0) break;
            matches.push({
                line,
                char: graphemeIndexAtCodeUnit(text, found),
                length,
            });
            offset = found + query.length;
        }
    }

    return matches;
}

export function findSearchMatch(
    lines: readonly string[],
    cursor: Position,
    query: string,
    direction: SearchDirection,
    count = 1,
): Position | null {
    if (lines.length === 0 || query === "") return null;

    const matches = findAllSearchMatches(lines, query);
    if (matches.length === 0) return null;

    const cursorOffset = codeUnitOffsetAtGrapheme(
        lines[cursor.line] ?? "",
        cursor.char,
    );
    const ordered =
        direction === "forward"
            ? [
                  ...matches.filter(
                      (match) =>
                          match.line > cursor.line ||
                          (match.line === cursor.line &&
                              codeUnitOffsetAtGrapheme(
                                  lines[match.line] ?? "",
                                  match.char,
                              ) > cursorOffset),
                  ),
                  ...matches.filter(
                      (match) =>
                          match.line < cursor.line ||
                          (match.line === cursor.line &&
                              codeUnitOffsetAtGrapheme(
                                  lines[match.line] ?? "",
                                  match.char,
                              ) <= cursorOffset),
                  ),
              ]
            : [
                  ...matches
                      .filter(
                          (match) =>
                              match.line < cursor.line ||
                              (match.line === cursor.line &&
                                  codeUnitOffsetAtGrapheme(
                                      lines[match.line] ?? "",
                                      match.char,
                                  ) < cursorOffset),
                      )
                      .reverse(),
                  ...matches
                      .filter(
                          (match) =>
                              match.line > cursor.line ||
                              (match.line === cursor.line &&
                                  codeUnitOffsetAtGrapheme(
                                      lines[match.line] ?? "",
                                      match.char,
                                  ) >= cursorOffset),
                      )
                      .reverse(),
              ];

    const match = ordered[(Math.max(count, 1) - 1) % ordered.length];
    return match ? { line: match.line, char: match.char } : null;
}

export function searchWordUnderCursor(
    lines: readonly string[],
    cursor: Position,
): string | null {
    const graphemes = splitGraphemes(lines[cursor.line] ?? "");
    if (graphemes.length === 0) return null;

    let index = Math.min(cursor.char, graphemes.length - 1);
    while (
        index < graphemes.length &&
        classifyCharacter(graphemes[index] ?? "") !== "keyword"
    ) {
        index += 1;
    }
    if (index >= graphemes.length) return null;

    let start = index;
    let end = index + 1;
    while (
        start > 0 &&
        classifyCharacter(graphemes[start - 1] ?? "") === "keyword"
    ) {
        start -= 1;
    }
    while (
        end < graphemes.length &&
        classifyCharacter(graphemes[end] ?? "") === "keyword"
    ) {
        end += 1;
    }

    return graphemes.slice(start, end).join("");
}

export function substituteText(
    lines: readonly string[],
    options: {
        startLine: number;
        endLine: number;
        pattern: string;
        replacement: string;
        global: boolean;
    },
): {
    lines: string[];
    count: number;
    firstMatch: Position | null;
} {
    const nextLines = [...lines];
    if (lines.length === 0 || options.pattern === "") {
        return { lines: nextLines, count: 0, firstMatch: null };
    }

    const startLine = Math.min(
        Math.max(options.startLine, 0),
        lines.length - 1,
    );
    const endLine = Math.min(
        Math.max(options.endLine, startLine),
        lines.length - 1,
    );
    let count = 0;
    let firstMatch: Position | null = null;

    for (let line = startLine; line <= endLine; line += 1) {
        const text = lines[line] ?? "";
        const result = substituteLine(
            text,
            options.pattern,
            options.replacement,
            options.global,
        );
        if (result.count === 0) continue;

        nextLines[line] = result.text;
        count += result.count;
        firstMatch ??= {
            line,
            char: graphemeIndexAtCodeUnit(text, result.firstOffset),
        };
    }

    return { lines: nextLines, count, firstMatch };
}

function substituteLine(
    text: string,
    pattern: string,
    replacement: string,
    global: boolean,
): { text: string; count: number; firstOffset: number } {
    let offset = 0;
    let count = 0;
    let firstOffset = -1;
    let result = "";

    while (offset <= text.length - pattern.length) {
        const found = text.indexOf(pattern, offset);
        if (found < 0) break;

        result += text.slice(offset, found);
        result += replacement;
        firstOffset = firstOffset < 0 ? found : firstOffset;
        count += 1;
        offset = found + pattern.length;

        if (!global) break;
    }

    if (count === 0) return { text, count, firstOffset: 0 };

    result += text.slice(offset);
    return { text: result, count, firstOffset };
}
