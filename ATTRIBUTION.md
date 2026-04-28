# Attribution

Arthas is a hard-fork of [sst/opencode](https://github.com/sst/opencode), licensed under MIT.

The upstream `opencode` repository remains the source of much of the agent loop, MCP integration, plugin system, multi-provider router, OpenTUI rendering, and overall harness scaffolding. Arthas builds knight-themed branding, cross-device sync, heavy observability, and local-compute routing on top of that foundation.

Upstream is tracked locally at `git remote upstream` (https://github.com/sst/opencode). Updates can be pulled with:

```bash
git fetch upstream
git merge upstream/dev   # opencode's default branch is `dev`
```

The full opencode history is preserved in this repository's git log. Original opencode contributors retain authorship on commits prior to the fork point. New work added in Arthas is attributed to its respective authors.

## License

Both Arthas and opencode are MIT-licensed. The upstream opencode copyright notice (Copyright (c) 2025 opencode) is retained in [LICENSE](./LICENSE). Arthas-specific contributions are added under the same MIT license.

## Thanks

Big thanks to the [SST](https://sst.dev) team and the opencode contributors for building a serious open-source agent harness. Without them, Arthas would be a 6-month project instead of a 6-week one.
