---
name: testing-strategies
description: Testing patterns and strategies
tools:
  - read_file
  - write_file
  - edit_file
  - shell
---

# Testing Strategies

Specialized knowledge for test automation.

## Test Types

### Unit Tests
- Test single functions/classes
- Mock dependencies
- Fast execution
- High coverage

### Integration Tests
- Test component interactions
- Use real dependencies when possible
- Test API endpoints
- Database operations

### E2E Tests
- Test user flows
- Browser automation
- Critical paths only
- Slower but comprehensive

## Testing Patterns

### AAA Pattern
```typescript
test('should add numbers', () => {
  // Arrange
  const calculator = new Calculator();

  // Act
  const result = calculator.add(2, 3);

  // Assert
  expect(result).toBe(5);
});
```

### Test Naming
- `should [expected behavior] when [condition]`
- `[method] returns [result] for [input]`

## Mocking
- Mock external services
- Mock time-dependent functions
- Use spies for verification
- Reset mocks between tests

## Coverage Goals
- Statements: 80%+
- Branches: 75%+
- Functions: 90%+
- Critical paths: 100%
