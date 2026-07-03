import type { BriefInkApi } from "../shared/types";

declare global {
  interface Window {
    briefInk: BriefInkApi;
    webkitAudioContext: typeof AudioContext;
  }
}
