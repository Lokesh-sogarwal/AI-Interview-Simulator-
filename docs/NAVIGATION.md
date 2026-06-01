# Hamburger Sidebar Navigation Guide

## Overview
A responsive hamburger sidebar has been integrated into the AI Interview Simulator, providing easy navigation across all pages.

## Features

### Desktop View
- Sidebar is always visible on the left
- Takes up approximately 1/5 of the screen
- Shows full logo, navigation items, and sign-out button
- Clean, organized layout

### Mobile View
- Hamburger menu button in top-left corner (☰)
- Tapping opens/closes a slide-out sidebar from the left
- Semi-transparent overlay when menu is open
- Smooth animations and transitions
- Close button (✕) replaces hamburger when open

### Navigation Items
The sidebar includes quick access to:

| Icon | Page | Link | Purpose |
|------|------|------|---------|
| 🏠 | Home | / | Main dashboard/landing |
| 📄 | Resume Checker | /?action=check-resume | Upload and analyze resume |
| 🎙️ | Interview | /interview/setup | Start interview session |
| 🏆 | Leaderboard | /leaderboard | View global rankings |
| 📊 | History | /history | View history and stats |
| 💬 | Feedback | /feedback | Review interview feedback |

### Active Link Highlighting
- Current page link is highlighted with a subtle background color
- Active links show darker text for better visibility
- Smooth transitions between states

### Sign Out
- Sign-out button positioned at the bottom of the sidebar
- Always accessible for quick logout
- On mobile, visible after other navigation items

## Implementation Details

### Files Modified
1. **app/layout.tsx** - Updated root layout to conditionally show sidebar
2. **app/home/AuthedHome.tsx** - Removed redundant header elements
3. **app/components/Sidebar.tsx** - New sidebar component

### Responsive Breakpoints
- **Mobile** (<768px): Hamburger menu, slide-out sidebar
- **Tablet & Desktop** (≥768px): Always-visible sidebar

### Styling
- Uses Tailwind CSS for responsive design
- Consistent with existing theme colors
- Border and background colors match app design language
- Smooth transitions and hover states

## Code Structure

### Sidebar Component (`Sidebar.tsx`)
```typescript
- useState for menu open/close state
- usePathname to track active routes
- Responsive layout using md: breakpoints
- Navigation items array for easy customization
- isActive function to highlight current page
```

### Layout Integration
```typescript
- Checks if user is authenticated
- Shows sidebar only for authenticated users
- Public pages (login, signup) show normal layout
- Main content grows to fill remaining space
```

## Mobile Experience
1. User opens app on mobile
2. Sees hamburger menu button in top-left
3. Tapping menu opens sidebar from left
4. Overlay makes background darker
5. Can tap any nav item or overlay to close
6. Menu auto-closes after navigation

## Desktop Experience
1. User opens app on desktop
2. Sees sidebar always visible on left
3. Full navigation available at all times
4. Content area takes remaining space
5. No hamburger button needed

## Accessibility Features
- Semantic HTML with `<aside>` and `<nav>` tags
- Keyboard navigation support
- Clear visual indicators for active page
- Button with visible label/icon
- Proper z-index layering

## Future Enhancements
- Collapsible sidebar on desktop (optional)
- Sidebar themes (light/dark)
- Keyboard shortcuts to navigate
- Recently visited pages section
- User profile dropdown
- Notification badge on nav items
- Customizable navigation order

## Customization
To modify navigation items, edit the `navItems` array in `app/components/Sidebar.tsx`:

```typescript
const navItems = [
  { name: "Page Name", href: "/page-path", icon: "📄" },
  // Add more items here
];
```

Each item requires:
- `name`: Display text
- `href`: URL path
- `icon`: Emoji or icon character
