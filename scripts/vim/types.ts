export type VimMode = "normal" | "insert" | "visual";

export type MotionKey =
    | "ArrowLeft"
    | "ArrowDown"
    | "ArrowUp"
    | "ArrowRight"
    | "Home"
    | "End";

export type EditingKey = MotionKey | "Backspace" | "Delete";

export type KeyModifiers = {
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
};

export type CosenseCursor = {
    line?: number;
    char?: number;
};

export type CosenseLine = {
    id?: string;
    text?: string;
};

export type CosenseWindow = Window & {
    cosense?: {
        on?(
            event: "lines:changed" | "page:changed" | "layout:changed",
            listener: () => void,
        ): void;
        removeListener?(
            event: "lines:changed" | "page:changed" | "layout:changed",
            listener: () => void,
        ): void;
        PageMenu?: {
            addMenu(options: {
                title: string;
                icon: string;
                onClick: () => void;
            }): void;
        };
        Page?: {
            title?: string | null;
            lines?: CosenseLine[] | null;
            cursor?: {
                line: number;
                char: number;
                hasFocus: boolean;
            } | null;
            show(title: string): Promise<void>;
            waitForSave(): Promise<void>;
            insertLine(text: string, index: number): void;
            updateLine(text: string, index: number): void;
            selection?: {
                start: { line: number; char: number };
                end: { line: number; char: number };
            } | null;
        };
        Project?: {
            name?: string;
        };
    };
    scrapbox?: {
        Page?: {
            cursor?: CosenseCursor;
        };
    };
    __cosenseVimCleanup?: () => void;
    __cosenseVimToggle?: () => void;
};
