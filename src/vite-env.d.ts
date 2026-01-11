/// <reference types="vite/client" />

import type { ILSPluginUser } from "@logseq/libs/dist/LSPlugin.user";

declare global {
  interface Window {
    logseq: ILSPluginUser;
  }
  const logseq: ILSPluginUser;
}
