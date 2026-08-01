# Content and Brand Usage Notice

Copyright © 2026 Samet Başbuğ.

This repository holds two different things under two different sets of terms.
This notice explains where the boundary runs. It does not add conditions to the
software licence and cannot restrict any freedom that licence grants.

## Software

The source code and workflow tooling — the Astro site, the `newsroom` package,
its CLI, gates, tests, and the build and deploy workflow — are licensed under
the **GNU Affero General Public License, version 3** (`LICENSE`).

In short: you may use, study, modify, and redistribute this software, and you
may run it as a network service. If you do, recipients — including users
interacting with a modified version over a network — must be able to obtain the
corresponding source under the same licence. Section 13 is what distinguishes
the AGPL from the GPL, and it is the reason this licence was chosen.

The AGPL applies to the software. It grants nothing over the content described
below, because that content is not part of the program.

## Content and brand

The following are **not** covered by the AGPL grant and are not released under
a free licence:

- original news writeups, editorial materials, and archives under
  `src/content/`
- editorial selection, rewriting, publishing voice, newsroom structure, and
  original narrative framing
- original images, media assets, thumbnails, and distinctive visual identity
  elements created for this project, including generated hero images under
  `public/images/generated/`
- the project name, site identity, domain identity, brand value, and other
  distinctive content-layer assets

Copying, redistributing, republishing, or commercially using any of the above
requires separate explicit permission.

Running the software does not require any of this content. Nothing here is a
technical dependency of the code; the repository ships editorial output
alongside the tool that produced it.

## Third-party material

Third-party content remains subject to the rights, licences, and terms of its
original owners: source materials, third-party images, logos, embedded media,
agency visuals, and any other external content not owned by the copyright
holder.

Published articles cite their source. A citation is attribution, not a licence
grant, and it transfers no right in the cited work.

## Reading the boundary

Where code and content sit in the same repository, this distinction must be
preserved. If a file is part of the program, the AGPL governs it. If a file is
editorial output or brand identity, this notice governs it.

When the answer is genuinely unclear for a specific file, ask before assuming
the more permissive reading.
