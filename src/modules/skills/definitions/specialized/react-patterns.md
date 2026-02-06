---
name: react-patterns
description: React component patterns and best practices
tools:
  - read_file
  - write_file
  - edit_file
---

# React Patterns — Domain Knowledge

This skill teaches you React best practices, component architecture, and performance patterns. Study this to write idiomatic React code.

## Component Architecture Decision Tree

| Need | Pattern | Why |
|------|---------|-----|
| Simple display | Functional component | No state needed |
| Local state | useState/useReducer | Component-level reactivity |
| Shared state | Context + useContext | Cross-component without prop drilling |
| Server data | React Query / SWR | Cache, refetch, loading states |
| Side effects | useEffect with cleanup | Subscriptions, timers, API calls |
| Reusable logic | Custom hooks | Extract and share behavior |

## Component Patterns

### Functional Components (always prefer)
```tsx
interface Props {
  title: string;
  onClick?: () => void;
}

export function MyComponent({ title, onClick }: Props) {
  return <button onClick={onClick}>{title}</button>;
}
```

### Custom Hooks (extract reusable logic)
```tsx
function useCounter(initial = 0) {
  const [count, setCount] = useState(initial);
  const increment = useCallback(() => setCount(c => c + 1), []);
  return { count, increment };
}
```

### Composition over Inheritance
- Use `children` prop for flexible layouts
- Use render props for shared behavior
- Use compound components for related UI (Tabs/Tab, Select/Option)

## Performance Rules

| Problem | Solution | When |
|---------|----------|------|
| Expensive calc re-runs | `useMemo(() => calc, [deps])` | calc takes >1ms |
| Callback causes re-render | `useCallback(fn, [deps])` | Passed to memoized child |
| Component re-renders unnecessarily | `React.memo(Component)` | Props rarely change |
| Large bundle | `React.lazy(() => import(...))` | Route-level splitting |
| Long list | Virtualization (react-window) | 100+ items |

## Anti-Patterns to Avoid

1. **State for derived data** — Compute from existing state instead of storing separately
2. **useEffect for transforms** — Transform during render, not in effects
3. **Index as key** — Use stable IDs from data, not array index
4. **Nested ternaries in JSX** — Extract to variables or early returns
5. **Prop drilling 3+ levels** — Use Context or composition

## Accessibility Checklist

- Semantic HTML (`button` not `div onClick`)
- ARIA labels for icon-only buttons
- Keyboard navigation (Tab, Enter, Escape)
- Focus management after modals/dialogs
- Color contrast (4.5:1 minimum)
