# solitaireonsigma

Source for a Solitaire app (Klondike, Spider, FreeCell) built as a Sigma application, with a shared leaderboard.

This repo holds the app source only. It has no `package.json` or build config; it relies on Sigma's app runtime (`@sigmacomputing/phi`, `@sigmacomputing/runtime`, and the `sigma:*` backend modules).

## Layout

- `config/endpoints.yaml` exposes the backend functions `recordWin` and `getLeaderboard`.
- `config/datasources/solitaire-leaderboard.yaml` is the leaderboard data source.
- `frontend/` is the React app (routes in `src/index.tsx`, one page per game, shared engine and persistence code in `src/lib`).
- `backend/src/leaderboard.ts` implements the two endpoints.

## Moving to another Sigma environment

`spec.source.id` in `config/datasources/solitaire-leaderboard.yaml` is the leaderboard table's internal ID in the original environment. In another environment, point it at an equivalent table with these columns:

| column | type |
| --- | --- |
| `ID` | text (primary key) |
| `user_id` | text |
| `user_name` | text |
| `score` | integer |
| `moves` | integer |
| `duration_seconds` | integer |
| `won` | boolean |
| `created_at` | datetime |
| `game_mode` | text |

Existing leaderboard rows do not move with the code.

## Provenance

Reconstructed from a text export of the app. The export contained two copies of `frontend/src/pages/Spider.tsx`; the first was truncated mid-file, so the second (complete) copy is used. The code has not been built or run since the split.
