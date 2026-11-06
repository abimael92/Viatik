import type { CapacitorConfig } from "@capacitor/cli";
import { parseRuntimeEnv } from "./lib/config/runtime-env.mjs";

const runtimeEnv = parseRuntimeEnv();
const config: CapacitorConfig = {
  appId: "com.viatik.app",
  appName: "Viatik",
  webDir: "out",
  server: {
    url: runtimeEnv.CAPACITOR_SERVER_URL,
    cleartext: true,
  },
};

export default config;
