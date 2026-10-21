import React from 'react';
import { api } from '@/api';
import { useT } from '@/i18n';
import { NameDialog } from './NameDialog';
import { useToast } from './Toast';

/**
 * A new window in a project: the name is asked for, the folder is made inside the project, and the window is opened
 * as a project of its own. The caller draws `dialog` once and asks for a window with `ask`.
 */
export function useNewWindow(onCreated?: (projectId: string) => void) {
  const t = useT();
  const toast = useToast();
  const [asking, setAsking] = React.useState<{ parent: string; name: string } | null>(null);
  const [count, setCount] = React.useState(2);

  /* the name a window is offered with: the second one, the third, and so on. It is read again each time the dialog
     opens: a window made since the last time is a window more (and its name is taken) */
  React.useEffect(() => {
    if (!asking) return;
    void api.projects().then((list) => setCount(list.filter((p) => p.parentId === asking.parent).length + 2)).catch(() => {});
  }, [asking]);

  const ask = React.useCallback((parent: string, name: string) => setAsking({ parent, name }), []);

  const make = async (name: string) => {
    const parent = asking?.parent;
    setAsking(null);
    if (!parent) return;
    try {
      const made = await api.newWindow(parent, name);
      onCreated?.(made.id);
    } catch (e) {
      /* the server says why (a name taken, the project gone): it is the answer the person needs */
      toast.showError(e instanceof Error ? e.message : String(e));
    }
  };

  const dialog = (
    <NameDialog
      open={!!asking}
      title={t('projectMenu.newWindow')}
      description={asking ? t('projects.newWindowDesc').replace('{name}', asking.name) : undefined}
      initialValue={`${t('projectMenu.newWindowDefault')} ${count}`}
      placeholder={t('projectMenu.newWindowName')}
      confirmLabel={t('confirm.ok')}
      cancelLabel={t('confirm.cancel')}
      onCancel={() => setAsking(null)}
      onConfirm={(name) => void make(name)}
    />
  );

  return { ask, dialog };
}
