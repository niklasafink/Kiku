import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyPurchaseRequest, notifySignUp } from "./notify";

const signUp = (user: unknown) => Response.json({ token: null, user });
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:abc");
  vi.stubEnv("TELEGRAM_CHAT_ID", "42");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("notifySignUp", () => {
  it("sends name and e-mail of the new user to the configured chat", async () => {
    await notifySignUp(signUp({ email: "anna@example.com", name: "Anna" }));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(JSON.parse(init.body)).toEqual({ chat_id: "42", text: "Neue Registrierung bei Kiku\nAnna (anna@example.com)" });
  });

  it("does nothing when no bot is configured", async () => {
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    await notifySignUp(signUp({ email: "anna@example.com" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when the response carries no user", async () => {
    await notifySignUp(new Response("not json"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows a failing Telegram call", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(notifySignUp(signUp({ email: "anna@example.com" }))).resolves.toBeUndefined();
  });
});

describe("notifyPurchaseRequest", () => {
  it("sends who wants to buy what", async () => {
    await notifyPurchaseRequest({ email: "anna@example.com", name: "Anna" }, "pro-yearly");
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).text).toBe("Kaufanfrage bei Kiku\nAnna (anna@example.com)\nPro, 29 € im Jahr");
  });
});
