import { expect, it } from "vitest";
import { requestErrorMessage } from "./request-errors";

it("explains domain rejection separately from timeout and network failure", () => {
  expect(requestErrorMessage("request:fail url not in domain list")).toContain("request 合法域名");
  expect(requestErrorMessage("request:fail timeout")).toContain("超时");
  expect(requestErrorMessage("request:fail connection reset")).toContain("检查网络");
});
