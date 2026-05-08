import { defineBackground } from "wxt/utils/define-background";
import { initBackground } from "../lib/background/runtime";

export default defineBackground({
  type: "module",
  main() {
    initBackground();
  },
});
