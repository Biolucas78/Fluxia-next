# Project Context & Rules

## Core Technologies
- **Framework**: Next.js 15+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Database/Auth**: Firebase (Firestore & Auth)
- **Animations**: Framer Motion (`motion/react`)
- **Icons**: Lucide React

## Critical Rules & Conventions

### 1. React 19 / Next 15 Key Prop
- **Issue**: In React 19, `key` is a regular prop. Custom components used in lists must explicitly include `key` in their props interface to avoid TypeScript errors.
- **Action**: Always add `key?: React.Key` to the props interface of components like `KanbanColumn`, `OrderCard`, `SortableOrderCard`, etc.

### 2. Field Naming (Portuguese vs English)
- **Leads**: Use `notas` for general lead comments/notes.
- **Orders**: Use `observations` for order notes (as defined in `lib/types.ts`).
- **Avoid**: Do not use `notes` (English) unless it's part of a specific sub-structure like `productionNotes` in `ProductItem`.

### 3. Firebase Best Practices
- **Error Handling**: Always use the `handleFirestoreError` pattern (defined in `lib/hooks.ts` or similar) to throw JSON-formatted errors for better debugging of security rules.
- **Initialization**: Firebase is initialized in `lib/firebase.ts`. Use the `db` and `auth` exports.
- **Real-time**: Prefer `onSnapshot` for data fetching to keep the UI in sync.

### 4. Type Safety
- **Imports**: Always ensure types like `AnalyticsStats`, `LeadHistory`, `Order`, `Lead`, etc., are imported from `@/lib/types`.
- **Validation**: Use `npx tsc --noEmit` to verify type safety before suggesting a build.

### 5. UI & Design
- **Theme**: Support both light and dark modes using Tailwind's `dark:` prefix.
- **Components**: Polished, modern UI with rounded corners (`rounded-2xl`), subtle borders, and smooth transitions.
- **Scrollbars**: Use the `custom-scrollbar` utility class for overflow containers.

## Recent Fixes
- Fixed `tsconfig.json` to include `@types/node` and set `ignoreDeprecations: "5.0"`.
- Fixed missing imports in `lib/hooks.ts`.
- Added `key` prop to major Kanban and Order components.
