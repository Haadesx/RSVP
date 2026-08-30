# Font provenance

Both faces are self-hosted rather than loaded from `fonts.googleapis.com`. Two reasons:
the product is local-first by principle, and a blocked or slow font request would hand a
first-time visitor the system-sans fallback — which is precisely the "sterile and cold"
result the design exists to avoid.

| File | Family | Source | License |
|---|---|---|---|
| `archivo-latin-var.woff2` | Archivo (variable, wght 100–900) | Google Fonts v25, latin subset — `https://fonts.gstatic.com/s/archivo/v25/k3kPo8UDI-1M0wlSV9XAw6lQkqWY8Q82sLydOxI.woff2` | SIL Open Font License 1.1 |
| `literata-latin-var.woff2` | Literata (variable, opsz 7–72, wght 200–900) | Google Fonts v40, latin subset — `https://fonts.gstatic.com/s/literata/v40/or3PQ6P12-iJxAIgLa78DkTtAoDhk0oVpaK3YLanFLHpPf2TbLi4J_HWTA.woff2` | SIL Open Font License 1.1 |

Retrieved 2026-08-30. Both are OFL, which permits redistribution and embedding in a
web application. Latin subset only; a non-latin document falls back to the stack in
`--sans` / `--text`.
