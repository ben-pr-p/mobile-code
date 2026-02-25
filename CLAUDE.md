## Code style

Exports should always come first in a file, even if it means helper functions, constants, classes, and internal components are defined out of order (after the exports). This applies to both server code and React components. Type/interface exports at the top (before the main exports) are fine. Note: constants used at module evaluation time (e.g., in top-level array/object literals) must still be declared before their first use since `const` is not hoisted.

Never use emoji characters in code or UI. Use text labels or icons from the icon library (lucide-react-native) instead.
