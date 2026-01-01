# Architect Mode UI/UX Flow

## Understanding the Difference

### Existing Plan/Act Mode (Tabs at Bottom)
- **What it is**: A toggle that changes YOUR Cline instance's behavior
- **How it works**: 
  - Plan mode = Cline thinks but doesn't execute tools
  - Act mode = Cline can execute tools and make changes
- **UI**: Two tabs at bottom, you switch between them
- **Models**: ONE model instance, behavior changes based on mode

### NEW Architect Mode (Two-Model Workflow)
- **What it is**: TWO separate AI models collaborating on your task
- **How it works**:
  - Architect Model (GPT-4, Claude Opus): Plans and reviews
  - Editor Model (GPT-3.5, Claude Haiku): Implements code
  - They work together in iterations
- **UI**: ONE unified chat view showing BOTH models working
- **Models**: TWO models running simultaneously

## The Unified Chat Experience

When Architect Mode is enabled, you'll see everything in **ONE conversation stream**:

```
You: "Add user authentication to the app"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏗️ [Architect Phase: Planning - Iteration 1]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💭 [Architect Thinking]
Let me analyze the codebase structure...
- Current auth: None
- Framework: Express.js
- Best approach: JWT tokens + middleware
...

📋 [Architect Plan]
## Technical Plan

### Phase 1: Core Auth Infrastructure
1. Install dependencies: jsonwebtoken, bcrypt
2. Create auth middleware (src/middleware/auth.ts)
3. Add user model with password hashing

### Phase 2: Auth Endpoints
1. POST /auth/register - User registration
2. POST /auth/login - Login with JWT
3. GET /auth/me - Current user info

### Phase 3: Protected Routes
1. Apply middleware to protected endpoints
2. Add authorization checks

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ [Architect Phase: Implementing - Iteration 1]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 [Editor] Executing tool: execute_command
Command: npm install jsonwebtoken bcrypt
Output: ✓ Packages installed

📝 [Editor] Executing tool: write_to_file
File: src/middleware/auth.ts
Creating authentication middleware...

📝 [Editor] Executing tool: write_to_file
File: src/models/User.ts
Adding User model with password hashing...

📝 [Editor] Executing tool: write_to_file
File: src/routes/auth.ts
Creating auth endpoints...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 [Architect Phase: Evaluating - Iteration 1]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💭 [Architect Review]
Analyzing implementation against plan...
- ✓ Middleware structure correct
- ✓ JWT signing implemented
- ✗ Missing error handling in login endpoint
- ✗ Password validation too weak

❌ [Architect Evaluation: REJECTED]
## Issues Found:

1. **Error Handling**: Login endpoint needs try-catch
2. **Password Validation**: Minimum 8 chars, require special char
3. **Security**: Add rate limiting to auth endpoints

## Required Changes:
- Add comprehensive error handling
- Strengthen password requirements
- Implement rate limiting middleware

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏗️ [Architect Phase: Planning - Iteration 2]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 [Architect Refinement]
## Addressing Issues

1. Enhanced error handling pattern
2. Password validation rules
3. Rate limiting configuration
...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ [Architect Phase: Implementing - Iteration 2]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 [Editor] Executing tool: write_to_file
File: src/routes/auth.ts
Updating with error handling...

📝 [Editor] Executing tool: write_to_file
File: src/utils/validation.ts
Adding password validation...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 [Architect Phase: Evaluating - Iteration 2]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ [Architect Evaluation: APPROVED]
All requirements met. Implementation complete!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 [Architect Mode Complete]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total iterations: 2
Files created: 5
Task status: ✓ Complete
```

## Key UI Elements

### Message Type Indicators
- `🏗️ [Architect Phase]` - Shows what phase we're in (Planning/Implementing/Evaluating)
- `💭 [Architect Thinking]` - Extended reasoning from architect model
- `📋 [Architect Plan]` - Technical implementation plan
- `⚡ [Implementing]` - Editor model executing tools
- `🔍 [Evaluating]` - Architect reviewing the work
- `✅/❌ [Evaluation]` - Approval or rejection with feedback

### Status Badges
- **Planning** (blue) - Architect is designing the solution
- **Implementing** (yellow) - Editor is writing code
- **Evaluating** (purple) - Architect is reviewing
- **Complete** (green) - Task finished
- **Failed** (red) - Max iterations reached

### Progress Tracking
```
Iteration 1/5  [████████░░░░░░░░░░] 40%
Current Phase: Evaluating
```

## How It's Different from Plan/Act Tabs

| Feature | Plan/Act Tabs | Architect Mode |
|---------|---------------|----------------|
| **Number of Models** | 1 | 2 |
| **Your Control** | You switch modes | Automatic collaboration |
| **Chat View** | One chat per mode | Unified chat showing both |
| **Use Case** | Toggle Cline's caution | Complex tasks needing planning + speed |
| **When to Use** | Always available | Enable for complex multi-file tasks |

## Enabling Architect Mode

Once UI is ready, you'll enable it in Settings:

```json
{
  "architectConfig": {
    "enabled": true,
    "architectModel": "gpt-4",
    "editorModel": "gpt-3.5-turbo",
    "maxIterations": 5
  }
}
```

Then just use Cline normally - if enabled, tasks automatically use the two-model workflow!

## Current Status

✅ **Backend Complete** - All integration done, compiles successfully
⏳ **UI Pending** - Need React components to render architect messages
⏳ **Settings UI** - Need settings panel for configuration

The two models will collaborate seamlessly in your chat view once the UI components are built to display the new message types (`architect_phase`, `architect_plan`, etc.).
