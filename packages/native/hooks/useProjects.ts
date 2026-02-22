import { FIXTURE_PROJECTS, type Project } from '../__fixtures__/projects'

// TODO: Replace fixture with TanStack DB live query
// return useLiveQuery((q) =>
//   q.from({ project: projectCollection })
//     .orderBy(({ project }) => desc(project.lastActiveAt))
// )
export function useProjects(): { data: Project[] } {
  const sorted = [...FIXTURE_PROJECTS].sort((a, b) => b.lastActiveAt - a.lastActiveAt)
  return { data: sorted }
}
