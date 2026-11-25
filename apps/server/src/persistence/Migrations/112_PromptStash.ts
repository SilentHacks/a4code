import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE prompt_stash (
      position INTEGER PRIMARY KEY,
      id TEXT NOT NULL UNIQUE,
      entry_json TEXT NOT NULL
    )
  `;
});
