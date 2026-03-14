import React from 'react'
import type { ToolCallProps } from './types'
import { DefaultToolCollapsed, DefaultToolExpanded } from './DefaultTool'

// TODO: Collapsed — URL or search query; Expanded — fetched content / search results
// Covers: webfetch, websearch, codesearch
export const WebToolCollapsed = DefaultToolCollapsed
export const WebToolExpanded = DefaultToolExpanded
