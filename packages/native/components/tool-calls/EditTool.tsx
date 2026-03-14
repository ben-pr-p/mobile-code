import React from 'react'
import type { ToolCallProps } from './types'
import { DefaultToolCollapsed, DefaultToolExpanded } from './DefaultTool'

// TODO: Collapsed — file path; Expanded — inline diff of oldString → newString
// Also covers: write, apply_patch
export const EditToolCollapsed = DefaultToolCollapsed
export const EditToolExpanded = DefaultToolExpanded
