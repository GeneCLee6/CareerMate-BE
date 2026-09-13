const {
    ROLES,
    FIELDS,
    ROLE_LABELS,
    FIELD_LABELS,
} = require("./profileOptions");
const { updateMeSchema } = require("./user.validation");

/**
 * Values already stored on real accounts. Removing or renaming one would make
 * those profiles fail validation the next time they are saved — a data
 * migration disguised as a tidy-up.
 */
const ALREADY_IN_USE = { roles: ["Student", "Other"], fields: ["FE", "BE"] };

describe("the options that already exist", () => {
    it("keeps every role that accounts may already hold", () => {
        for (const role of ALREADY_IN_USE.roles) {
            expect(ROLES).toContain(role);
        }
    });

    it("keeps every field that accounts may already hold", () => {
        for (const field of ALREADY_IN_USE.fields) {
            expect(FIELDS).toContain(field);
        }
    });

    it("still accepts a profile saved before the list grew", () => {
        const result = updateMeSchema.safeParse({
            fullName: "Ray",
            role: "Student",
            field: "FE",
        });
        expect(result.success).toBe(true);
    });
});

describe("the lists themselves", () => {
    it("has no duplicates", () => {
        expect(new Set(ROLES).size).toBe(ROLES.length);
        expect(new Set(FIELDS).size).toBe(FIELDS.length);
    });

    it("gives every value a label for the prompt", () => {
        // An unlabelled value reaches the model as a code like "QA" and makes
        // it guess; the fallback hides that rather than fixing it.
        for (const role of ROLES) {
            expect(ROLE_LABELS[role]).toBeTruthy();
        }
        for (const field of FIELDS) {
            expect(FIELD_LABELS[field]).toBeTruthy();
        }
    });

    it("has no label for a value that is not offered", () => {
        for (const key of Object.keys(ROLE_LABELS)) {
            expect(ROLES).toContain(key);
        }
        for (const key of Object.keys(FIELD_LABELS)) {
            expect(FIELDS).toContain(key);
        }
    });

    it("spells the labels out rather than passing codes through", () => {
        expect(FIELD_LABELS.FE).toBe("Frontend Development");
        expect(FIELD_LABELS.QA).toBe("QA and Testing");
        expect(ROLE_LABELS.CareerChanger).toBe("Changing career into tech");
    });
});

describe("validation follows the lists", () => {
    it("accepts each new role", () => {
        for (const role of ROLES) {
            const result = updateMeSchema.safeParse({ fullName: "Ray", role });
            expect(result.success).toBe(true);
        }
    });

    it("accepts each new field", () => {
        for (const field of FIELDS) {
            const result = updateMeSchema.safeParse({ fullName: "Ray", field });
            expect(result.success).toBe(true);
        }
    });

    it("still refuses something not on the list", () => {
        expect(
            updateMeSchema.safeParse({ fullName: "Ray", role: "Wizard" }).success
        ).toBe(false);
        expect(
            updateMeSchema.safeParse({ fullName: "Ray", field: "Blockchain" })
                .success
        ).toBe(false);
    });
});
