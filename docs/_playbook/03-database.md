# 03 — Database Selection

> **Output of this phase:** a filled [`templates/schema-canvas.md`](./templates/schema-canvas.md) and an ADR naming the primary store plus any specialist stores.

## Why this phase exists

Database is the single hardest decision to reverse. Migrating later costs weeks to months of real engineering time and risk. Think in **access patterns** first, not tables — the queries your app will actually run drive the choice.

**Default mantra:** _Postgres first. Add a specialist store (vector, time-series, graph, cache) only when an access pattern demands it._ Postgres handles relational + JSON + full-text + vector (pgvector) + queue (LISTEN/NOTIFY) well enough to be the single store for most projects under 10M rows.

## Questions to ask yourself

### Data shape

- [ ] Is the data primarily **relational** (entities with foreign keys, joins)?
- [ ] Primarily **document** (nested JSON, variable schema per record)?
- [ ] Primarily **graph** (many-to-many with path queries)?
- [ ] **Vector** (embeddings for similarity search)?
- [ ] **Time-series** (metrics, events, append-only by timestamp)?
- [ ] **Key-value** (simple get/set, cache-like)?

### Access patterns (fill the canvas before picking)

- [ ] For each query your app actually runs: Is it by primary key? By secondary index? Full-text? Nearest-neighbor? Range scan? Aggregation?
- [ ] Read-heavy or write-heavy per pattern?
- [ ] Latency budget per pattern (<10ms cache? <200ms search? <1s analytics?)
- [ ] Concurrency: how many clients writing the same row?

### Consistency & transactions

- [ ] Do you need **multi-row transactions**? (Most SaaS: yes.)
- [ ] Strong read-after-write consistency, or is eventual OK?
- [ ] Any global-scale requirement that forces eventual (multi-region active-active)?

### Scale & cost

- [ ] Rows at Year-1? Storage at Year-1? (Capacity-plan table in the canvas.)
- [ ] QPS peak read and write?
- [ ] Budget envelope — managed ($$) vs self-hosted ($) vs serverless ($$$ at scale)?
- [ ] Multi-region: need it V1? (Usually no.)

### Operational

- [ ] Backup + PITR requirements?
- [ ] Who runs it — managed service (RDS, Supabase, Neon, Planetscale, Mongo Atlas) or self-host?
- [ ] Team familiarity with the engine?

## Decision tree

```mermaid
flowchart TD
    Start[DB choice] --> Q1{Fill the Schema Canvas<br/>— access patterns listed?}
    Q1 -- No --> Back[Do that first.<br/>You can't pick a DB<br/>without access patterns.]
    Q1 -- Yes --> Q2{Is data<br/>relational with joins<br/>+ ACID needs?}

    Q2 -- Yes --> PG[Postgres<br/>managed: Supabase / Neon / RDS<br/>✔ JSONB for flexibility<br/>✔ pgvector for embeddings<br/>✔ full-text search built-in]

    Q2 -- No --> Q3{Heavily nested<br/>documents, schemaless,<br/>or massive single-collection?}
    Q3 -- Yes --> Mongo[MongoDB Atlas<br/>or DynamoDB if AWS-native<br/>✔ flexible schema<br/>✘ joins / transactions harder]

    Q3 -- No --> Q4{Graph queries<br/>paths, cycles,<br/>recommendations?}
    Q4 -- Yes --> Graph[Neo4j / Memgraph<br/>or PG + ltree for simple trees<br/>✔ purpose-built for traversal]

    Q4 -- No --> Q5{Append-only<br/>time-series / metrics<br/>/ event stream?}
    Q5 -- Yes --> TS[TimescaleDB PG extension<br/>or ClickHouse for analytics<br/>or InfluxDB<br/>✔ compression + time-range queries]

    Q5 -- No --> Q6{Pure KV<br/>cache / session / counter?}
    Q6 -- Yes --> KV[Redis / Memcached / DynamoDB<br/>never as primary store<br/>unless truly KV-shaped]

    PG --> Vector{Also need<br/>vector search?}
    Mongo --> Vector
    Graph --> Vector
    TS --> Vector

    Vector -- No --> Cache{Need a cache?}
    Vector -- Yes < 10M vectors --> PGVec[Stay in Postgres:<br/>pgvector<br/>one less system to run]
    Vector -- Yes ≥ 10M vectors<br/>or sub-50ms --> Spec[Dedicated:<br/>Qdrant / Weaviate / Pinecone]

    PGVec --> Cache
    Spec --> Cache

    Cache -- No --> Done
    Cache -- Yes --> Redis[Add Redis<br/>sessions, rate limits, job queue]
    Redis --> Done([Fill Schema Canvas + DB ADR.<br/>Proceed to 04-frontend-stack.md])

    style Done fill:#d4edda,stroke:#28a745
    style PG fill:#d1ecf1,stroke:#0c5460
```

## Reference cheat sheet

| Shape                      | Default pick                                                                                      | When to go specialist                             |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Relational + ACID          | **Postgres (managed)**                                                                            | Never without a strong reason                     |
| Document / flexible schema | Postgres + JSONB                                                                                  | True scale-out needed → Mongo/DynamoDB            |
| Vector / similarity        | pgvector in Postgres                                                                              | >10M vectors OR <50ms p95 → Qdrant/Pinecone       |
| Time-series / metrics      | TimescaleDB (PG ext.)                                                                             | Analytical OLAP scale → ClickHouse                |
| Graph traversal            | PG + recursive CTE / ltree                                                                        | Deep traversal, GraphRAG → Neo4j                  |
| Full-text search           | PG `tsvector`                                                                                     | Complex relevance tuning → OpenSearch/Meilisearch |
| KV / cache / session       | **Redis**                                                                                         | Need persistence + complex indexing → back to PG  |
| Analytics / reporting      | Ship raw data to a warehouse (BigQuery / Snowflake / DuckDB) — don't query prod PG for dashboards |

## Template

Fill [`templates/schema-canvas.md`](./templates/schema-canvas.md) → `docs/schema-canvas.md`.
Write the DB ADR: [`templates/adr.md`](./templates/adr.md) → `docs/adr/0005-database.md`.

## Anti-patterns

- **Mongo to avoid migrations.** You still need migrations — just undocumented ones. And you lose joins + ACID. Be honest about data shape.
- **Skipping pgvector** because "vector DBs are a separate thing" — for <10M vectors it's strictly better to stay in Postgres.
- **Using your primary DB as a queue.** Fine for small scale (LISTEN/NOTIFY, pg_cron) but don't build SQS on top of it.
- **Running analytics on production PG.** Long queries block your OLTP. Ship to a warehouse (BigQuery/Snowflake) or at minimum a read replica.
- **No capacity math.** "Probably fits" ≠ a plan. Write rows × avg size × growth for Year-1 and Year-2.
- **Multi-region day 1.** Single-region is the right V1 for 99% of products.

## Worked example — DocQ

Access patterns (from the canvas):

1. Fetch user by id — R, very high, <10ms → relational index.
2. List user's docs — R, high, <100ms → relational + secondary index.
3. Vector-search top-k chunks for a user — R, high, <200ms p95 → vector, ~1–5M vectors Year-1.
4. Append doc + chunks + embeddings — W, medium → transactional, all-or-nothing.

→ **Pick: Postgres (Supabase) with pgvector + Redis for rate limits and ingestion queue (BullMQ).**

Revisit triggers:

- If we exceed 10M embeddings or p95 > 200ms, migrate vectors to Qdrant.
- If analytics become heavy, add BigQuery via CDC (e.g., PeerDB / Fivetran).

## Next step

→ [04 — Frontend stack decision](./04-frontend-stack.md)
