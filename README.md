# Furniture Engineering Agent Demo 1.0

Target platform: Google AI Studio Build Mode.

Proof chain:
Excel -> FES -> validation -> CAD-IR -> vector preview -> Three.js assembly -> exploded view -> Agent plan.

## Start
1. Copy/import project into Google AI Studio Build project.
2. `npm install`
3. Configure server secrets based on `.env.example`.
4. `npm run dev`
5. Upload your own workbook with `Product` and `Components` sheets.

## Workbook
Product columns: `key`, `value`.
Required keys:
- sku
- product_type
- overall_width
- overall_depth
- overall_height

Components columns:
`id,name,type,material,size_x,size_y,size_z,pos_x,pos_y,pos_z,explode_x,explode_y,explode_z`

## Acceptance
- Excel parsing works
- FES validates
- front CAD-IR works
- vector preview works
- 3D shows parts
- explosion slider works
- RouterHub/VectorEngine adapter can be selected
- provider HTML/errors do not crash JSON parsing
- API keys remain server-side

## ThorVG
Install target is `@thorvg/webcanvas`.
The current `CadCanvas.tsx` deliberately uses SVG as a fallback.
After ThorVG WASM is verified in the AI Studio environment, replace only this renderer.
