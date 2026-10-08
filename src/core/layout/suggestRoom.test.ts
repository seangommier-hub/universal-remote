import { suggestRoom } from "./suggestRoom";

const CHOICES = ["Living Room", "Den", "Bedroom", "Kitchen", "Office", "Kids"];

describe("suggestRoom", () => {
  test("finds the room named in the device's own name", () => {
    expect(suggestRoom("Living Room TV", CHOICES)).toBe("Living Room");
    expect(suggestRoom("Bedroom Speaker", CHOICES)).toBe("Bedroom");
  });

  test("ignores case and punctuation", () => {
    expect(suggestRoom("den-tv", CHOICES)).toBe("Den");
    expect(suggestRoom("KITCHEN lights", CHOICES)).toBe("Kitchen");
  });

  test("only matches whole words", () => {
    expect(suggestRoom("Denver Roku", CHOICES)).toBeUndefined();
    expect(suggestRoom("Officer Dan's TV", CHOICES)).toBeUndefined();
  });

  test("prefers the longest matching room", () => {
    expect(suggestRoom("Kids Living Room TV", [...CHOICES, "Kids Living Room"])).toBe("Kids Living Room");
  });

  test("undefined when the name mentions no room", () => {
    expect(suggestRoom("LG TV", CHOICES)).toBeUndefined();
    expect(suggestRoom("", CHOICES)).toBeUndefined();
  });
});
