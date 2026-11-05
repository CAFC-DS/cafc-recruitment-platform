import { act, renderHook } from "@testing-library/react";
import { usePersistentIdSet, usePersistentState } from "./usePersistentState";

const tokenFor = (userId: number) =>
  `header.${btoa(JSON.stringify({ sub: `user${userId}`, user_id: userId }))}.signature`;

const signIn = (userId: number) => localStorage.setItem("token", tokenFor(userId));

beforeEach(() => {
  localStorage.clear();
  signIn(1);
});

describe("usePersistentState", () => {
  it("restores the value on the first render after remounting", () => {
    const view = renderHook(() => usePersistentState("filter", ""));
    act(() => view.result.current[1]("Stage 3"));
    view.unmount();

    const renders: string[] = [];
    renderHook(() => {
      const [value] = usePersistentState("filter", "");
      renders.push(value);
    });
    expect(renders[0]).toBe("Stage 3");
  });

  it("keeps each account's values separate", () => {
    const view = renderHook(() => usePersistentState("filter", ""));
    act(() => view.result.current[1]("Stage 3"));
    view.unmount();

    signIn(2);
    expect(renderHook(() => usePersistentState("filter", "")).result.current[0]).toBe("");
  });

  it("does not remember anything when nobody is signed in", () => {
    localStorage.removeItem("token");
    const { result } = renderHook(() => usePersistentState("filter", ""));
    act(() => result.current[1]("Stage 3"));
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it("falls back to the default on corrupt or wrongly typed saved values", () => {
    localStorage.setItem("persisted:v1:1:corrupt", "{not json");
    localStorage.setItem("persisted:v1:1:typed", JSON.stringify(42));
    expect(renderHook(() => usePersistentState("corrupt", "a")).result.current[0]).toBe("a");
    expect(renderHook(() => usePersistentState("typed", "a")).result.current[0]).toBe("a");
  });

  it("fills filters added since the value was saved and rejects bad field types", () => {
    localStorage.setItem(
      "persisted:v1:1:filters",
      JSON.stringify({ playerName: "Smith", stages: "not-an-array" }),
    );
    const { result } = renderHook(() =>
      usePersistentState("filters", { playerName: "", stages: [] as string[], club: "" }),
    );
    expect(result.current[0]).toEqual({ playerName: "Smith", stages: [], club: "" });
  });

  it("clears storage when a value returns to its default", () => {
    const { result } = renderHook(() => usePersistentState("filter", ""));
    act(() => result.current[1]("Stage 3"));
    expect(localStorage.getItem("persisted:v1:1:filter")).toBe('"Stage 3"');
    act(() => result.current[1](""));
    expect(localStorage.getItem("persisted:v1:1:filter")).toBeNull();
  });

  it("applies the restore option to saved values only", () => {
    localStorage.setItem("persisted:v1:1:paged", JSON.stringify({ name: "Smith", page: 4 }));
    const { result } = renderHook(() =>
      usePersistentState("paged", { name: "", page: 1 }, {
        restore: (saved) => ({ ...saved, page: 1 }),
      }),
    );
    expect(result.current[0]).toEqual({ name: "Smith", page: 1 });
  });
});

describe("usePersistentIdSet", () => {
  it("round-trips a Set, including functional updates", () => {
    const view = renderHook(() => usePersistentIdSet("lists"));
    act(() => view.result.current[1](new Set([1, 2])));
    act(() =>
      view.result.current[1]((previous) => {
        const next = new Set(previous);
        next.delete(1);
        next.add(3);
        return next;
      }),
    );
    view.unmount();

    const { result } = renderHook(() => usePersistentIdSet("lists"));
    expect(Array.from(result.current[0]).sort()).toEqual([2, 3]);
  });
});
