import React from 'react'
import type { ToolCallProps } from './types'
import { DefaultToolCollapsed, DefaultToolExpanded } from './DefaultTool'

// TODO: Collapsed — search pattern / query; Expanded — list of matching files
// Covers: grep, glob, list
export const SearchToolCollapsed = DefaultToolCollapsed
export const SearchToolExpanded = DefaultToolExpanded
