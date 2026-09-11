#!/usr/bin/env python3
"""CI-only source patches for expo-modules-jsi, undone on every fresh `npm ci`.

Run from the repo root. See the "Patch expo-modules-jsi for this Xcode/Swift
toolchain" step in .github/workflows/ios-unsigned-build.yml for why each of
these exists — this file only holds the multi-line replacements that don't
fit cleanly as a one-line sed.

The three `sending`-checker fixes below round-trip each risky pointer through
its integer bit pattern rather than capturing it directly with
`nonisolated(unsafe)` (even relocated to just inside `assumeIsolated`, which
was tried and produced the byte-identical error — see ADR-HEARTH-031's
2026-09-10 update). An integer bit pattern is trivially `Sendable`, so
nothing pointer-shaped ever crosses the actor boundary; the real pointer is
reconstructed from those same bits before first use, inside the same
synchronous, same-thread closure `assumeIsolated` already guarantees. This is
reasoning-sound (see ADR-HEARTH-031's 2026-09-11 update for the accepted
risk: it has only ever been verified by "compiles in CI", never on a real
device) but has not been ruled out as hitting the same checker bug a fourth
way — confirm the CI build's full log no longer shows "sending ... risks
causing data races" at these call sites before treating this as fixed.
"""

import sys

RUNTIME_SWIFT = "node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/JavaScriptRuntime.swift"
PROMISE_SWIFT = "node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptPromise.swift"


def apply(path, replacements):
    with open(path, encoding="utf-8") as f:
        content = f.read()
    for old, new in replacements:
        count = content.count(old)
        if count != 1:
            print(f"ERROR: expected exactly 1 match in {path}, got {count}, for:\n{old[:120]}", file=sys.stderr)
            sys.exit(1)
        content = content.replace(old, new, 1)
    with open(path, "w", encoding="utf-8") as f:
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
      // See the file header of patch-expo-modules-jsi.py for why this is a bit-pattern
      // round-trip rather than a `nonisolated(unsafe)` capture.
      let resultPtrBits = UInt(bitPattern: resultPtr)

      return withGuaranteedContext(context) { (context: HostObjectContext, runtime) in
        return JavaScriptActor.assumeIsolated {
          let resultPtr = UnsafeMutablePointer<facebook.jsi.Value>(bitPattern: resultPtrBits)!
          return forwardingSwiftErrorsToJS(runtime: runtime) {
            try context.get(propertyName).writeJSIValue(to: resultPtr)
          }
        }
      }
    }""",
    ),
    (
        """    // `assumeIsolated` runs `operation` synchronously, in this very scope — it never escapes and never
    // hops threads (see `JavaScriptActor.assumeIsolated`). So rather than materializing the move-only
    // `JavaScriptValuesBuffer` out here and smuggling it across the closure boundary through a
    // heap-allocated `JavaScriptRef` (Swift 6.2 rejects capturing/consuming a `~Copyable` value in the
    // escaping closure that `withoutActuallyEscaping` synthesizes), the closure constructs the buffer
    // locally from the raw pointer + count. Those are read-only call-scoped inputs that never outlive the
    // synchronous call, so the `nonisolated(unsafe)` capture is sound. This removes a per-call class
    // allocation + retain/release + dealloc that profiling showed dominating the no-op `@JS` host-call
    // floor.
    nonisolated(unsafe) let thisPtr = thisPtr
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
        """    // `assumeIsolated` runs `operation` synchronously, in this very scope — it never escapes and never
    // hops threads (see `JavaScriptActor.assumeIsolated`). So rather than materializing the move-only
    // `JavaScriptValuesBuffer` out here and smuggling it across the closure boundary through a
    // heap-allocated `JavaScriptRef` (Swift 6.2 rejects capturing/consuming a `~Copyable` value in the
    // escaping closure that `withoutActuallyEscaping` synthesizes), the closure constructs the buffer
    // locally from the raw pointer + count. Those are read-only call-scoped inputs that never outlive
    // the synchronous call. See the file header of patch-expo-modules-jsi.py for why they cross the
    // boundary as bit patterns rather than as a direct `nonisolated(unsafe)` capture. This removes a
    // per-call class allocation + retain/release + dealloc that profiling showed dominating the no-op
    // `@JS` host-call floor.
    let thisPtrBits = UInt(bitPattern: thisPtr)
    let argumentsPtrBits = UInt(bitPattern: argumentsPtr)
    let resultPtrBits = UInt(bitPattern: resultPtr)

    // See `withGuaranteedContext` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: HostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        let thisPtr = UnsafePointer<facebook.jsi.Value>(bitPattern: thisPtrBits)!
        let argumentsPtr = UnsafePointer<facebook.jsi.Value>(bitPattern: argumentsPtrBits)!
        let resultPtr = UnsafeMutablePointer<facebook.jsi.Value>(bitPattern: resultPtrBits)!
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
        """    // Same call-scoped reasoning as the owning-`this` overload above (see its comment) for why the
    // buffer is built inside the synchronous `assumeIsolated` closure. Here `this` is additionally
    // handed in as a borrowed `JavaScriptUnownedValue` pointing straight at the C++-owned `this` slot:
    // it is not moved out and no owning `JavaScriptValue` is allocated, so the closure avoids the
    // per-call `weak`-runtime form/destroy and heap object that the owning `this` pays.
    nonisolated(unsafe) let thisPtr = thisPtr
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
        """    // Same call-scoped reasoning as the owning-`this` overload above (see its comment) for why the
    // buffer is built inside the synchronous `assumeIsolated` closure, and for crossing the boundary as
    // bit patterns rather than as a direct `nonisolated(unsafe)` capture (see the file header of
    // patch-expo-modules-jsi.py). Here `this` is additionally handed in as a borrowed
    // `JavaScriptUnownedValue` pointing straight at the C++-owned `this` slot: it is not moved out and
    // no owning `JavaScriptValue` is allocated, so the closure avoids the per-call `weak`-runtime
    // form/destroy and heap object that the owning `this` pays.
    let thisPtrBits = UInt(bitPattern: thisPtr)
    let argumentsPtrBits = UInt(bitPattern: argumentsPtr)
    let resultPtrBits = UInt(bitPattern: resultPtr)

    // See `withGuaranteedContext` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: UnownedThisHostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        let thisPtr = UnsafePointer<facebook.jsi.Value>(bitPattern: thisPtrBits)!
        let argumentsPtr = UnsafePointer<facebook.jsi.Value>(bitPattern: argumentsPtrBits)!
        let resultPtr = UnsafeMutablePointer<facebook.jsi.Value>(bitPattern: resultPtrBits)!
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

print("expo-modules-jsi patched: regex literal, sending-checker bit-pattern round-trips, LongLivedState init")
