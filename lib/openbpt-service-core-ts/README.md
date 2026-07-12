# OpenBPT Service Core

Exports the following function:

```typescript
init(manifest: Manifest, runFunction: (input: ExchangePayload[]) => Promise<ExchangePayload[]>)
```

to be used by OpenBPT Services.

The service core takes care of the communication with the backend and provides helper functions to ensure type safety when working with inputs.
