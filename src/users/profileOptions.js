/**
 * The values `role` and `field` may take.
 *
 * One list, used by the Mongoose enum, the zod schema and the AI prompt, so
 * adding an option cannot leave one of the three behind.
 *
 * The codes are the words themselves — `Frontend`, not `FE`. A stored value
 * that reads as English is worth more than four saved characters: it is what
 * shows up in a database dump, a log line and a support conversation, and it
 * needs no key to understand.
 *
 * Renaming them is a data migration, not a tidy-up. `LEGACY_CODES` below and
 * `npm run migrate:profile-codes` are the two halves of doing it safely.
 */

/** Where someone is in their career. */
const ROLES = [
    "Student",
    "Graduate",
    "Bootcamp",
    "SelfTaught",
    "CareerChanger",
    "Professional",
    "Other",
];

/** What they work on. */
const FIELDS = [
    "Frontend",
    "Backend",
    "FullStack",
    "Mobile",
    "DataScience",
    "MachineLearning",
    "DevOps",
    "Cloud",
    "QA",
    "Security",
    "Design",
    "ProductManagement",
    "Other",
];

/**
 * Codes that were stored before the rename, and what they became.
 *
 * Kept indefinitely, and applied on the way in. The migration updates the
 * database, but a browser holding a cached bundle will keep sending the old
 * code for as long as that tab is open — rejecting it would turn "we renamed
 * a constant" into a 400 for a user who did nothing wrong.
 */
const LEGACY_CODES = {
    FE: "Frontend",
    BE: "Backend",
    UIUX: "Design",
    Data: "DataScience",
};

/** Maps a legacy code to its current one, leaving anything else untouched. */
function normaliseCode(value) {
    if (typeof value !== "string") return value;
    return LEGACY_CODES[value] ?? value;
}

/**
 * Written out for the model. "QA" in a prompt is a guess the model has to
 * make; "QA and Testing" is not.
 */
const ROLE_LABELS = {
    Student: "Student",
    Graduate: "Recent graduate",
    Bootcamp: "Bootcamp graduate",
    SelfTaught: "Self-taught developer",
    CareerChanger: "Changing career into tech",
    Professional: "Working professional",
    Other: "Other",
};

const FIELD_LABELS = {
    Frontend: "Frontend Development",
    Backend: "Backend Development",
    FullStack: "Full-stack Development",
    Mobile: "Mobile Development",
    DataScience: "Data Science and Analytics",
    MachineLearning: "Machine Learning and AI",
    DevOps: "DevOps and Infrastructure",
    Cloud: "Cloud Engineering",
    QA: "QA and Testing",
    Security: "Security Engineering",
    Design: "UI/UX Design",
    ProductManagement: "Product Management",
    Other: "Other",
};

module.exports = {
    ROLES,
    FIELDS,
    ROLE_LABELS,
    FIELD_LABELS,
    LEGACY_CODES,
    normaliseCode,
};
