import { Device } from "../core/types/Device";
import { nextRoom, planInitialRooms } from "./bulkRooms";

const CHOICES = ["Living Room", "Den", "Kitchen"];
const device = (id: string, name: string) => ({ id, name } as Device);

describe("planInitialRooms", () => {
  test("pre-selects the room each device's name mentions and skips the rest", () => {
    expect(planInitialRooms([device("a", "Living Room TV"), device("b", "Roku Ultra"), device("c", "Kitchen Speaker")], CHOICES)).toEqual({
      a: "Living Room",
      c: "Kitchen",
    });
  });

  test("nothing to plan for an empty list", () => {
    expect(planInitialRooms([], CHOICES)).toEqual({});
  });
});

describe("nextRoom", () => {
  test("tapping a different room selects it", () => {
    expect(nextRoom("Den", "Kitchen")).toBe("Kitchen");
    expect(nextRoom(undefined, "Den")).toBe("Den");
  });

  test("tapping the selected room clears it, ignoring case", () => {
    expect(nextRoom("Den", "den")).toBe("");
  });
});
