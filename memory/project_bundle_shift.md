---
name: Full shift to Bundle.social as publisher
description: Decision to route ALL platform publishing through Bundle.social, replacing direct Instagram/Facebook Graph API publishers
type: project
---

User decided to completely replace all direct platform publishers (Instagram Graph API, Facebook Graph API, and all stubs) with Bundle.social as the single unified publisher for every platform.

**Why:** Simpler architecture, one API key covers 14 platforms, no per-platform OAuth maintenance.

**How to apply:** When implementing the Bundle integration, do NOT keep the existing Instagram/Facebook direct publishers as the primary path. Bundle.social becomes the only publisher. Carousel images are still rendered locally by carousel_renderer.py, then uploaded to Bundle via its upload API before posting.
