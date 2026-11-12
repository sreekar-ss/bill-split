import { expect, it } from "vitest";
import { displayName, isInvited } from "@/lib/utils/person";

it("labels invited and deleted people", () => {
  expect(displayName({ name: "Ben", status: "placeholder" })).toBe("Ben (invited)");
  expect(displayName({ name: "Zoe", status: "deleted" })).toBe("Deleted user");
  expect(displayName({ name: "Ana", status: "active" })).toBe("Ana");
  expect(displayName({ name: "Ana" })).toBe("Ana");
  expect(isInvited({ status: "placeholder" })).toBe(true);
});
