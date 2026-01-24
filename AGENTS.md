# AI Agent Guidelines for winston-logstash

## Critical: Backward Compatibility

**BACKWARD COMPATIBILITY IS THE TOP PRIORITY.** This library has been in production for years across many projects. Any breaking change can cause widespread failures.

### Rules

1. **Never remove or rename public APIs** - configuration options, class names, method signatures
2. **Never change default values** - they are part of the API contract
3. **Additive changes only** - new features must be opt-in via new configuration options
4. **Maintain both Winston 2.x and 3.x support** - they have different entry points

## Architecture

### Dual Winston Support

The library supports two Winston versions with separate entry points:

| Winston Version | Entry Point | Base Class |
|-----------------|-------------|------------|
| 2.x | `winston-logstash` (main) | `winston.Transport` |
| 3.x | `winston-logstash/lib/winston-logstash-latest` | `winston-transport` |

**Important:** Changes must work for both versions. Test with both `test-bench/winston-2x` and `test-bench/winston-3x`.

### Core Components

```
src/
├── winston-logstash.ts      # Winston 2.x transport
├── winston-logstash-latest.ts # Winston 3.x transport
├── manager.ts               # Connection lifecycle & log buffering
├── connection.ts            # PlainConnection & SecureConnection
└── types.d.ts               # TypeScript type definitions
```

### Build Process

- Source: TypeScript in `src/`
- Output: JavaScript in `lib/` (compiled via Babel)
- Always run `npm run build` after changes

## Configuration Options

All options in `docs/configuration.md` are part of the public API. When adding new options:

```typescript
// ✅ GOOD - New option with backward-compatible default
{
  new_feature_enable: false  // Default preserves existing behavior
}

// ❌ BAD - Changing existing defaults
{
  max_connect_retries: 10  // Was 4, breaks existing behavior
}
```

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

Integration tests run against a real Logstash instance:

```bash
cd test-bench/logstash && docker compose up -d
cd ../winston-2x && npm test  # Test Winston 2.x
cd ../winston-3x && npm test  # Test Winston 3.x
```

### SSL Test Certificates

Test certificates are in `test/support/ssl/`. If they expire, regenerate with:

```bash
bash test/support/certs-generator.sh
```

Certificates are valid for 10 years (3650 days).

## Common Patterns

### Error Handling

The transport emits errors rather than throwing. Users can subscribe:

```typescript
transport.on('error', (err) => {
  // Handle error
});
```

After `max_connect_retries`, the transport goes silent (`this.silent = true`).

### Connection Management

- `PlainConnection`: Standard TCP socket
- `SecureConnection`: TLS socket with certificate support
- `Manager`: Handles reconnection logic and log buffering

## Pull Request Checklist

- [ ] No breaking changes to public API
- [ ] Works with both Winston 2.x and 3.x
- [ ] Unit tests pass (`npm test`)
- [ ] New configuration options have sensible defaults
- [ ] Types updated in `types.d.ts` if needed
- [ ] Documentation updated if adding features
