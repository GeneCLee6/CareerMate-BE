const {
    ROLES,
    FIELDS,
    ROLE_LABELS,
    FIELD_LABELS,
    LEGACY_CODES,
    normaliseCode,
} = require("./profileOptions");
const { updateMeSchema } = require("./user.validation");

/**
 * Codes that were stored before the rename. They must keep translating, not
 * validating: the database has been migrated, but a browser holding a cached
 * bundle keeps sending the old value until that tab is closed.
 */
const RENAMED = { FE: "Frontend", BE: "Backend" };

describe("codes that were renamed", () => {
    it("translates each one to its current name", () => {
        for (const [from, to] of Object.entries(RENAMED)) {
            expect(normaliseCode(from)).toBe(to);
        }
    });

    it("every legacy code points at a value that exists", () => {
        for (const to of Object.values(LEGACY_CODES)) {
            expect([...ROLES, ...FIELDS]).toContain(to);
        }
    });

    it("leaves a current code alone", () => {
        expect(normaliseCode("Frontend")).toBe("Frontend");
        expect(normaliseCode("Student")).toBe("Student");
    });

    it("leaves something unknown alone, so validation still refuses it", () => {
        expect(normaliseCode("Blockchain")).toBe("Blockchain");
    });

    it("tolerates a non-string", () => {
        expect(normaliseCode(undefined)).toBeUndefined();
        expect(normaliseCode(null)).toBeNull();
    });

    it("accepts a legacy code through the schema, stored as the new one", () => {
        const result = updateMeSchema.safeParse({ fullName: "Ray", field: "FE" });
        expect(result.success).toBe(true);
        expect(result.data.field).toBe("Frontend");
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
        expect(FIELD_LABELS.Frontend).toBe("Frontend Development");
        expect(FIELD_LABELS.QA).toBe("QA and Testing");
        expect(ROLE_LABELS.CareerChanger).toBe("Changing career into tech");
    });

    it("uses words as codes, not abbreviations", () => {
        // A stored value ends up in database dumps, logs and support
        // conversations; it should not need a key to read.
        expect(FIELDS).toContain("Frontend");
        expect(FIELDS).not.toContain("FE");
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
