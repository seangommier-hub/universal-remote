import { ReactNode, useEffect, useState } from "react";
import { isDemoMode } from "./demoMode";
import { startDemoEnvironment } from "./demoRuntime";

/** Holds the app back in demo mode until demo storage and the network block are in place; renders children straight away otherwise. */
export function DemoGate({ children }: { children: ReactNode }) {
  const demo = isDemoMode();
  const [ready, setReady] = useState(!demo);

  useEffect(() => {
    if (demo) void startDemoEnvironment().then(() => setReady(true));
  }, [demo]);

  return ready ? <>{children}</> : null;
}
