import React from 'react';
import {
  AccountTreeOutlined as AccountTreeOutlinedIcon,
  InfoOutlined as InfoOutlinedIcon,
  InsightsOutlined as InsightsOutlinedIcon,
  PaletteOutlined as PaletteOutlinedIcon,
  PeopleOutlined as PeopleOutlinedIcon,
  SettingsOutlined as SettingsOutlinedIcon,
} from '@mui/icons-material';

import OrganizationOverviewTab from './OrganizationOverviewTab';
import OrganizationBrandingTab from './OrganizationBrandingTab';
import OrganizationDemographicsTab from './OrganizationDemographicsTab';
import OrganizationPeopleTab from './OrganizationPeopleTab';
import OrganizationStructureTab from './OrganizationStructureTab';
import OrganizationTabPlaceholder from './components/OrganizationTabPlaceholder';
import type { OrganizationMessageKey } from './i18n';
import type { OrganizationTabDefinition, OrganizationTabProps } from './types';

/** Stable id of the implemented tab; the shell opens on this one. */
export const OVERVIEW_TAB_ID = 'overview';

/**
 * Build a tab component that only states which ticket will implement it.
 *
 * A factory keeps each registry entry a single line and, more importantly,
 * keeps the shell generic: placeholders are ordinary `OrganizationTabProps`
 * components, exactly like the real tabs that replace them.
 */
const placeholderTab = (
  ticket: string,
  descriptionKey: OrganizationMessageKey,
): React.FC<OrganizationTabProps> => {
  const Placeholder: React.FC<OrganizationTabProps> = ({ t }) => (
    <OrganizationTabPlaceholder
      ticket={ticket}
      title={t('reactory.organizations.detail.placeholder.title', { ticket })}
      description={t(descriptionKey)}
    />
  );
  Placeholder.displayName = `OrganizationTabPlaceholder(${ticket})`;
  return Placeholder;
};

/**
 * The organization detail tab registry.
 *
 * **This is the extension point.** A later ticket (ORG-022 structure, ORG-024
 * people, ORG-031 demographics, settings) adds its tab by appending one entry
 * here — `OrganizationDetailPanel` renders whatever this array contains and
 * never needs editing. Order in this array is the order of the tab bar.
 */
export const ORGANIZATION_TABS: OrganizationTabDefinition[] = [
  {
    id: OVERVIEW_TAB_ID,
    labelKey: 'reactory.organizations.detail.tab.overview',
    icon: <InfoOutlinedIcon fontSize="small" />,
    component: OrganizationOverviewTab,
  },
  {
    id: 'branding',
    labelKey: 'reactory.organizations.detail.tab.branding',
    icon: <PaletteOutlinedIcon fontSize="small" />,
    component: OrganizationBrandingTab,
  },
  {
    id: 'structure',
    labelKey: 'reactory.organizations.detail.tab.structure',
    icon: <AccountTreeOutlinedIcon fontSize="small" />,
    // ORG-022 replaced this entry's placeholder; the other placeholder entries
    // and the shell are untouched.
    component: OrganizationStructureTab,
  },
  {
    id: 'people',
    labelKey: 'reactory.organizations.detail.tab.people',
    icon: <PeopleOutlinedIcon fontSize="small" />,
    // ORG-024 replaced this entry's placeholder; the other placeholder entries
    // and the shell are untouched.
    component: OrganizationPeopleTab,
  },
  {
    id: 'demographics',
    labelKey: 'reactory.organizations.detail.tab.demographics',
    icon: <InsightsOutlinedIcon fontSize="small" />,
    // ORG-031 replaced this entry's placeholder; the other placeholder entries
    // and the shell are untouched.
    component: OrganizationDemographicsTab,
  },
  {
    id: 'settings',
    labelKey: 'reactory.organizations.detail.tab.settings',
    icon: <SettingsOutlinedIcon fontSize="small" />,
    component: placeholderTab(
      'ORG-011+',
      'reactory.organizations.detail.tab.settings.placeholder',
    ),
  },
];

/** Look a tab up by id, falling back to the first registered tab. */
export const organizationTabById = (id: string): OrganizationTabDefinition =>
  ORGANIZATION_TABS.find((tab) => tab.id === id) || ORGANIZATION_TABS[0];

export default ORGANIZATION_TABS;
