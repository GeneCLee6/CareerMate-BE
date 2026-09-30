/**
 * The synthetic resumes to generate: who each applicant is, and which
 * problems from the taxonomy are planted in their resume.
 *
 * Fixed rather than random, so a regenerated dataset has the same shape.
 * Every issue is planted three or four times across the set, so no problem
 * is measured on one or two resumes, and the counts of planted issues vary
 * (two, three or four) so recall is not measured on one difficulty alone.
 */
const PLAN = [
    { id: "r01", targetRole: "Junior Frontend Developer", location: "Melbourne", background: "international student who has just finished a Master of IT", issues: ["no-metrics", "missing-local-context"] },
    { id: "r02", targetRole: "Junior Backend Developer", location: "Sydney", background: "coding bootcamp graduate with one short contract", issues: ["duties-not-achievements", "unsupported-skills"] },
    { id: "r03", targetRole: "Graduate Full-stack Developer", location: "Brisbane", background: "former high-school teacher changing careers", issues: ["irrelevant-content", "generic-summary"] },
    { id: "r04", targetRole: "Junior Data Analyst", location: "Perth", background: "recent Bachelor of Science graduate", issues: ["spelling-grammar", "unexplained-dates"] },
    { id: "r05", targetRole: "Junior QA Engineer", location: "Adelaide", background: "self-taught tester with freelance projects", issues: ["missing-links", "too-long", "no-metrics"] },
    { id: "r06", targetRole: "Graduate DevOps Engineer", location: "Canberra", background: "recent Bachelor of Computer Science graduate", issues: ["unsupported-skills", "spelling-grammar", "missing-local-context"] },
    { id: "r07", targetRole: "Junior Mobile Developer", location: "Melbourne", background: "bootcamp graduate who built two apps", issues: ["generic-summary", "duties-not-achievements", "unexplained-dates"] },
    { id: "r08", targetRole: "Junior Frontend Developer", location: "Sydney", background: "former retail store manager changing careers", issues: ["irrelevant-content", "missing-links", "no-metrics"] },
    { id: "r09", targetRole: "Junior Backend Developer", location: "Melbourne", background: "international student with a part-time IT support job", issues: ["missing-local-context", "too-long", "duties-not-achievements", "generic-summary"] },
    { id: "r10", targetRole: "Graduate Full-stack Developer", location: "Brisbane", background: "recent Bachelor of IT graduate with an internship", issues: ["unexplained-dates", "unsupported-skills", "spelling-grammar", "missing-links"] },
    { id: "r11", targetRole: "Junior Machine Learning Engineer", location: "Sydney", background: "Master of Data Science graduate", issues: ["no-metrics", "irrelevant-content", "too-long", "missing-local-context"] },
    { id: "r12", targetRole: "Junior Frontend Developer", location: "Perth", background: "self-taught developer who worked in hospitality", issues: ["duties-not-achievements", "generic-summary", "missing-links", "unexplained-dates"] },
];

module.exports = { PLAN };
