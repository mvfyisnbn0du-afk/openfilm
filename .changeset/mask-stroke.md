---
"openfilm": patch
---

Studio: a mask can have a stroke. In the inspector's Mask section, add one and pick its color, its width and where it lies against the mask's edge: inside, center or outside. It follows every shape, inverted ones too, scales with the clip or layer, and shows the same in the preview and the export. It is plain CSS: an SVG filter that draws the stroke, plus one mask layer for the part past the edge. A preview in Safari does not show it; the desktop app, Chrome and exports do.
