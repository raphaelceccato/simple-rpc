# simple-rpc

> ✨ A lightweight, TypeScript-first RPC library with nested routers, middlewares, Zod validation, and a built-in HTTP server.

## 🚀 Features

- ✅ **Fully typed** router/procedure API with complete TypeScript support
- ✅ **Input/output validation** via [Zod](https://zod.dev) schemas
- ✅ **Middleware system** with context, response, and next function
- ✅ **Nested routers** for organizing complex APIs (`auth.user.login`)
- ✅ **Built-in HTTP server** with zero external dependencies
- ✅ **Custom error handling** with `RPCError(code, message, payload?)`
- ✅ **Context passing** for request-scoped data (auth, headers, etc.)

## 📦 Installation

```bash
npm install @raphaelceccato/simple-rpc zod
```

## 🚀 Quick Start

```typescript
import { createRouter, procedure, startRpcServer } from "simple-rpc";
import { z } from "zod";

// Define your API procedures
const appRouter = createRouter({
  auth: createRouter({
    login: procedure()
      .input(z.object({ 
        username: z.string(), 
        password: z.string() 
      }))
      .output(z.object({ 
        success: z.boolean(), 
        token: z.string().optional() 
      }))
      .implement(async (ctx, { username, password }, res) => {
        // Your authentication logic here
        if (username === "admin" && password === "secret") {
          res.setHeader("X-Auth-Token", "generated-token");
          return { success: true, token: "jwt-token-here" };
        }
        return { success: false };
      })
  }),
  
  user: createRouter({
    profile: procedure()
      .input(z.object({ userId: z.string() }))
      .output(z.object({
        id: z.string(),
        name: z.string(),
        email: z.string()
      }))
      .implement(async (ctx, { userId }) => {
        // Fetch user profile
        return {
          id: userId,
          name: "John Doe",
          email: "john@example.com"
        };
      })
  })
});

// Start the server
startRpcServer({ 
  port: 3000, 
  router: appRouter 
});
```

## 📖 Core Concepts

### Procedures

Procedures are the building blocks of your RPC API. Each procedure defines:
- **Input schema**: Validates incoming data
- **Output schema**: Validates returned data
- **Implementation**: The actual business logic

```typescript
import { procedure } from "simple-rpc";
import { z } from "zod";

const getUserProcedure = procedure()
  .input(z.object({
    id: z.string().uuid(),
    includeDetails: z.boolean().optional()
  }))
  .output(z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    details: z.record(z.any()).optional()
  }))
  .implement(async (ctx, input, res) => {
    // ctx: Context object (passed from client or middleware)
    // input: Validated input matching the input schema
    // res: Response object for setting headers/status
    
    const user = await findUserById(input.id);
    
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      details: input.includeDetails ? user.details : undefined
    };
  });
```

### Routers

Routers organize procedures into namespaces and enable nested routing:

```typescript
import { createRouter } from "simple-rpc";

const userRouter = createRouter({
  get: getUserProcedure,
  create: createUserProcedure,
  update: updateUserProcedure,
  delete: deleteUserProcedure
});

const adminRouter = createRouter({
  users: userRouter,
  settings: createRouter({
    get: getSettingsProcedure,
    update: updateSettingsProcedure
  })
});

const appRouter = createRouter({
  public: publicRouter,
  admin: adminRouter
});
```

This creates endpoints like:
- `POST /rpc/public/auth/login`
- `POST /rpc/admin/users/get`
- `POST /rpc/admin/settings/update`

### Context & Middleware

Context is a way to pass request-scoped data through your RPC calls. Middleware can modify context and implement cross-cutting concerns:

```typescript
// Authentication middleware
const authMiddleware = async (ctx: any, input: any, res: ResponseLike, next: () => Promise<any>) => {
  const token = ctx.headers?.authorization?.replace('Bearer ', '');
  
  if (!token) {
    throw new RPCError(401, "Authentication required");
  }
  
  try {
    const user = await verifyToken(token);
    ctx.user = user; // Add user to context
  } catch (error) {
    throw new RPCError(401, "Invalid token");
  }
  
  return next(); // Continue to next middleware or procedure
};

// Apply middleware to router
const protectedRouter = createRouter({
  profile: getUserProfileProcedure,
  updateProfile: updateProfileProcedure
}).use(authMiddleware);

// Or apply to specific procedures
const updateProfileProcedure = procedure()
  .input(z.object({ name: z.string(), email: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .implement(async (ctx, input) => {
    // ctx.user is now available thanks to authMiddleware
    const userId = ctx.user.id;
    await updateUser(userId, input);
    return { success: true };
  });
```

### Error Handling

Use `RPCError` for structured error responses:

```typescript
import { RPCError } from "simple-rpc";

const deleteUserProcedure = procedure()
  .input(z.object({ id: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .implement(async (ctx, { id }) => {
    const user = await findUserById(id);
    
    if (!user) {
      throw new RPCError(404, "User not found", { userId: id });
    }
    
    if (!ctx.user.isAdmin) {
      throw new RPCError(403, "Insufficient permissions", { 
        required: "admin",
        current: ctx.user.role 
      });
    }
    
    await deleteUser(id);
    return { success: true };
  });
```

## 🌐 HTTP API

### Request Format

All RPC calls are made via POST requests to `/rpc/{namespace}/{method}`:

```bash
POST /rpc/auth/login
Content-Type: application/json

{
  "input": {
    "username": "admin",
    "password": "secret"
  },
  "context": {
    "headers": {
      "authorization": "Bearer token123",
      "user-agent": "MyApp/1.0"
    },
    "sessionId": "sess_123"
  }
}
```

### Response Format

#### Success Response
```json
{
  "result": {
    "success": true,
    "token": "jwt-token-here"
  }
}
```

#### Error Response
```json
{
  "error": {
    "code": 401,
    "message": "Authentication required",
    "payload": {
      "reason": "missing_token"
    }
  }
}
```

## 🔧 Advanced Usage

### Custom Response Headers

```typescript
const downloadProcedure = procedure()
  .input(z.object({ fileId: z.string() }))
  .output(z.object({ data: z.string(), filename: z.string() }))
  .implement(async (ctx, { fileId }, res) => {
    const file = await getFile(fileId);
    
    // Set custom headers
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('Content-Type', file.mimeType);
    
    return {
      data: file.base64Data,
      filename: file.name
    };
  });
```

### Multiple Middleware

```typescript
const loggerMiddleware = async (ctx: any, input: any, res: ResponseLike, next: () => Promise<any>) => {
  console.log(`RPC Call: ${ctx.method} at ${new Date().toISOString()}`);
  const result = await next();
  console.log(`RPC Result: ${JSON.stringify(result)}`);
  return result;
};

const rateLimitMiddleware = async (ctx: any, input: any, res: ResponseLike, next: () => Promise<any>) => {
  const ip = ctx.headers['x-forwarded-for'] || ctx.headers['x-real-ip'] || 'unknown';
  
  if (await isRateLimited(ip)) {
    throw new RPCError(429, "Too many requests");
  }
  
  return next();
};

// Apply multiple middleware in order
const apiRouter = createRouter({
  users: userRouter,
  posts: postRouter
})
.use(rateLimitMiddleware)  // Applied first
.use(loggerMiddleware)     // Applied second
.use(authMiddleware);      // Applied third
```

### Complex Nested Routing

```typescript
const apiRouter = createRouter({
  v1: createRouter({
    auth: createRouter({
      local: createRouter({
        login: localLoginProcedure,
        register: localRegisterProcedure
      }),
      oauth: createRouter({
        google: googleOAuthProcedure,
        github: githubOAuthProcedure
      })
    }),
    users: createRouter({
      profile: createRouter({
        get: getProfileProcedure,
        update: updateProfileProcedure,
        avatar: createRouter({
          upload: uploadAvatarProcedure,
          delete: deleteAvatarProcedure
        })
      })
    })
  })
});

// Creates endpoints like:
// POST /rpc/v1/auth/local/login
// POST /rpc/v1/auth/oauth/google
// POST /rpc/v1/users/profile/avatar/upload
```

### Server Configuration

```typescript
import { startRpcServer } from "simple-rpc";

const server = startRpcServer({
  port: process.env.PORT || 3000,
  router: appRouter
});

// Server provides a standard Node.js HTTP server
server.on('listening', () => {
  console.log('RPC Server started successfully');
});

server.on('error', (error) => {
  console.error('Server error:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Server closed');
  });
});
```

## 🧪 Client Usage Examples

### JavaScript/TypeScript Client

```typescript
// Simple fetch-based client
async function callRPC(method: string, input: any, context?: any) {
  const response = await fetch(`http://localhost:3000/rpc/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input, context })
  });
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`RPC Error ${data.error.code}: ${data.error.message}`);
  }
  
  return data.result;
}

// Usage
try {
  const result = await callRPC('auth/login', {
    username: 'admin',
    password: 'secret'
  }, {
    headers: { 'user-agent': 'MyApp/1.0' }
  });
  
  console.log('Login successful:', result);
} catch (error) {
  console.error('Login failed:', error.message);
}
```

### cURL Examples

```bash
# Login
curl -X POST http://localhost:3000/rpc/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "username": "admin",
      "password": "secret"
    },
    "context": {
      "headers": {
        "user-agent": "curl/7.68.0"
      }
    }
  }'

# Get user profile (with auth)
curl -X POST http://localhost:3000/rpc/user/profile \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "userId": "123"
    },
    "context": {
      "headers": {
        "authorization": "Bearer jwt-token-here"
      }
    }
  }'
```

## 🔍 TypeScript Integration

The library provides full TypeScript support with automatic type inference:

```typescript
// Router types are automatically inferred
type AppRouter = typeof appRouter;

// Procedure input/output types are derived from Zod schemas
type LoginInput = z.infer<typeof loginProcedure['inputSchema']>;
type LoginOutput = z.infer<typeof loginProcedure['outputSchema']>;

// Context typing
interface AuthContext {
  user?: {
    id: string;
    role: string;
    permissions: string[];
  };
  headers: Record<string, string>;
}

const typedProcedure = procedure()
  .input(z.object({ message: z.string() }))
  .output(z.object({ echo: z.string() }))
  .implement(async (ctx: AuthContext, input, res) => {
    // ctx is now properly typed
    const userId = ctx.user?.id || 'anonymous';
    return { echo: `${userId} says: ${input.message}` };
  });
```

## 🧪 Testing

```typescript
import { createRouter, procedure } from "simple-rpc";
import { z } from "zod";

describe('RPC Procedures', () => {
  const testRouter = createRouter({
    echo: procedure()
      .input(z.object({ message: z.string() }))
      .output(z.object({ result: z.string() }))
      .implement(async (ctx, input) => ({
        result: `Echo: ${input.message}`
      }))
  });

  test('should echo message', async () => {
    const mockRes = {
      setHeader: jest.fn(),
      status: jest.fn()
    };

    const result = await testRouter.call(
      {}, // context
      'echo', // method path
      { message: 'Hello World' }, // input
      mockRes // response
    );

    expect(result).toEqual({ result: 'Echo: Hello World' });
  });
});
```

## 🚀 Production Considerations

### Environment Variables

```typescript
const server = startRpcServer({
  port: parseInt(process.env.RPC_PORT || '3000'),
  router: appRouter
});
```

### Logging and Monitoring

```typescript
const requestLoggerMiddleware = async (ctx: any, input: any, res: ResponseLike, next: () => Promise<any>) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);
  
  console.log(`[${requestId}] RPC ${ctx.method} started`, {
    method: ctx.method,
    input: JSON.stringify(input),
    context: ctx
  });
  
  try {
    const result = await next();
    const duration = Date.now() - startTime;
    
    console.log(`[${requestId}] RPC ${ctx.method} completed in ${duration}ms`, {
      method: ctx.method,
      duration,
      success: true
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.error(`[${requestId}] RPC ${ctx.method} failed in ${duration}ms`, {
      method: ctx.method,
      duration,
      error: error.message,
      success: false
    });
    
    throw error;
  }
};
```

### CORS Support

Since simple-rpc provides a basic HTTP server, you may need to add CORS support for browser clients:

```typescript
// You'll need to extend the server or use a reverse proxy like nginx
// Or implement CORS middleware within your procedures
const corsMiddleware = async (ctx: any, input: any, res: ResponseLike, next: () => Promise<any>) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  return next();
};
```

## 🧾 API Reference

### Core Functions

#### `procedure()`
Creates a new procedure builder.

#### `createRouter(routes)`
Creates a new router with the given routes.

#### `startRpcServer(options)`
Starts an HTTP server with RPC handling.
- `options.port`: Server port (default: 3000)
- `options.router`: The main router instance

### Classes

#### `RPCError<TPayload>`
Custom error class for RPC errors.
- `constructor(code: number, message: string, payload?: TPayload)`
- `code`: HTTP status code
- `message`: Error message
- `payload`: Optional additional error data

#### `Router<T, C>`
Router class for organizing procedures.
- `use(middleware)`: Add middleware to the router
- `call(ctx, path, input, res)`: Call a procedure by path

#### `Procedure<I, O, C>`
Procedure class representing a single RPC endpoint.
- `call(ctx, input, res)`: Execute the procedure

### Types

#### `Middleware<C>`
```typescript
type Middleware<C = any> = (
  ctx: C,
  input: any,
  res: ResponseLike,
  next: () => Promise<any>
) => Promise<any>;
```

#### `ResponseLike`
```typescript
interface ResponseLike {
  setHeader(key: string, value: string): void;
  status?(code: number): void;
}
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📄 License

MIT © [Raphael Ceccato Pauli](LICENSE.md)