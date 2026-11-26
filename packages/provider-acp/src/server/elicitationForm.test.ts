import { assert, describe, it } from "@effect/vitest";

import * as Effect from "effect/Effect";
import { projectAcpElicitationForm, withOptionalChoices } from "./elicitation.ts";

describe("projectAcpElicitationForm", () => {
  for (const type of ["string", "array"] as const) {
    it.effect.each([
      { values: [" padded ", "", "plain"], labels: ["padded", '""', "plain"] },
      { values: [" a", "a", "b"], labels: ['" a"', '"a"', "b"] },
      { values: [" a", "a", '"a"'], labels: ['" a"', '"a"', '"\\"a\\""'] },
    ])(
      `preserves ${type} enum values with distinct readable labels: $values`,
      ({ values, labels }) =>
        Effect.gen(function* () {
          const form = projectAcpElicitationForm(
            {
              type: "object",
              properties: {
                answer:
                  type === "array"
                    ? { type, items: { type: "string", enum: values } }
                    : { type, enum: values },
              },
              required: ["answer"],
            },
            "Choose",
          );
          assert(form !== undefined);
          const question = form.questions[0];
          assert(question !== undefined);
          assert.deepStrictEqual(
            question.options.map((option) => option.label),
            labels,
          );
          assert.deepStrictEqual(
            question.options.map((option) => option.value),
            values,
          );
          assert.strictEqual(question.allowCustomAnswer, false);
          assert.strictEqual(question.multiSelect, type === "array" ? true : undefined);
          for (const value of values) {
            const answer = type === "array" ? [value] : value;
            assert.deepStrictEqual(yield* form.convertAnswers({ answer }), { answer });
          }
        }),
    );
  }

  it.effect("accepts typed single choices only when the agent advertises allowOther", () =>
    Effect.gen(function* () {
      const schema = {
        type: "object",
        properties: {
          answer: { type: "string", enum: ["Yes", "No"] },
          many: { type: "array", items: { type: "string", enum: ["Yes", "No"] } },
        },
        required: ["answer"],
      };
      const strict = projectAcpElicitationForm(schema, "Choose")!;
      assert.strictEqual(
        (yield* Effect.result(strict.convertAnswers({ answer: "Maybe" })))._tag,
        "Failure",
      );
      const form = projectAcpElicitationForm(schema, "Choose", { allowOther: true })!;
      assert.strictEqual(form.questions[0]?.allowCustomAnswer, true);
      assert.strictEqual(form.questions[1]?.allowCustomAnswer, false);
      assert.deepStrictEqual(yield* form.convertAnswers({ answer: "Maybe" }), { answer: "Maybe" });
      assert.strictEqual(
        (yield* Effect.result(form.convertAnswers({ answer: "" })))._tag,
        "Failure",
      );
      assert.strictEqual(
        (yield* Effect.result(form.convertAnswers({ answer: "Yes", many: ["Maybe"] })))._tag,
        "Failure",
      );
    }),
  );

  it.effect("asks each question once when a choice has a free-text companion field", () =>
    Effect.gen(function* () {
      // OMP's ask dialog follows each choice `q<n>` with a free-text `q<n>__other` field.
      const ask = (question: string, header: string) => ({
        type: "string",
        title: question,
        description: header,
        oneOf: [
          { const: "Yes", title: "Yes" },
          { const: "No", title: "No" },
        ],
      });
      const form = projectAcpElicitationForm(
        {
          type: "object",
          properties: {
            q0: ask("Use Postgres for the new service?", "Database"),
            q0__other: { type: "string", title: "Other (type your own)" },
            q1: ask("Deploy to staging first?", "Deploy"),
            q1__other: { type: "string", title: "Other (type your own)" },
          },
        },
        "Answer 2 questions",
      );
      assert(form !== undefined);
      assert.deepStrictEqual(
        form.questions.map((question) =>
          [question.header, question.question].some((text) => text.endsWith("?")),
        ),
        [true, true],
      );
      assert.deepStrictEqual(yield* form.convertAnswers({ q0: "Yes", q1: "Only on Fridays" }), {
        q0: "Yes",
        q1__other: "Only on Fridays",
      });

      // A multi-select answer can carry options and free text together, so both fields stay.
      const multi = projectAcpElicitationForm(
        {
          type: "object",
          properties: {
            q0: { type: "array", title: "Databases?", items: { anyOf: [{ const: "Postgres" }] } },
            q0__other: { type: "string", title: "Other (type your own)" },
          },
        },
        "Databases?",
      );
      assert(multi !== undefined);
      assert.deepStrictEqual(
        multi.questions.map((question) => [question.id, question.required]),
        [
          ["q0", false],
          ["q0__other", false],
        ],
      );
      assert.deepStrictEqual(
        yield* multi.convertAnswers({ q0: ["Postgres"], q0__other: "SQLite" }),
        { q0: ["Postgres"], q0__other: "SQLite" },
      );
    }),
  );
  it.effect("requires a selection only for a required multi-select with a minimum", () =>
    Effect.gen(function* () {
      const items = { type: "string", enum: ["web", "mobile"] };
      const form = projectAcpElicitationForm(
        {
          type: "object",
          properties: {
            targets: { type: "array", minItems: 1, items },
            extras: { type: "array", items },
            platforms: { type: "array", minItems: 1, items },
          },
          required: ["targets", "extras"],
        },
        "Choose",
      );
      assert(form !== undefined);
      assert.deepStrictEqual(
        form.questions.map(({ id, required }) => [id, required]),
        [
          ["targets", true],
          ["extras", false],
          ["platforms", false],
        ],
      );
      assert.deepStrictEqual(
        yield* form.convertAnswers({ targets: ["web"], extras: [], platforms: [] }),
        { targets: ["web"], extras: [] },
      );
    }),
  );
});

describe("withOptionalChoices", () => {
  const choice = (id: string) => ({
    id,
    header: id,
    question: id,
    options: [{ label: "Fast", description: "Fast", value: "fast" }],
  });
  const form = withOptionalChoices(
    {
      questions: [
        choice("mode"),
        choice("tier"),
        { ...choice("tags"), multiSelect: true },
        { ...choice("notes"), options: [] },
      ],
      respond: (answers) => ({ action: "accept", content: { answered: Object.keys(answers) } }),
    },
    {
      type: "object",
      properties: {
        mode: { type: "string" },
        tier: { type: "string" },
        tags: { type: "array" },
        notes: { type: "string" },
      },
      required: ["tier"],
    },
  );

  it("marks only the single choices the schema leaves optional", () => {
    assert.deepStrictEqual(
      form.questions.map((question) => [question.id, question.required]),
      [
        ["mode", false],
        ["tier", undefined],
        ["tags", undefined],
        ["notes", undefined],
      ],
    );
  });

  it("answers without a skipped choice and cancels without a required one", () => {
    assert.deepStrictEqual(form.respond({ tier: "fast" }), {
      action: "accept",
      content: { answered: ["tier"] },
    });
    assert.deepStrictEqual(form.respond({ mode: "fast" }), { action: "cancel" });
  });
});
