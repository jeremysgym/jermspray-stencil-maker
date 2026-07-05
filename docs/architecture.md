# JermSpray Stencil Maker V2

## Vision

Build the world's best stencil generation engine.

The goal is not simply to convert images into SVGs, but to produce
professional-quality stencils optimized for:

- Cricut
- Silhouette
- Laser cutters
- CNC routers
- Printable stencils

The engine should be modular, testable, and independent of the UI.

---

# Engine Pipeline

Image

↓

Image Processing

↓

SVG Parsing

↓

Geometry Analysis

↓

Hole Detection

↓

Bridge Planning

↓

Bridge Rendering

↓

Layer Generation

↓

Validation

↓

SVG Export

↓

ZIP Export

---

# Design Principles

• Never manipulate SVG with regex.

• Parse once.

• Work with objects.

• Export once.

• Every module has one responsibility.

• Every module can be unit tested.

• Geometry should never know about React.

• React should never know geometry internals.

---

# Folder Structure

src/lib/stencil-v2

parser/

geometry/

layers/

exporter/

validation/

---

# Future Features

Automatic bridge placement

Multi-layer stencils

Registration marks

Paint bleed compensation

Material presets

Laser cutter export

CNC export

AI simplification

Cloud project saving

Professional print layouts

Commercial licensing
