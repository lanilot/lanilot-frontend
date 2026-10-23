# Project conventions

- Include useful demo seed data by default whenever adding a feature. Cover its main states and interactions so the app is populated immediately after startup.
- Keep the startup seed additive and idempotent. Use stable fixture IDs; preserve existing user edits, statuses, read markers, and records. Never reset the database as part of normal startup.
- Keep simulated loads, broker replies, and local-only message sending clearly identified as demo behavior.
- Keep interface copy minimal: short labels, essential numbers and statuses. Avoid repeated page descriptions, technical implementation details and explanatory paragraphs. Put optional instructions behind a help disclosure; retain actionable errors and material confirmation details.
