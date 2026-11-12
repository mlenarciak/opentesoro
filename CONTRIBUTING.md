# Contributing

Use Bun 1.3.13+. Run `bun install`, `bun run check`, then relevant browser checks. Keep `bun.lock` committed and use synthetic data.

The dependency-free engine owns financial semantics; adapters must reuse those rules. Keep signed integer minor units and ISO calendar dates at boundaries. Show relevant financial invariants with tests, particularly settlement conservation, snapshot cutoffs, schedule ownership and transfer handling.

Keep the feature matrix and API documentation honest. A mocked provider test does not establish live provider support. Add external services behind explicit connectors; never require a cloud account to run the basic product. Do not include business credentials, customer records, bank exports or screenshots of private accounts in issues or pull requests.

shadcn/ui components are stored in the repository. Preserve accessible labels and dialog titles, semantic tokens and keyboard behavior. Add browser checks for meaningful user workflows.
