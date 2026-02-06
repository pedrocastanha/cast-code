---
name: api-design
description: REST and GraphQL API design patterns
tools:
  - read_file
  - write_file
  - edit_file
---

# API Design — Domain Knowledge

This skill teaches you how to design clean, consistent APIs. Study this to learn REST conventions, error handling patterns, and API best practices.

## REST Conventions

### HTTP Methods
| Method | Purpose | Idempotent | Body |
|--------|---------|------------|------|
| GET | Read | Yes | No |
| POST | Create | No | Yes |
| PUT | Replace | Yes | Yes |
| PATCH | Partial update | Yes | Yes |
| DELETE | Remove | Yes | No |

### URL Structure
- `/users` — Collection (GET all, POST create)
- `/users/:id` — Single resource (GET, PUT, PATCH, DELETE)
- `/users/:id/posts` — Nested resource
- Never: `/getUser`, `/createUser` (verbs in URLs)

### Status Codes (Know These)
| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Successful GET, PUT, PATCH |
| 201 | Created | Successful POST |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Validation failure |
| 401 | Unauthorized | Missing/invalid auth |
| 403 | Forbidden | Valid auth, no permission |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate, version mismatch |
| 422 | Unprocessable | Valid syntax, invalid semantics |
| 500 | Server Error | Unexpected failure |

## Response Envelope Pattern

```json
{
  "data": { ... },
  "meta": { "page": 1, "totalPages": 10, "total": 100 },
  "errors": []
}
```

## Error Response Pattern

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Human-readable description",
    "details": [
      { "field": "email", "message": "Invalid format" }
    ]
  }
}
```

## API Design Checklist

1. **Consistent naming** — plural nouns, kebab-case
2. **Pagination** — offset/limit or cursor-based for lists
3. **Filtering** — query params: `?status=active&sort=-created`
4. **Versioning** — URL path `/api/v1/` (simplest)
5. **Auth** — Bearer token in Authorization header
6. **Rate limiting** — Return 429 with Retry-After header
7. **CORS** — Configure allowed origins explicitly

## Common Mistakes

1. **Verbs in URLs** — Use HTTP methods instead
2. **Inconsistent response format** — Always same envelope
3. **200 for errors** — Use proper status codes
4. **No pagination** — Always paginate collections
5. **Leaking internals** — Don't expose DB IDs or stack traces
