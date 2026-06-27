import { getCosenseWindow } from "./vim/cosense";
import { createVimController } from "./vim/controller";

const cosenseWindow = getCosenseWindow();

cosenseWindow.__cosenseVimCleanup?.();

const controller = createVimController();

cosenseWindow.__cosenseVimCleanup = () => {
    controller.destroy();
    delete cosenseWindow.__cosenseVimCleanup;
};

console.log("[cosense-vim] loaded");
