---
name: react-patterns
description: React component patterns and best practices
tools:
  - read_file
  - write_file
  - edit_file
---

# React Patterns

Specialized knowledge for React development.

## Component Patterns

### Functional Components
```tsx
interface Props {
  title: string;
  onClick?: () => void;
}

export function MyComponent({ title, onClick }: Props) {
  return <button onClick={onClick}>{title}</button>;
}
```

### Custom Hooks
```tsx
function useCounter(initial = 0) {
  const [count, setCount] = useState(initial);
  const increment = useCallback(() => setCount(c => c + 1), []);
  return { count, increment };
}
```

## State Management
- Local state: useState for component-specific
- Shared state: Context or state library
- Server state: React Query or SWR

## Performance
- Memoize expensive computations: useMemo
- Memoize callbacks: useCallback
- Memoize components: React.memo
- Lazy load routes and heavy components

## Accessibility
- Use semantic HTML elements
- Add ARIA labels when needed
- Ensure keyboard navigation
- Maintain focus management
