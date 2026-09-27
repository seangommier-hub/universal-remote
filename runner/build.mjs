import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const runnerDir = dirname(fileURLToPath(import.meta.url));
const shim = (name) => resolve(runnerDir, "shims", name);

const MODULE_SHIMS = {
  "@react-native-async-storage/async-storage": shim("asyncStorage.ts"),
  "expo-secure-store": shim("secureStore.ts"),
  "expo-crypto": shim("expoCrypto.ts"),
  "react-native": shim("reactNative.ts"),
  "react-native-udp": shim("unsupportedModule.ts"),
  "expo-updates": shim("unsupportedModule.ts"),
  "expo-network": shim("unsupportedModule.ts"),
};

const FCC_CONFIG_MODULE = /discovery[\\/]familyCommandCenterConfig$/;

const swapReactNativeModules = {
  name: "swap-react-native-modules",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (MODULE_SHIMS[args.path]) return { path: MODULE_SHIMS[args.path] };
      if (args.path.startsWith(".") && FCC_CONFIG_MODULE.test(resolve(args.resolveDir, args.path))) return { path: shim("fccConfig.ts") };
      return undefined;
    });
  },
};

await build({
  entryPoints: [resolve(runnerDir, "main.ts")],
  outfile: resolve(runnerDir, "dist/hearth-runner.cjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  plugins: [swapReactNativeModules],
  nodePaths: [resolve(runnerDir, "node_modules"), resolve(runnerDir, "../node_modules")],
  logLevel: "info",
});
