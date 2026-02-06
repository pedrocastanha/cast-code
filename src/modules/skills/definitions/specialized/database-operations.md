---
name: database-operations
description: Database design and query optimization
tools:
  - read_file
  - write_file
  - edit_file
  - shell
---

# Database Operations — Domain Knowledge

This skill teaches you database design, query optimization, and safe migration practices. Study this to make good data modeling decisions.

## Schema Design Principles

### Normalization Rules
- **1NF**: Atomic values, no repeating groups
- **2NF**: No partial dependencies on composite keys
- **3NF**: No transitive dependencies

### When to Denormalize
| Situation | Denormalize? | Technique |
|-----------|-------------|-----------|
| Read-heavy, write-rare | Yes | Materialized view / computed column |
| Reporting/analytics | Yes | Star schema / denormalized table |
| Real-time dashboard | Yes | Pre-aggregated cache |
| OLTP with consistency needs | No | Keep normalized |

## Query Optimization

### Indexing Decision Framework
| Query pattern | Index type |
|---------------|------------|
| `WHERE col = value` | B-tree index on col |
| `WHERE col1 = X AND col2 = Y` | Composite index (col1, col2) |
| `WHERE col LIKE 'prefix%'` | B-tree (prefix only) |
| `ORDER BY col` | Index on col |
| `WHERE col IN (...)` | B-tree index on col |
| Full-text search | GIN / Full-text index |

### Performance Diagnosis
1. `EXPLAIN ANALYZE` the slow query
2. Look for: Seq Scan (missing index), Nested Loop (N+1), Sort (missing index)
3. Add index → re-explain → verify improvement

### Common Performance Issues
| Problem | Symptom | Fix |
|---------|---------|-----|
| N+1 queries | Many identical queries | Eager loading / JOIN |
| Missing index | Seq Scan on large table | Add appropriate index |
| Over-fetching | SELECT * on wide table | Select specific columns |
| Lock contention | Timeout errors | Shorter transactions |

## Migration Safety

### Safe Operations (can run anytime)
- Add nullable column
- Add index CONCURRENTLY
- Create new table
- Add constraint with NOT VALID

### Dangerous Operations (need careful planning)
| Operation | Risk | Safe approach |
|-----------|------|---------------|
| Drop column | Data loss | Deploy code first, drop later |
| Rename column | Breaks queries | Add new, migrate, drop old |
| Change type | Data corruption | Add new column, backfill, swap |
| Add NOT NULL | Fails on existing nulls | Backfill first, then constrain |

## ORM vs Raw SQL

| Use ORM when... | Use Raw SQL when... |
|-----------------|---------------------|
| Standard CRUD | Complex aggregations |
| Migrations | Performance-critical queries |
| Type safety needed | Database-specific features |
| Rapid prototyping | Bulk operations |
