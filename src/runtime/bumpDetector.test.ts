import { createBumpDetector } from "./bumpDetector";

describe("createBumpDetector", () => {
  test("resting gravity (about 1g) never counts as a bump", () => {
    const onBump = jest.fn();
    createBumpDetector(onBump)({ x: 0, y: 0, z: 1 });
    expect(onBump).not.toHaveBeenCalled();
  });

  test("a sharp spike above the threshold fires once", () => {
    const onBump = jest.fn();
    createBumpDetector(onBump)({ x: 2, y: 2, z: 1 });
    expect(onBump).toHaveBeenCalledTimes(1);
  });

  test("further spikes inside the cooldown are ignored, then it fires again after", () => {
    const onBump = jest.fn();
    let time = 0;
    const feed = createBumpDetector(onBump, () => time);
    feed({ x: 3, y: 0, z: 0 });
    time = 500;
    feed({ x: 3, y: 0, z: 0 });
    expect(onBump).toHaveBeenCalledTimes(1);
    time = 2500;
    feed({ x: 3, y: 0, z: 0 });
    expect(onBump).toHaveBeenCalledTimes(2);
  });
});
