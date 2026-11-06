import { expect, it } from 'vitest';
import snapshot from './maps-v4.snapshot.json';
import { validateMapConfigV4, normalizeMapConfigV4, toPublicMapConfigV6, isPublicMapConfigV6 } from '@idv-map/shared';

it('keeps the current daily snapshot valid and publishable through the V6 boundary', () => {
  expect(validateMapConfigV4(snapshot)).toEqual({valid:true,errors:[]});
  expect(isPublicMapConfigV6(toPublicMapConfigV6(normalizeMapConfigV4(snapshot),'https://media.test'))).toBe(true);
});
