import React, { useCallback, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
} from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';

import OrganizationListPanel from '../organization-management/OrganizationListPanel';
import OrganizationDetailPanel from '../organization-management/OrganizationDetailPanel';
import type { Organization } from '../organization-management/types';

export interface ApplicationOrganizationsPanelProps {
  reactory?: Reactory.Client.IReactoryApi;
  formData?: any;
  /**
   * Retained for host compatibility only.
   *
   * Both call sites (the application dashboard's `organizations` tab and the
   * legacy `/organizations/` route) pass it, but the legacy form it was written
   * for never filtered on it: `applicationId` appears only as a prop *type* on
   * `ApplicationOrganizationsToolbar`, and the data set is
   * `CorePagedOrganizations(search)` ≡ `CoreOrganizations(search)`. There is no
   * application-scoped organization relation to filter by, so the panel
   * tolerates the value and ignores it rather than inventing a filter the
   * server cannot serve.
   */
  applicationId?: string;
  /** Retained for host compatibility; the organization panels are not editable shells. */
  mode?: 'view' | 'edit';
}

/**
 * Application organizations surface (ORG-042b).
 *
 * Until this ticket the panel was a shim: it resolved
 * `core.ApplicationOrganizations@1.0.0` — the server form — and rendered that.
 * That delegation is why ORG-042 could not delete the server form. This panel
 * now renders the real organization surface from `organization-management`
 * directly, so the core form no longer has a caller here.
 *
 * Layout
 * ------
 * A thin container over the two panels that already own the behaviour:
 *
 * - `OrganizationListPanel` owns the query, search, status filter, sorting,
 *   paging, archive/restore and the create wizard. Nothing of that is
 *   reimplemented here.
 * - `OrganizationDetailPanel` owns the detail read, the tab shell and the write
 *   affordances.
 *
 * The one thing this container adds is *where* the detail renders. Both call
 * sites must keep the pre-existing behaviour — the list inside the host page
 * and the detail opening **in place**, with no route of its own:
 *
 * | Call site | Behaviour |
 * | --- | --- |
 * | Application dashboard `organizations` tab | list in the tab, detail in the tab |
 * | Legacy `/organizations/` route | list, detail in place |
 *
 * `OrganizationListPanel` navigates to `${basePath}/<id>` on row activation, so
 * the container passes its optional `onSelectOrganization` prop: that hands the
 * row back instead of building a path. Local selection state then decides which
 * panel is shown, and `OrganizationDetailPanel`'s own Back action is wired to
 * `onBack` — so neither panel navigates. No route is added or changed anywhere,
 * and no call site needs to supply a `basePath`.
 *
 * `applicationId` and `mode` are accepted for host compatibility and are not
 * used for filtering (see the prop docs).
 */
export const ApplicationOrganizationsPanel: React.FC<ApplicationOrganizationsPanelProps> = ({
  reactory: propReactory,
  applicationId,
  mode = 'view',
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;

  /** The organization whose detail is open in place; `null` shows the list. */
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);

  const handleSelectOrganization = useCallback((organization: Organization) => {
    setSelectedOrganizationId(organization.id);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedOrganizationId(null);
  }, []);

  // If no Reactory instance is available, show a message.
  if (!reactory) {
    return (
      <Box sx={{ p: 2 }}>
        <Card>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <WarningIcon color="warning" />
            <Typography variant="body2" color="text.secondary">
              No Reactory instance available. Please provide a reactory prop to view organizations.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box
      sx={{ width: '100%', height: '100%' }}
      data-application-id={applicationId}
      data-mode={mode}
    >
      {selectedOrganizationId ? (
        <OrganizationDetailPanel
          reactory={reactory}
          id={selectedOrganizationId}
          onBack={handleBackToList}
        />
      ) : (
        <OrganizationListPanel
          reactory={reactory}
          onSelectOrganization={handleSelectOrganization}
        />
      )}
    </Box>
  );
};

export default ApplicationOrganizationsPanel;
