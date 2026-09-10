import { sendDigitSequence } from "./sendDigitSequence";

describe("sendDigitSequence", () => {
  test("presses each digit of a multi-digit channel in order", async () => {
    const pressed: string[] = [];
    await sendDigitSequence(142, async (digit) => {
      pressed.push(digit);
    }, 0);
    expect(pressed).toEqual(["1", "4", "2"]);
  });

  test("presses a single digit for a one-digit channel", async () => {
    const pressed: string[] = [];
    await sendDigitSequence(7, async (digit) => pressed.push(digit) as unknown as void, 0);
    expect(pressed).toEqual(["7"]);
  });

  test("presses '0' for channel 0", async () => {
    const pressed: string[] = [];
    await sendDigitSequence(0, async (digit) => pressed.push(digit) as unknown as void, 0);
    expect(pressed).toEqual(["0"]);
  });

  test("waits delayMs between presses but not after the last one", async () => {
    jest.useFakeTimers();
    const pressed: string[] = [];
    const promise = sendDigitSequence(12, async (digit) => {
      pressed.push(digit);
    }, 100);

    await Promise.resolve(); // let the first press's synchronous work run
    expect(pressed).toEqual(["1"]);

    jest.advanceTimersByTime(100);
    await promise;
    expect(pressed).toEqual(["1", "2"]);
    jest.useRealTimers();
  });

  test("rejects a negative channel number without pressing anything", async () => {
    const pressed: string[] = [];
    await expect(sendDigitSequence(-1, async (digit) => pressed.push(digit) as unknown as void)).rejects.toThrow(/non-negative integer/);
    expect(pressed).toEqual([]);
  });

  test("rejects a non-integer channel number without pressing anything", async () => {
    const pressed: string[] = [];
    await expect(sendDigitSequence(4.5, async (digit) => pressed.push(digit) as unknown as void)).rejects.toThrow(/non-negative integer/);
    expect(pressed).toEqual([]);
  });
});
