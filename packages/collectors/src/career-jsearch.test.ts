import { expect, it, vi } from "vitest";
import { JSearchJobProvider, inferArrangement, isRelevantTitle } from "./career.js";

const row = {
  job_id: "one",
  job_title: "Cybersecurity Analyst",
  employer_name: "Example",
  job_publisher: "LinkedIn",
  job_description: "Investigate SIEM alerts in hybrid cloud environments",
  job_location: "Remote",
  job_country: "US",
  job_is_remote: true,
  job_apply_link: "https://www.linkedin.com/jobs/view/123",
  apply_options: [{ publisher: "Example", is_direct: true, apply_link: "https://jobs.example.com/123" }],
  job_min_salary: 90000,
  job_max_salary: 110000,
  job_salary_period: "YEAR",
};
const response = (jobs: unknown[]) =>
  new Response(JSON.stringify({ status: "OK", data: { jobs, cursor: "more-pages" } }));
it("uses one documented search-v2 page with a private header and direct application link", async () => {
  const request = vi.fn().mockResolvedValue(response([row]));
  const jobs = await new JSearchJobProvider("test-key", "security analyst", request).collect();
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({
    title: "Cybersecurity Analyst",
    location: "Remote, US",
    arrangement: "remote",
    salaryMin: 90000,
    sourceUrl: "https://jobs.example.com/123",
  });
  const [url, options] = request.mock.calls[0]!;
  expect(url.origin + url.pathname).toBe("https://api.openwebninja.com/jsearch/search-v2");
  expect(url.searchParams.get("num_pages")).toBe("1");
  expect(url.searchParams.get("country")).toBe("us");
  expect(url.searchParams.get("query")).toBe('"security analyst" in United States');
  expect(url.searchParams.get("work_from_home")).toBe("true");
  expect(options.headers).toEqual({ "x-api-key": "test-key" });
  expect(options.redirect).toBe("error");
  expect(request).toHaveBeenCalledTimes(1);
});
it("does not invent location, remote status, annual pay, or missing application links", async () => {
  const request = vi.fn().mockResolvedValue(
    response([
      {
        ...row,
        job_country: null,
        job_location: null,
        job_is_remote: null,
        job_salary_period: "HOUR",
        job_min_salary: 45,
      },
      { ...row, job_id: "two", job_apply_link: "javascript:alert(1)", apply_options: [] },
      { ...row, job_id: "three", job_title: "Account Executive" },
      { ...row, job_id: "four", job_location: "Hybrid, US" },
    ]),
  );
  const jobs = await new JSearchJobProvider("test", "security analyst", request).collect();
  expect(jobs).toHaveLength(2);
  expect(jobs[0]).toMatchObject({ location: "", arrangement: "unknown", salaryMin: undefined });
  expect(jobs[1]?.arrangement).toBe("hybrid");
  expect(inferArrangement("Remote, US", "Hybrid cloud detection engineering")).toBe("remote");
  expect(inferArrangement("Remote, US", "Hybrid work schedule required")).toBe("hybrid");
});
it("rejects errors and malformed successes without logging API response bodies", async () => {
  for (const reply of [
    new Response("secret error detail", { status: 401 }),
    new Response(JSON.stringify({ status: "OK", data: [] })),
  ]) {
    await expect(
      new JSearchJobProvider("test", "soc analyst", vi.fn().mockResolvedValue(reply)).collect(),
    ).rejects.toThrow(/JSearch/);
  }
});

it("rejects commercial security roles while retaining technical operations titles", () => {
  for (const title of [
    "Enterprise Account Executive - Cybersecurity",
    "Security Sales Engineer",
    "Senior Product Manager, Secret Detection",
    "Director, Security Channels",
    "Principal Security Engineer",
    "GRC Manager",
    "Cybersecurity Intern",
    "Subject Matter Expert, GTM GRC - Revenue",
    "Product GRC Subject Matter Expert",
    "Senior Software Security Engineer",
    "Security Software Data Engineer I",
    "Senior Fullstack Software Engineer, GRC",
  ])
    expect(isRelevantTitle(title)).toBe(false);
  for (const title of [
    "Security Operations Center (SOC) Analyst",
    "Cybersecurity Analyst",
    "Senior Product Security Engineer",
    "Threat Hunting Intelligence Analyst",
    "GRC Analyst",
    "IT Risk Analyst",
    "Security Compliance Analyst",
    "Third-Party Risk Analyst",
    "IAM Analyst",
    "IT Auditor",
  ])
    expect(isRelevantTitle(title)).toBe(true);
});
