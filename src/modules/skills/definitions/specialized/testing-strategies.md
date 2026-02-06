---
name: testing-strategies
description: Testing patterns and strategies
tools:
  - read_file
  - write_file
  - edit_file
  - shell
---

# Testing Strategies — Domain Knowledge

This skill teaches you how to write effective tests. Study this to learn what to test, how to structure tests, and when to use different testing approaches.

## Testing Pyramid

| Level | Speed | Count | Coverage |
|-------|-------|-------|----------|
| Unit | Fast (ms) | Many | Functions, classes, utils |
| Integration | Medium (s) | Moderate | API routes, DB queries, services |
| E2E | Slow (s-min) | Few | Critical user flows only |

## The AAA Pattern (ALWAYS follow this)

```typescript
test('should [behavior] when [condition]', () => {
  // Arrange — set up the test
  const calculator = new Calculator();

  // Act — perform the action
  const result = calculator.add(2, 3);

  // Assert — verify the result
  expect(result).toBe(5);
});
```

## What to Test (Decision Framework)

| Code type | Test approach | Priority |
|-----------|---------------|----------|
| Pure functions | Unit test with edge cases | HIGH |
| API endpoints | Integration test with real DB | HIGH |
| UI components | Render + interaction tests | MEDIUM |
| Config/setup | Smoke test (does it load?) | LOW |
| External APIs | Mock + contract test | MEDIUM |
| Error paths | Unit test thrown errors | HIGH |

## Test Naming Convention

- `should [expected behavior] when [condition]`
- `[method] returns [result] for [input]`
- `throws [error] when [invalid input]`

## Mocking Rules

| Mock when... | Don't mock when... |
|-------------|-------------------|
| External API calls | Core business logic |
| Database in unit tests | Database in integration tests |
| Time (Date.now, timers) | Simple utility functions |
| Random values | Data transformations |
| File system in CI | File system in integration |

## Running Tests

- `npm test` or `npx jest` — run all tests
- `npm test -- --watch` — watch mode
- `npm test -- --coverage` — coverage report
- `npm test -- path/to/file` — run specific file
- `npx jest --testPathPattern="pattern"` — filter by pattern

## Common Mistakes

1. **Testing implementation, not behavior** — Test WHAT it does, not HOW
2. **Shared mutable state between tests** — Reset in beforeEach
3. **Not testing error cases** — Happy path + error paths
4. **Brittle snapshot tests** — Only snapshot stable, small components
5. **Skipping async cleanup** — Always await and clean up promises/timers
