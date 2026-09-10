#!/usr/bin/env python3
"""CI-only source patches for expo-modules-jsi, undone on every fresh `npm ci`.

Run from the repo root. See the "Patch expo-modules-jsi for this Xcode/Swift
toolchain" step in .github/workflows/ios-unsigned-build.yml for why each of
these exists — this file only holds the multi-line replacements that don't
fit cleanly as a one-line sed.
"""

import sys

RUNTIME_SWIFT = "node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/JavaScriptRuntime.swift"
PROMISE_SWIFT = "node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptPromise.swift"


def apply(path, replacements):
    with open(path) as f:
        content = f.read()
    for old, new in replacements:
        count = content.count(old)
        if count != 1:
            print(f"ERROR: expected exactly 1 match in {path}, got {count}, for:\n{old[:120]}", file=sys.stderr)
            sys.exit(1)
        content = content.replace(old, new, 1)
    with open(path, "w") as f:
        f.write(content)


apply(RUNTIME_SWIFT, [
    (
        "if name.wholeMatch(of: /^[a-zA-Z_$][a-zA-Z0-9_$]*$/) == nil {",
        "if name.wholeMatch(of: #/^[a-zA-Z_$][a-zA-Z0-9_$]*$/#) == nil {",
    ),
    (
        """      let propertyName = String(cString: propertyName)
      nonisolated(unsafe) let resultPtr = resultPtr

      return withGuaranteedContext(context) { (context: HostObjectContext, runtime) in
        return JavaScriptActor.assumeIsolated {
          return forwardingSwiftErrorsToJS(runtime: runtime) {
            try context.get(propertyName).writeJSIValue(to: resultPtr)
          }
        }
      }
    }""",
        """      let propertyName = String(cString: propertyName)

      return withGuaranteedContext(context) { (context: HostObjectContext, runtime) in
        return JavaScriptActor.assumeIsolated {
          nonisolated(unsafe) let resultPtr = resultPtr
          return forwardingSwiftErrorsToJS(runtime: runtime) {
            try context.get(propertyName).writeJSIValue(to: resultPtr)
          }
        }
      }
    }""",
    ),
    (
        """    nonisolated(unsafe) let thisPtr = thisPtr
    nonisolated(unsafe) let argumentsPtr = argumentsPtr
    nonisolated(unsafe) let resultPtr = resultPtr

    // See `withGuaranteedContext` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: HostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let this = UnsafeMutablePointer(mutating: thisPtr).move()
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptValue(runtime, this)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)
        }
      }
    }
  }""",
        """    // See `withGuaranteedContext` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: HostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        nonisolated(unsafe) let thisPtr = thisPtr
        nonisolated(unsafe) let argumentsPtr = argumentsPtr
        nonisolated(unsafe) let resultPtr = resultPtr
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let this = UnsafeMutablePointer(mutating: thisPtr).move()
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptValue(runtime, this)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)
        }
      }
    }
  }""",
    ),
    (
        """    nonisolated(unsafe) let thisPtr = thisPtr
    nonisolated(unsafe) let argumentsPtr = argumentsPtr
    nonisolated(unsafe) let resultPtr = resultPtr

    // See `withGuaranteedContext` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: UnownedThisHostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptUnownedValue(runtime.pointee, thisPtr)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)
        }
      }
    }
  }""",
        """    // See `withGuaranteedContext` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: UnownedThisHostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        nonisolated(unsafe) let thisPtr = thisPtr
        nonisolated(unsafe) let argumentsPtr = argumentsPtr
        nonisolated(unsafe) let resultPtr = resultPtr
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptUnownedValue(runtime.pointee, thisPtr)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)
        }
      }
    }
  }""",
    ),
])

apply(PROMISE_SWIFT, [
    (
        """    let object = JavaScriptValue.Ref()
    let resolveFunction = JavaScriptValue.Ref()
    let rejectFunction = JavaScriptValue.Ref()

    func allowRelease() {""",
        """    let object = JavaScriptValue.Ref()
    let resolveFunction = JavaScriptValue.Ref()
    let rejectFunction = JavaScriptValue.Ref()

    // `LongLivedState` is `@JavaScriptActor`-isolated as a whole, but its implicit init would then
    // require callers to already be on that actor. It's actually safe to construct off-actor: the
    // stored properties' own inits (`JavaScriptValue.Ref()`) aren't themselves actor-isolated, so
    // there's nothing here that actually needs isolation at construction time.
    nonisolated init() {}

    func allowRelease() {""",
    ),
])

print("expo-modules-jsi patched: regex literal, sending-checker shadows, LongLivedState init")
