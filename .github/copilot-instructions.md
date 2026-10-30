# Workspace Instructions

- Use TypeScript and the Next.js App Router under `src/app`.
- Keep database access in server-side modules; never expose secrets to client components.
- Store only hashed PIN values in the `User.pin` field, mapped to `pin_hash`.
- Validate and authorize all mutations on the server before persisting data.
- Keep implementation scoped to the phase approved by the user.