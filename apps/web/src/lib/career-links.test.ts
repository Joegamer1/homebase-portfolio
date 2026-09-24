import { expect, it } from "vitest";
import { careerApplicationLink, careerSearchLinks } from "./career-links";

it("uses real application links and explicitly labels missing-URL fallback searches", () => {
  const job = { title: "Security & Detection", company: "Example", source: "greenhouse:example" };
  expect(careerApplicationLink({ ...job, sourceUrl: "https://example.com/jobs/1" })).toMatchObject({
    direct: true,
    label: "Open application",
  });
  expect(careerApplicationLink({ ...job, sourceUrl: "javascript:alert(1)" })).toMatchObject({
    direct: false,
    label: "Find listing on LinkedIn",
  });
  expect(careerApplicationLink({ ...job, source: "mock-career" })).toBeUndefined();
  expect(new URL(careerSearchLinks(job.title).linkedin).searchParams.get("keywords")).toBe(job.title);
});
