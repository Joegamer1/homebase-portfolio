export interface CareerSalaryEstimate {
  salaryMin: number;
  salaryMax: number;
  salaryCurrency: string;
  source: string;
}

type Json = Record<string, unknown>;
const object = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

const amount = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 10_000 && value <= 2_000_000
    ? Math.round(value)
    : undefined;

/** A salary estimate is market context, never compensation published by the employer. */
export class JobSalaryProvider {
  constructor(
    private readonly apiKey: string,
    private readonly request = fetch,
    private readonly timeoutMs = 30_000,
  ) {}

  async estimate(title: string): Promise<CareerSalaryEstimate | undefined> {
    const url = new URL("https://api.openwebninja.com/job-salary-data/job-salary");
    url.search = new URLSearchParams({
      job_title: title,
      location: "United States",
      location_type: "COUNTRY",
      years_of_experience: "ALL",
    }).toString();
    const response = await this.request(url, {
      headers: { "x-api-key": this.apiKey },
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`Job Salary Data returned HTTP ${response.status}`);
    const payload = object(await response.json());
    if (payload.status !== "OK" || !Array.isArray(payload.data)) throw new Error("Invalid Job Salary Data response");
    return payload.data.flatMap((value) => {
      const row = object(value);
      const salaryMin = amount(row.min_salary);
      const salaryMax = amount(row.max_salary);
      const currency = typeof row.salary_currency === "string" ? row.salary_currency.toUpperCase() : "";
      const period = typeof row.salary_period === "string" ? row.salary_period : "";
      if (!salaryMin || !salaryMax || salaryMin > salaryMax || currency !== "USD" || !/^(?:YEAR|YEARLY)$/i.test(period))
        return [];
      return [
        {
          salaryMin,
          salaryMax,
          salaryCurrency: currency,
          source:
            typeof row.publisher_name === "string" && row.publisher_name.trim()
              ? row.publisher_name.trim()
              : "Market estimate",
        },
      ];
    })[0];
  }
}
