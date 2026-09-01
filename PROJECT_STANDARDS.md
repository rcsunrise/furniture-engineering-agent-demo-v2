# PROJECT_STANDARDS

1. App.tsx only orchestrates UI. Put Excel, CAD, 3D, AI logic in modules.
2. Never expose VectorEngine or RouterHub API keys to browser code.
3. All engineering dimensions use millimetres.
4. LLM output is advisory; deterministic code owns numeric geometry.
5. The model must report missing dimensions; never invent production dimensions.
6. FES is the source-of-truth schema.
7. CAD-IR is renderer independent. ThorVG is a rendering adapter, not the geometry database.
8. Three.js consumes Assembly data; it never parses Excel directly.
9. Third-party Skills never receive DB/provider secrets.
10. Provider differences live only in src/server/ai.
11. Every engineering operation returns validation status.
12. Demo 1.0 scope: Excel/CSV -> FES -> front CAD -> 3D boxes -> exploded slider -> Agent plan.
