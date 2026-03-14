/**
 * Tool call component registry.
 *
 * Maps tool names to their collapsed and expanded renderers.
 * To add a new tool: create a `FooTool.tsx` with collapsed/expanded exports,
 * then add the tool name → component mapping here.
 */

import type { ComponentType } from 'react'
import type { ToolCallProps } from './types'
import { DefaultToolCollapsed, DefaultToolExpanded } from './DefaultTool'
import { BashToolCollapsed, BashToolExpanded } from './BashTool'
import { ReadToolCollapsed, ReadToolExpanded } from './ReadTool'
import { EditToolCollapsed, EditToolExpanded } from './EditTool'
import { SearchToolCollapsed, SearchToolExpanded } from './SearchTool'
import { TaskToolCollapsed, TaskToolExpanded } from './TaskTool'
import { WebToolCollapsed, WebToolExpanded } from './WebTool'
import { TodoToolCollapsed, TodoToolExpanded } from './TodoTool'

export type { ToolCallProps } from './types'

interface ToolCallRenderers {
  Collapsed: ComponentType<ToolCallProps>
  Expanded: ComponentType<ToolCallProps>
}

/**
 * Registry mapping tool names to their collapsed/expanded component pair.
 * Tools not listed here fall through to the default renderer.
 */
const registry: Record<string, ToolCallRenderers> = {
  bash:        { Collapsed: BashToolCollapsed,   Expanded: BashToolExpanded },
  read:        { Collapsed: ReadToolCollapsed,   Expanded: ReadToolExpanded },
  edit:        { Collapsed: EditToolCollapsed,   Expanded: EditToolExpanded },
  write:       { Collapsed: EditToolCollapsed,   Expanded: EditToolExpanded },
  apply_patch: { Collapsed: EditToolCollapsed,   Expanded: EditToolExpanded },
  multi_edit:  { Collapsed: EditToolCollapsed,   Expanded: EditToolExpanded },
  grep:        { Collapsed: SearchToolCollapsed, Expanded: SearchToolExpanded },
  glob:        { Collapsed: SearchToolCollapsed, Expanded: SearchToolExpanded },
  list:        { Collapsed: SearchToolCollapsed, Expanded: SearchToolExpanded },
  task:        { Collapsed: TaskToolCollapsed,   Expanded: TaskToolExpanded },
  webfetch:    { Collapsed: WebToolCollapsed,    Expanded: WebToolExpanded },
  websearch:   { Collapsed: WebToolCollapsed,    Expanded: WebToolExpanded },
  codesearch:  { Collapsed: WebToolCollapsed,    Expanded: WebToolExpanded },
  todowrite:   { Collapsed: TodoToolCollapsed,   Expanded: TodoToolExpanded },
}

const defaultRenderers: ToolCallRenderers = {
  Collapsed: DefaultToolCollapsed,
  Expanded: DefaultToolExpanded,
}

/** Look up the collapsed/expanded renderers for a tool name. */
export function getToolRenderers(toolName: string): ToolCallRenderers {
  return registry[toolName] ?? defaultRenderers
}
