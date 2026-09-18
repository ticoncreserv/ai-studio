import { describe, expect, it } from "vitest";
import { CHAT_NEAR_BOTTOM_PX, isChatNearBottom } from "./chat-scroll";

describe("isChatNearBottom", () => {
  it("treats a short transcript as pinned", () => {
    expect(isChatNearBottom({ scrollTop: 0, scrollHeight: 200, clientHeight: 400 })).toBe(true);
  });

  it("treats the exact bottom as pinned", () => {
    expect(isChatNearBottom({ scrollTop: 700, scrollHeight: 1000, clientHeight: 300 })).toBe(true);
  });

  it("stays pinned within the threshold", () => {
    expect(
      isChatNearBottom({
        scrollTop: 1000 - 300 - CHAT_NEAR_BOTTOM_PX,
        scrollHeight: 1000,
        clientHeight: 300,
      }),
    ).toBe(true);
  });

  it("unpins after scrolling into history", () => {
    expect(isChatNearBottom({ scrollTop: 200, scrollHeight: 1000, clientHeight: 300 })).toBe(false);
  });
});
