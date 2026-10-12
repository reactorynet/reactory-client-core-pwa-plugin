/**
 * @jest-environment jsdom
 *
 * Guards the route-editor header/footer slot persistence contract.
 *
 * `normaliseSlot` decides what actually gets stored on the route. It must keep
 * a configured slot, and return `null` for an empty slot so an explicitly
 * cleared slot is removed rather than persisted as `{}` (the server merges the
 * input over the existing route).
 */
import { normaliseSlot } from '../ApplicationRoutesPanel';

describe('normaliseSlot', () => {
  it('returns null for missing / non-object slots', () => {
    expect(normaliseSlot(undefined)).toBeNull();
    expect(normaliseSlot(null)).toBeNull();
    expect(normaliseSlot('nope')).toBeNull();
  });

  it('returns null when the slot carries no configuration', () => {
    expect(normaliseSlot({})).toBeNull();
    expect(normaliseSlot({ show: false, title: '', componentFqn: '' })).toBeNull();
    expect(normaliseSlot({ props: {}, propsMap: {} })).toBeNull();
  });

  it('keeps a slot with a component FQN, normalising the shape', () => {
    expect(normaliseSlot({ componentFqn: 'core.SiteHeader@1.0.0' })).toEqual({
      show: false,
      title: null,
      componentFqn: 'core.SiteHeader@1.0.0',
      props: {},
      propsMap: {},
    });
  });

  it('preserves show, title, props and propsMap', () => {
    expect(
      normaliseSlot({
        show: true,
        title: 'Header',
        componentFqn: 'core.SiteHeader@1.0.0',
        props: { sticky: true },
        propsMap: { 'formContext.props.applicationId': 'applicationId' },
      }),
    ).toEqual({
      show: true,
      title: 'Header',
      componentFqn: 'core.SiteHeader@1.0.0',
      props: { sticky: true },
      propsMap: { 'formContext.props.applicationId': 'applicationId' },
    });
  });

  it('coerces a non-boolean show to a boolean', () => {
    expect(normaliseSlot({ componentFqn: 'x', show: 'yes' })?.show).toBe(true);
  });

  it('ignores non-object props/propsMap', () => {
    const slot = normaliseSlot({ componentFqn: 'x', props: 'nope', propsMap: 5 });
    expect(slot?.props).toEqual({});
    expect(slot?.propsMap).toEqual({});
  });
});
