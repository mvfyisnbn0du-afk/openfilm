/**
 * Which project a window belongs to: a window is a folder inside a project (a project can hold more than one window,
 * each with a film, a conversation and an agent of its own). The list says so with `parentId` (the server finds it
 * there); this finds the name that goes with it.
 */

/** A project as the list holds it. */
export interface TreeProject {
  id: string;
  path: string;
  name: string;
  /** the project this one is a window of, when it is one */
  parentId?: string;
}

/**
 * The name of the project a window is in, or null when it is a project of its own. The nearest ancestor wins: a window
 * of a window is in the window it is in.
 */
export function parentProjectName(project: TreeProject, projects: readonly TreeProject[]): string | null {
  if (!project.parentId) return null;
  const parent = projects.find((p) => p.id === project.parentId);
  return parent ? parent.name : null;
}

/**
 * The name a new window in a project is offered with: the second one is "Window 2", the next "Window 3" (the project's
 * own name is the first window). The person can type another name; this only saves the typing.
 */
export function windowNameFor(projectId: string, projects: readonly TreeProject[]): number {
  const windows = projects.filter((p) => p.parentId === projectId).length;
  return windows + 2;
}
