/**
 * @jest-environment jsdom
 *
 * Unit contracts for the organization hooks and helpers.
 *
 * The demographics guard is the important one: `OrganizationDemographicDefinitions`
 * does not exist until ORG-030/ORG-031, and a missing query must be reported as
 * "not available yet" rather than surfaced as an error.
 */
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

import { useDemographicDefinitions } from '../hooks/useOrganizationAdmin';
import { useOrganizationDetail } from '../hooks/useOrganizationDetail';
import { sortOrganizations } from '../hooks/useOrganizationList';
import { validateStep, NAME_MAX_LENGTH, DESCRIPTION_MAX_LENGTH } from '../OrganizationCreateWizard';
import { makeOrganization, makeReactory, queryCallsFor } from './testFixtures';
import type { OrganizationCreateDraft } from '../types';

afterEach(cleanup);

const draft = (overrides: Partial<OrganizationCreateDraft> = {}): OrganizationCreateDraft => ({
  name: '',
  code: '',
  tradingName: '',
  description: '',
  branding: 'inherit',
  ...overrides,
});

const Probe: React.FC<{ reactory: any; organizationId?: string | null }> = ({
  reactory,
  organizationId,
}) => {
  const state = useDemographicDefinitions(reactory, organizationId ?? null);
  return <pre data-testid="demographics-state">{JSON.stringify(state)}</pre>;
};

const probeState = () => JSON.parse(screen.getByTestId('demographics-state').textContent || '{}');

describe('validateStep', () => {
  it('requires a name on the identity step', () => {
    expect(validateStep(0, draft({ name: '   ' }))).toEqual({
      name: { key: 'reactory.organizations.wizard.field.nameRequired' },
    });
  });

  it('caps the name and description lengths', () => {
    const errors = validateStep(
      0,
      draft({ name: 'a'.repeat(NAME_MAX_LENGTH + 1), description: 'd'.repeat(DESCRIPTION_MAX_LENGTH + 1) }),
    );

    expect(errors.name?.key).toBe('reactory.organizations.wizard.field.nameTooLong');
    expect(errors.name?.values).toEqual({ max: NAME_MAX_LENGTH });
    expect(errors.description?.key).toBe('reactory.organizations.wizard.field.descriptionTooLong');
  });

  it('accepts an integration-friendly code and rejects anything else', () => {
    expect(validateStep(0, draft({ name: 'Acme', code: 'ACME_01.eu-west' }))).toEqual({});
    expect(validateStep(0, draft({ name: 'Acme', code: 'ACME 01' })).code?.key).toBe(
      'reactory.organizations.wizard.field.codeInvalid',
    );
  });

  it('only accepts a known branding choice', () => {
    expect(validateStep(1, draft({ name: 'Acme', branding: 'inherit' }))).toEqual({});
    expect(validateStep(1, draft({ name: 'Acme', branding: 'blank' }))).toEqual({});
    expect(
      validateStep(1, draft({ name: 'Acme', branding: 'custom' as any })).branding?.key,
    ).toBe('reactory.organizations.wizard.branding.required');
  });

  it('has nothing to validate on the demographics and review steps', () => {
    expect(validateStep(2, draft())).toEqual({});
    expect(validateStep(3, draft())).toEqual({});
  });
});

describe('sortOrganizations', () => {
  it('sorts by name in both directions and keeps empty values last', () => {
    const organizations = [
      makeOrganization({ id: 'b', name: 'Beta', code: 'B' }),
      makeOrganization({ id: 'a', name: 'Acme', code: null }),
      makeOrganization({ id: 'c', name: 'Gamma', code: 'G' }),
    ];

    expect(
      sortOrganizations(organizations, { field: 'name', direction: 'asc' }).map((entry) => entry.id),
    ).toEqual(['a', 'b', 'c']);

    expect(
      sortOrganizations(organizations, { field: 'name', direction: 'desc' }).map((entry) => entry.id),
    ).toEqual(['c', 'b', 'a']);

    expect(
      sortOrganizations(organizations, { field: 'code', direction: 'asc' }).map((entry) => entry.id),
    ).toEqual(['b', 'c', 'a']);
  });

  it('sorts by status, theme and the updated timestamp', () => {
    const organizations = [
      makeOrganization({ id: 'b', status: 'suspended', theme: 'Zeta', updatedAt: 1000 }),
      makeOrganization({ id: 'a', status: 'active', theme: 'Alpha', updatedAt: 3000 }),
      makeOrganization({ id: 'c', status: 'archived', theme: '', updatedAt: 2000 }),
    ];

    expect(
      sortOrganizations(organizations, { field: 'status', direction: 'asc' }).map((e) => e.id),
    ).toEqual(['a', 'c', 'b']);
    expect(
      sortOrganizations(organizations, { field: 'theme', direction: 'asc' }).map((e) => e.id),
    ).toEqual(['a', 'b', 'c']);
    expect(
      sortOrganizations(organizations, { field: 'updatedAt', direction: 'asc' }).map((e) => e.id),
    ).toEqual(['b', 'c', 'a']);
    expect(
      sortOrganizations(organizations, { field: 'tradingName', direction: 'asc' }).length,
    ).toBe(3);
  });

  it('sorts by the embedded business-unit count', () => {
    const organizations = [
      makeOrganization({ id: 'few', businessUnits: [{ id: 'x' }] }),
      makeOrganization({ id: 'none', businessUnits: [] }),
      makeOrganization({ id: 'many', businessUnits: [{ id: 'x' }, { id: 'y' }, { id: 'z' }] }),
    ];

    expect(
      sortOrganizations(organizations, { field: 'businessUnits', direction: 'asc' }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['none', 'few', 'many']);
  });
});

const DetailProbe: React.FC<{ reactory: any; organizationId?: string | null }> = ({
  reactory,
  organizationId,
}) => {
  const state = useOrganizationDetail({ reactory, organizationId: organizationId ?? null });
  return (
    <pre data-testid="detail-state">
      {JSON.stringify({
        name: state.organization ? state.organization.name : null,
        statistics: state.statistics,
        loadState: state.loadState,
        error: state.error,
      })}
    </pre>
  );
};

const detailState = () => JSON.parse(screen.getByTestId('detail-state').textContent || '{}');

describe('useOrganizationDetail', () => {
  it('loads the organization and its counts', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization({ id: 'org-1' })],
      statistics: { 'org-1': { members: 4, businessUnits: 2, teams: 1 } },
    });

    render(<DetailProbe reactory={reactory} organizationId="org-1" />);

    await waitFor(() => expect(detailState().loadState).toBe('success'));
    expect(detailState().name).toBe('Acme Holdings');
    await waitFor(() => expect(detailState().statistics).toEqual({ members: 4, businessUnits: 2, teams: 1 }));
    expect(detailState().error).toBeNull();
  });

  it('reports a missing organization as a successful empty read', async () => {
    const reactory = makeReactory({ organizations: [] });

    render(<DetailProbe reactory={reactory} organizationId="missing" />);

    await waitFor(() => expect(detailState().loadState).toBe('success'));
    expect(detailState().name).toBeNull();
    // No counts query for an organization that does not exist.
    expect(queryCallsFor(reactory, 'OrganizationStatistics')).toHaveLength(0);
  });

  it('surfaces a query failure as an i18n key plus the server message', async () => {
    const reactory = makeReactory({
      queryImpl: (operation) =>
        operation === 'CoreOrganization'
          ? { data: null, errors: [{ message: 'Organization not found' }] }
          : undefined,
    });

    render(<DetailProbe reactory={reactory} organizationId="org-1" />);

    await waitFor(() => expect(detailState().loadState).toBe('error'));
    expect(detailState().error).toEqual({
      key: 'reactory.organizations.error.detailLoadFailed',
      serverMessage: 'Organization not found',
    });
  });

  it('reports an unavailable API instead of querying', async () => {
    render(<DetailProbe reactory={{}} organizationId="org-1" />);

    await waitFor(() => expect(detailState().loadState).toBe('error'));
    expect(detailState().error).toEqual({
      key: 'reactory.organizations.error.apiUnavailable',
    });
  });

  it('reports a transport failure with the thrown message', async () => {
    const reactory = {
      graphqlQuery: jest.fn(() => {
        throw new Error('network down');
      }),
    };

    render(<DetailProbe reactory={reactory} organizationId="org-1" />);

    await waitFor(() => expect(detailState().loadState).toBe('error'));
    expect(detailState().error).toEqual({
      key: 'reactory.organizations.error.detailLoadFailed',
      serverMessage: 'network down',
    });
  });

  it('treats a route with no id as an empty read and issues no query', async () => {
    const reactory = makeReactory({ organizations: [makeOrganization()] });

    render(<DetailProbe reactory={reactory} organizationId={null} />);

    await waitFor(() => expect(detailState().loadState).toBe('success'));
    expect(detailState().name).toBeNull();
    expect(reactory.graphqlQuery).not.toHaveBeenCalled();
  });
});

describe('useDemographicDefinitions', () => {
  it('resolves to "no organization" without issuing a query during creation', () => {
    const reactory = makeReactory();

    render(<Probe reactory={reactory} organizationId={null} />);

    expect(probeState()).toEqual({ status: 'unavailable', reason: 'no-organization' });
    expect(reactory.graphqlQuery).not.toHaveBeenCalled();
  });

  it('classifies a schema-level rejection as "not implemented"', async () => {
    const reactory = makeReactory();

    render(<Probe reactory={reactory} organizationId="org-1" />);

    await waitFor(() => expect(probeState().status).toBe('unavailable'));
    expect(probeState().reason).toBe('not-implemented');
    expect(probeState().message).toMatch(/Cannot query field/);
  });

  it('returns the definitions once the API exists', async () => {
    const reactory = makeReactory({
      queryImpl: (operation) =>
        operation === 'OrganizationDemographicDefinitions'
          ? { data: { OrganizationDemographicDefinitions: [{ id: 'def-1', key: 'age' }] }, errors: [] }
          : undefined,
    });

    render(<Probe reactory={reactory} organizationId="org-1" />);

    await waitFor(() => expect(probeState().status).toBe('available'));
    expect(probeState().definitions).toHaveLength(1);
  });

  it('reports a transport failure as an error rather than swallowing it', async () => {
    const reactory = makeReactory({
      queryImpl: (operation) => {
        if (operation !== 'OrganizationDemographicDefinitions') return undefined;
        return { data: null, errors: [{ message: 'Service unavailable' }] };
      },
    });

    render(<Probe reactory={reactory} organizationId="org-1" />);

    await waitFor(() => expect(probeState().status).toBe('unavailable'));
    expect(probeState().reason).toBe('error');
    expect(probeState().message).toBe('Service unavailable');
  });
});
