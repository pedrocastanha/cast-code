---
name: database-operations
description: Database design and query optimization
tools:
  - read_file
  - write_file
  - edit_file
  - shell
---

# Database Operations

Specialized knowledge for database design and operations.

## Schema Design

### Normalization
- 1NF: Atomic values, no repeating groups
- 2NF: No partial dependencies
- 3NF: No transitive dependencies

### When to Denormalize
- Read-heavy workloads
- Reporting queries
- Performance requirements

## Query Optimization

### Indexing
- Index columns used in WHERE
- Index columns used in JOIN
- Consider composite indexes
- Don't over-index (write penalty)

### Common Issues
- N+1 queries: Use eager loading
- Missing indexes: EXPLAIN ANALYZE
- Large result sets: Pagination
- Lock contention: Optimize transactions

## Migrations

### Best Practices
- One change per migration
- Always have rollback
- Test on production-like data
- Handle long-running migrations

### Safe Operations
- Add column (nullable)
- Add index concurrently
- Create new table

### Risky Operations
- Drop column
- Rename column
- Change column type

## ORMs
- Use query builders for complex queries
- Prefer raw SQL for performance critical
- Always log slow queries
