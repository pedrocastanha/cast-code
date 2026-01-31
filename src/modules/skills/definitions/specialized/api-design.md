---
name: api-design
description: REST and GraphQL API design patterns
tools:
  - read_file
  - write_file
  - edit_file
---

# API Design

Specialized knowledge for API design and implementation.

## REST Conventions

### HTTP Methods
- GET: Retrieve resources
- POST: Create resources
- PUT: Replace resources
- PATCH: Partial update
- DELETE: Remove resources

### URL Structure
- `/users` - Collection
- `/users/:id` - Single resource
- `/users/:id/posts` - Nested resource

### Status Codes
- 200: Success
- 201: Created
- 204: No content
- 400: Bad request
- 401: Unauthorized
- 403: Forbidden
- 404: Not found
- 500: Server error

## Response Format
```json
{
  "data": {},
  "meta": { "page": 1, "total": 100 },
  "errors": []
}
```

## Validation
- Validate all inputs at boundaries
- Return clear error messages
- Use schema validation (Zod, Joi)

## Versioning
- URL path: `/api/v1/`
- Header: `Accept: application/vnd.api+json;version=1`
