# Approved Patterns: Zaileys

## 1. Registry Pattern (Unified Store)
All memory-resident state should be managed via the `store` singleton.
```typescript
import { store } from '../Store';
const myStore = store.ns('my-feature');
myStore.set('key', value);
```

## 2. Prioritized Background Tasks
Use the `fireForget` engine for tasks that shouldn't block the main event loop.
```typescript
import { fireForget, Priority } from '../Library/fire-forget';
fireForget.add(async () => {
  // task logic
}, { priority: Priority.HIGH });
```

## 3. Class Injection (Proxy)
Extend Client functionality by injecting specialized classes rather than huge inheritance chains.
```typescript
// In Client constructor
const proxy = classInjection(this, [
  new NewFeature(this),
]);
```

## 4. Input Validation
Use `valibot` for all public-facing configurations.
```typescript
import * as v from 'valibot';
const Schema = v.object({...});
const data = parseValibot(Schema, input);
```

## 5. Event Handling
Emit and listen to events via `store.events`.
```typescript
store.events.on('event-name', (data) => {
  // handler
});
```
