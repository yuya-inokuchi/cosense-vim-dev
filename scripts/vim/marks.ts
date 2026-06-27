import { splitGraphemes, type Position } from "./text-model";
import type { PageLineSnapshot } from "./cosense";

type StoredMark = {
    pageTitle: string;
    lineId: string;
    char: number;
    lineText: string;
};

function adjustedCharacter(
    oldText: string,
    newText: string,
    character: number,
): number {
    const oldGraphemes = splitGraphemes(oldText);
    const newGraphemes = splitGraphemes(newText);
    let prefix = 0;
    while (
        prefix < oldGraphemes.length &&
        prefix < newGraphemes.length &&
        oldGraphemes[prefix] === newGraphemes[prefix]
    ) {
        prefix += 1;
    }

    let suffix = 0;
    while (
        suffix < oldGraphemes.length - prefix &&
        suffix < newGraphemes.length - prefix &&
        oldGraphemes[oldGraphemes.length - suffix - 1] ===
            newGraphemes[newGraphemes.length - suffix - 1]
    ) {
        suffix += 1;
    }

    const oldChangeEnd = oldGraphemes.length - suffix;
    const newChangeEnd = newGraphemes.length - suffix;

    if (character < prefix) return character;
    if (character >= oldChangeEnd) {
        return Math.max(character + newChangeEnd - oldChangeEnd, 0);
    }
    return Math.min(
        prefix + (character - prefix),
        newChangeEnd,
    );
}

export class MarkStore {
    private readonly marks = new Map<string, StoredMark>();

    set(
        name: string,
        pageTitle: string,
        lines: readonly PageLineSnapshot[],
        position: Position,
    ): void {
        const line = lines[position.line];
        if (!line) return;

        this.marks.set(`${pageTitle}\n${name}`, {
            pageTitle,
            lineId: line.id,
            char: position.char,
            lineText: line.text,
        });
    }

    reconcile(
        pageTitle: string,
        lines: readonly PageLineSnapshot[],
    ): void {
        const linesById = new Map(lines.map((line) => [line.id, line]));

        for (const [key, mark] of this.marks) {
            if (mark.pageTitle !== pageTitle) continue;
            const line = linesById.get(mark.lineId);
            if (!line) {
                this.marks.delete(key);
                continue;
            }
            mark.char = adjustedCharacter(
                mark.lineText,
                line.text,
                mark.char,
            );
            mark.lineText = line.text;
        }
    }

    get(
        name: string,
        pageTitle: string,
        lines: readonly PageLineSnapshot[],
    ): Position | null {
        this.reconcile(pageTitle, lines);
        const mark = this.marks.get(`${pageTitle}\n${name}`);
        if (!mark) return null;

        const line = lines.findIndex(({ id }) => id === mark.lineId);
        return line < 0 ? null : { line, char: mark.char };
    }
}
