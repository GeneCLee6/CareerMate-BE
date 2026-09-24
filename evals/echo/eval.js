/**
 * A demonstration eval that calls no API and costs nothing. It proves the
 * harness end to end — dataset, configurations, outputs, scores, summary,
 * results file — before any money is spent on a real one.
 *
 * The "system under test" changes the case of a phrase. The dataset expects
 * upper case, so `upper` should score 1 and `lower` 0: a comparison with a
 * known answer, which is exactly what a first eval should check.
 */
const cases = require("../datasets/echo/cases.json");

module.exports = {
    description: "Changes the case of a phrase; checks the harness itself.",

    loadCases: () => cases,

    configs: {
        upper: { transform: "upper" },
        lower: { transform: "lower" },
    },

    run: (testCase, config) =>
        config.transform === "upper"
            ? testCase.input.toUpperCase()
            : testCase.input.toLowerCase(),

    score: (testCase, output) => ({
        exact: output === testCase.expected ? 1 : 0,
        length: output.length === testCase.expected.length ? 1 : 0,
    }),
};
