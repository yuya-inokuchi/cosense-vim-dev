import cssText from "../style.css" with { type: "text" };

import type { SearchMatch } from "./search";
import type { VimMode } from "./types";

export type SearchHighlight = SearchMatch & {
    lineId?: string;
    active: boolean;
};

const bodyClasses = [
    "vim-disabled",
    "vim-normal",
    "vim-insert",
    "vim-visual",
] as const;

export type VimView = {
    commandInput: HTMLInputElement;
    render(options: {
        enabled: boolean;
        mode: VimMode;
        pendingKeys: string;
        cursorRect: DOMRect | null;
        searchHighlights: SearchHighlight[];
    }): void;
    scheduleCursorRender(render: () => void): void;
    destroy(): void;
};

function replaceElement<T extends HTMLElement>(
    selector: string,
    create: () => T,
): T {
    document.querySelector(selector)?.remove();
    const element = create();
    document.body.appendChild(element);
    return element;
}

export function createVimView(): VimView {
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
        searchHighlights,
    }: {
        enabled: boolean;
        mode: VimMode;
        pendingKeys: string;
        cursorRect: DOMRect | null;
        searchHighlights: SearchHighlight[];
    }): void {
        document.body.classList.remove(...bodyClasses);
        document.body.classList.add(enabled ? `vim-${mode}` : "vim-disabled");
        modeIndicator.textContent = enabled
            ? `-- ${mode.toUpperCase()} --`
            : "-- VIM OFF --";
        pendingIndicator.textContent = pendingKeys;
        pendingIndicator.hidden = !enabled || pendingKeys === "";
        renderSearchHighlights(enabled ? searchHighlights : []);

        if (
            !enabled ||
            mode !== "normal" ||
            !cursorRect ||
            cursorRect.height === 0
        ) {
            blockCursor.style.display = "none";
            return;
        }

        blockCursor.style.display = "block";
        blockCursor.style.left = `${cursorRect.left}px`;
        blockCursor.style.top = `${cursorRect.top}px`;
        blockCursor.style.width = `${Math.max(cursorRect.width, 2)}px`;
        blockCursor.style.height = `${cursorRect.height}px`;
    }

    function renderSearchHighlights(highlights: SearchHighlight[]): void {
        searchLayer.replaceChildren();
        if (highlights.length === 0) return;

        const lines = document.querySelectorAll<HTMLElement>(".editor .line");
        const fragment = document.createDocumentFragment();
        for (const highlight of highlights) {
            const line = findLineElement(highlight, lines);
            if (!line) continue;

            for (
                let char = highlight.char;
                char < highlight.char + highlight.length;
                char += 1
            ) {
                const character = line.querySelector<HTMLElement>(
                    `[data-char-index="${char}"]`,
                );
                if (!character) continue;

                const rect = character.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;

                const element = document.createElement("div");
                element.className = [
                    "cosense-vim-search-highlight",
                    highlight.active
                        ? "cosense-vim-search-highlight-active"
                        : "",
                ]
                    .filter(Boolean)
                    .join(" ");
                element.style.left = `${rect.left}px`;
                element.style.top = `${rect.top}px`;
                element.style.width = `${rect.width}px`;
                element.style.height = `${rect.height}px`;
                fragment.appendChild(element);
            }
        }
        searchLayer.appendChild(fragment);
    }

    function findLineElement(
        highlight: SearchHighlight,
        lines: NodeListOf<HTMLElement>,
    ): HTMLElement | null {
        if (highlight.lineId && !highlight.lineId.startsWith("line:")) {
            const line = document.getElementById(`L${highlight.lineId}`);
            if (line instanceof HTMLElement && line.matches(".line")) {
                return line;
            }
        }

        return lines[highlight.line] ?? null;
    }

    function scheduleCursorRender(renderCursor: () => void): void {
        cancelAnimationFrame(cursorFrame);
        cancelAnimationFrame(cursorFollowupFrame);
        cursorFrame = requestAnimationFrame(() => {
            renderCursor();
            cursorFollowupFrame = requestAnimationFrame(renderCursor);
        });
    }

    function destroy(): void {
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
        destroy,
    };
}
