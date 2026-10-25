# Cloudflare migration

The repository keeps its Quartz static build and adds a Node publisher and a Workers SSR entry.
LiveSync Bridge runs separately, decrypts the publishing folder, and supplies a local mirror.
The publisher is the only component that compiles Markdown or writes production content.

Implementation commits:

1. Versioned artifact contracts, durable local state, dependency planning.
2. Reusable layout/rendering boundary and incremental Quartz compiler.
3. Cloudflare upload, transactional release activation, publisher commands.
4. Workers SSR, versioned assets, routing and cache behavior.
5. Bridge/container deployment, operation guide and integration validation.

R2 objects are immutable and content addressed. Each D1 release has a complete metadata snapshot.
The active release pointer changes only after all its objects and database rows exist.
The Worker pins a release for each request. Failed builds leave the previous release active.
