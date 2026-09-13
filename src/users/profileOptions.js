/**
 * The values `role` and `field` may take.
 *
 * One list, used by the Mongoose enum, the zod schema and the AI prompt, so
 * adding an option cannot leave one of the three behind.
 *
 * **Existing values are never removed or renamed.** `Student`, `Other`, `FE`
 * and `BE` are already stored on real accounts; dropping one would make those
 * profiles fail validation on their next save, which is a data migration
 * disguised as a tidy-up. New options are added alongside them.
 */

/** Where someone is in their career. */
const ROLES = [
    "Student",
    "Graduate",
    "CareerChanger",
    "Professional",
    "Other",
];

/** What they work on. The short codes are the original two, kept as they were. */
const FIELDS = [
    "FE",
    "BE",
    "FullStack",
    "Mobile",
    "Data",
    "DevOps",
    "QA",
    "UIUX",
    "Other",
];

/**
 * Written out for the model. "FE" in a prompt is a guess the model has to
 * make; "Frontend Development" is not.
 */
const ROLE_LABELS = {
    Student: "Student",
    Graduate: "Recent graduate",
    CareerChanger: "Changing career into tech",
    Professional: "Working professional",
    Other: "Other",
};

const FIELD_LABELS = {
    FE: "Frontend Development",
    BE: "Backend Development",
    FullStack: "Full-stack Development",
    Mobile: "Mobile Development",
    Data: "Data and Machine Learning",
    DevOps: "DevOps and Cloud",
    QA: "QA and Testing",
    UIUX: "UI/UX Design",
    Other: "Other",
};

module.exports = { ROLES, FIELDS, ROLE_LABELS, FIELD_LABELS };
