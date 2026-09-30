/**
 * The resume problems the resume-review eval checks for.
 *
 * Each synthetic test resume is written with two to four of these planted in
 * it, and the eval asks one question per planted issue: did the review find
 * it? So each entry has to be precise enough that the judge and a human
 * reading the same review reach the same answer — which is why every entry
 * says what does *not* count as well as what does.
 *
 * The list is aimed at junior developers applying for roles in Australia.
 * Choosing what belongs on it is a product decision: it defines what "a good
 * resume review" means for CareerMate. Owner-approved on 2026-09-30.
 *
 * Ids are permanent. Add new issues at the end; never rename or reuse an id,
 * or old datasets and results stop meaning what they said.
 */
const ISSUES = [
    {
        id: "no-metrics",
        name: "Achievements without numbers",
        definition:
            "An achievement is claimed but not measured, where a number (time, size, percentage, users, count) would make it credible.",
        example: "Improved the performance of the company website.",
        fix: "Cut the home page load time from 4.1 s to 1.6 s by lazy-loading images and splitting the bundle.",
        doesNotCount:
            "Bullets that describe a responsibility rather than claim a result (that is duties-not-achievements), or results that are hard to quantify and are described concretely instead.",
    },
    {
        id: "duties-not-achievements",
        name: "Duties instead of achievements",
        definition:
            "Experience bullets list what the job involved rather than what the person did or changed.",
        example: "Responsible for writing REST APIs and attending stand-ups.",
        fix: "Built the order-history API used by the mobile app, and cut its error rate by adding input validation.",
        doesNotCount:
            "A single context-setting line at the top of a role, followed by achievement bullets.",
    },
    {
        id: "unsupported-skills",
        name: "Skills listed without evidence",
        definition:
            "A skill in the skills section appears nowhere in the experience, projects or education, so nothing shows it was used.",
        example: "Skills: React, Docker, AWS, Kubernetes — with no role or project mentioning Docker, AWS or Kubernetes.",
        fix: "Either show where each skill was used, or remove the ones that were not.",
        doesNotCount:
            "Widely assumed basics (Git, HTML/CSS) that are not backed by a specific bullet.",
    },
    {
        id: "generic-summary",
        name: "Generic summary",
        definition:
            "The summary or objective is made of adjectives that could describe anyone, and says nothing about the person's skills, experience or target role.",
        example: "Passionate, hard-working team player with a strong desire to learn and grow.",
        fix: "Junior frontend developer with two shipped React apps and six months of agency experience, looking for a graduate role in Melbourne.",
        doesNotCount: "A resume with no summary at all.",
    },
    {
        id: "unexplained-dates",
        name: "Conflicting dates or unexplained gaps",
        definition:
            "Dates overlap in a way that does not make sense, run in the wrong order, or leave a gap of about a year or more with no explanation.",
        example: "Two full-time roles from 03/2024 to 11/2024, or nothing between 06/2022 and 09/2023.",
        fix: "Correct the dates, note concurrent roles as part-time, and give a gap one line (study, travel, caring, visa).",
        doesNotCount:
            "Gaps of a few months, or concurrent part-time work and study that the resume labels as such.",
    },
    {
        id: "missing-links",
        name: "Projects without links",
        definition:
            "Projects are described but none of them links to code or a live version, so an employer cannot check them.",
        example: "Three portfolio projects listed with no GitHub or demo URL.",
        fix: "Link each project's repository and, where possible, a deployed version.",
        doesNotCount:
            "Employer or client work that is private, when the resume says so.",
    },
    {
        id: "irrelevant-content",
        name: "Too much irrelevant content",
        definition:
            "A large share of the resume is spent on material unrelated to the target role, crowding out relevant experience.",
        example: "Half a page on hospitality duties in a resume for a frontend role, with projects squeezed to two lines.",
        fix: "Keep unrelated jobs to one line each, or a short 'Other experience' list, and give the space to relevant work.",
        doesNotCount:
            "Unrelated jobs mentioned briefly, or transferable skills from them tied explicitly to the target role.",
    },
    {
        id: "missing-local-context",
        name: "Missing Australian job-search basics",
        definition:
            "The resume leaves out what Australian employers screen for first: the city or region the person is in or will work in, and their right to work (citizenship, permanent residency, or visa and its work conditions).",
        example: "No location anywhere, and no mention of work rights, for someone on a graduate visa.",
        fix: "Add the city to the header and a line such as 'Full working rights (Temporary Graduate visa, valid to 2028)'.",
        doesNotCount:
            "Citizens or permanent residents who state their location but not their status; stating it is still advisable but not required.",
    },
    {
        id: "spelling-grammar",
        name: "Spelling and grammar mistakes",
        definition:
            "Misspellings (including of technology names), wrong words, or inconsistent tense that a careful reader would notice.",
        example: "Javasript, Postgress, 'lead the migration' for a past role, a mix of past and present tense in one role.",
        fix: "Spell technology names as their owners do, and use past tense for past roles.",
        doesNotCount:
            "Consistent Australian or American spelling, or stylistic choices such as omitting pronouns.",
    },
    {
        id: "too-long",
        name: "Too long for a junior role",
        definition:
            "The resume runs well past two pages, or pads length with detail a junior applicant does not need.",
        example: "Four pages for a graduate role, including every university assignment.",
        fix: "Cut to two pages: most recent and most relevant first, older detail condensed or removed.",
        doesNotCount: "A full two pages for someone with several relevant roles.",
    },
];

const ISSUE_IDS = ISSUES.map((issue) => issue.id);

module.exports = { ISSUES, ISSUE_IDS };
