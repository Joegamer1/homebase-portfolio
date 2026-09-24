import { expect, it, vi } from "vitest";
import { JobSalaryProvider } from "./career-salary.js";

it("reads one annual US salary estimate without exposing the key in the URL", async () => {
  const request = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        status: "OK",
        data: [
          {
            min_salary: 78000.4,
            max_salary: 119999.7,
            salary_period: "YEAR",
            salary_currency: "USD",
            publisher_name: "Glassdoor",
          },
        ],
      }),
    ),
  );
  await expect(new JobSalaryProvider("private-key", request).estimate("SOC Analyst")).resolves.toEqual({
    salaryMin: 78000,
    salaryMax: 120000,
    salaryCurrency: "USD",
    source: "Glassdoor",
  });
  const [url, options] = request.mock.calls[0]!;
  expect(url.toString()).not.toContain("private-key");
  expect(url.searchParams.get("location_type")).toBe("COUNTRY");
  expect(options.headers).toEqual({ "x-api-key": "private-key" });
});

it("ignores unusable estimates and rejects API failures", async () => {
  const unusable = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        status: "OK",
        data: [
          { min_salary: 45, max_salary: 70, salary_period: "HOUR", salary_currency: "USD" },
          { min_salary: 90000, max_salary: 80000, salary_period: "YEAR", salary_currency: "USD" },
        ],
      }),
    ),
  );
  await expect(new JobSalaryProvider("key", unusable).estimate("Analyst")).resolves.toBeUndefined();
  await expect(
    new JobSalaryProvider("key", vi.fn().mockResolvedValue(new Response("denied", { status: 403 }))).estimate(
      "Analyst",
    ),
  ).rejects.toThrow("HTTP 403");
});
