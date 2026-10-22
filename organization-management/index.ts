import Reactory from '@reactorynet/reactory-core';

import OrganizationListPanel from './OrganizationListPanel';
import OrganizationCreatePage from './OrganizationCreatePage';
import OrganizationCreateWizard from './OrganizationCreateWizard';
import OrganizationDetailPanel from './OrganizationDetailPanel';
import OrganizationOverviewTab from './OrganizationOverviewTab';
import OrganizationBrandingTab from './OrganizationBrandingTab';
import OrganizationDemographicsTab from './OrganizationDemographicsTab';
import OrganizationPeopleTab from './OrganizationPeopleTab';
import OrganizationStructureTab from './OrganizationStructureTab';
import OrganizationToolbar from './OrganizationToolbar';
import OrganizationStatusChip from './components/OrganizationStatusChip';
import OrganizationTabPlaceholder from './components/OrganizationTabPlaceholder';
import { ORGANIZATION_TABS, OVERVIEW_TAB_ID } from './organizationTabs';
import useOrganizationList from './hooks/useOrganizationList';
import useOrganizationDetail from './hooks/useOrganizationDetail';
import useOrganizationAdmin, { useDemographicDefinitions } from './hooks/useOrganizationAdmin';
import useOrganizationBranding from './hooks/useOrganizationBranding';
import useOrganizationDemographics from './hooks/useOrganizationDemographics';
import useOrganizationMembers from './hooks/useOrganizationMembers';
import useOrganizationStructure from './hooks/useOrganizationStructure';
import { ORGANIZATION_MESSAGES, translate } from './i18n';

export {
  OrganizationListPanel,
  OrganizationCreatePage,
  OrganizationCreateWizard,
  OrganizationDetailPanel,
  OrganizationOverviewTab,
  OrganizationBrandingTab,
  OrganizationDemographicsTab,
  OrganizationPeopleTab,
  OrganizationStructureTab,
  OrganizationTabPlaceholder,
  OrganizationToolbar,
  OrganizationStatusChip,
  ORGANIZATION_TABS,
  OVERVIEW_TAB_ID,
  useOrganizationList,
  useOrganizationDetail,
  useOrganizationAdmin,
  useOrganizationBranding,
  useOrganizationDemographics,
  useOrganizationMembers,
  useOrganizationStructure,
  useDemographicDefinitions,
  ORGANIZATION_MESSAGES,
  translate,
};

export * from './types';
export * from './graphql';
export * from './demographicDraft';
export * from './organizationStructure';

/**
 * Component registry entries for the organization management surface.
 *
 * Same shape and namespace as `application-management/index.ts`: the runtime
 * resolves these by an exact `nameSpace.name@version` key (see the pwa-client's
 * `componentResolution.ts`), so with `nameSpace: 'reactory'` the resolvable
 * FQNs are:
 *
 *   reactory.OrganizationListPanel@1.0.0
 *   reactory.OrganizationCreatePage@1.0.0
 *   reactory.OrganizationDetailPanel@1.0.0
 *
 * There is no namespace aliasing — a route configured as `core.OrganizationListPanel@1.0.0`
 * would render NotFound. Use the `reactory.` form when wiring routes.
 *
 * `OrganizationCreateWizard` is deliberately **not** registered: it is a
 * controlled dialog requiring `open`/`onClose`, so as a route target it would
 * render a closed dialog (a blank page). `OrganizationCreatePage` is the
 * routable wrapper that owns that state.
 *
 * `OrganizationToolbar` and `OrganizationStatusChip` are children of the list
 * panel, not route targets, and are not registered either.
 *
 * The wizard page is gated to ADMIN because `createOrganization` is ADMIN/SYSTEM
 * server-side; the read panels follow the `USER`/`ADMIN` pattern used by the
 * application panels and rely on the server's org-scoped authorization for the
 * actual data boundary.
 */
export const components: Reactory.Client.IReactoryComponentRegistryEntry<any>[] = [
  {
    nameSpace: 'reactory',
    name: 'OrganizationListPanel',
    version: '1.0.0',
    component: OrganizationListPanel,
    description:
      'Lists organizations with search, status filter, metrics, paging and bulk archive.',
    roles: ['USER', 'ADMIN'],
    tags: ['organization', 'organizations', 'list', 'admin'],
  },
  {
    nameSpace: 'reactory',
    name: 'OrganizationCreatePage',
    version: '1.0.0',
    component: OrganizationCreatePage,
    description:
      'Routable wrapper that opens the four-step organization creation wizard and navigates on close.',
    roles: ['ADMIN'],
    tags: ['organization', 'organizations', 'create', 'wizard', 'admin'],
  },
  {
    nameSpace: 'reactory',
    name: 'OrganizationDetailPanel',
    version: '1.0.0',
    component: OrganizationDetailPanel,
    description:
      'Organization detail shell with an identity header, key metrics and data-driven Overview, Branding, Structure, People, Demographics and Settings tabs.',
    roles: ['USER', 'ADMIN'],
    tags: ['organization', 'organizations', 'detail', 'admin'],
  },
];

export default components;
