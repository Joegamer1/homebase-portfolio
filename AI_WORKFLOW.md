# How I built Homebase with AI

I used AI throughout the build to help write code, tests, collectors, and UI changes. I chose what the app should do, set the design and architecture requirements, reviewed the results, and tested it in my private environment.

I started with the home screen and worked through the integrations in stages. For each one, I decided what I needed to see or act on, connected the source, checked the data returned by the API, and worked on how it appeared in the interface. Loading states, failed requests, and stale data needed as much attention as the successful response.

A few decisions shaped the project:

- Provider credentials stay on the server. The browser uses the Homebase API.
- A failed integration keeps its last successful result and shows when that result was collected.
- Security advisories show when a version match still needs checking.
- Career Radar scores skill match and career advancement separately. It labels salary estimates.
- The home screen summarizes each area, with details available in its workspace.

I checked changes with automated tests and by using the app. The code here is the result of that process. Private prompts, credentials, and deployment logs aren't included.
